"""Application factory and global error handling.

Citizens never see a stack trace or a raw exception message. Every unhandled
error becomes a calm page in their language; the detail goes to the structured
log with a correlation id they can quote to support.
"""

from __future__ import annotations

import logging
import sys
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.api import v1 as api_v1
from app.config import BASE_DIR, get_settings
from app.db import create_all, get_db
from app.security.headers import SecurityHeadersMiddleware
from app.web import dash, public
from app.web.deps import page_context, templates

logger = logging.getLogger("peace")


def configure_logging(debug: bool) -> None:
    """Structured-ish logging to stdout, which is what a container wants."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s",'
            '"message":"%(message)s"}',
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
    )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.DEBUG if debug else logging.INFO)
    # Access logs duplicate what the reverse proxy records, and the HTTP/asyncio
    # libraries are chatty at DEBUG without telling us anything about the app.
    for noisy in ("uvicorn.access", "httpx", "httpcore", "asyncio", "multipart"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.debug)

    app = FastAPI(
        title="Peace Emergency Digital Information Platform",
        version=__version__,
        # The interactive docs are a production attack surface with no benefit
        # to citizens; they stay in development only.
        docs_url="/api/docs" if not settings.is_production else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if not settings.is_production else None,
    )

    app.add_middleware(SecurityHeadersMiddleware)

    if settings.cors_origin_list:
        from fastapi.middleware.cors import CORSMiddleware

        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origin_list,
            allow_credentials=True,
            allow_methods=["GET", "POST"],
            allow_headers=["Content-Type", "X-CSRF-Token"],
        )

    static_dir = BASE_DIR / "app" / "static"
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    app.include_router(api_v1.router)
    app.include_router(dash.router)
    app.include_router(public.router)

    _register_error_handlers(app)

    @app.on_event("startup")
    def _startup() -> None:
        create_all()
        logger.info(
            "startup env=%s demo=%s db=%s",
            settings.app_env,
            settings.demo_mode,
            settings.database_url.split("://")[0],
        )

    @app.get("/health", include_in_schema=False)
    def health():
        return {"status": "ok", "version": __version__}

    @app.get("/favicon.ico", include_in_schema=False)
    def favicon():
        return RedirectResponse("/static/favicon.svg", status_code=301)

    return app


def _register_error_handlers(app: FastAPI) -> None:
    def _wants_json(request: Request) -> bool:
        return request.url.path.startswith("/api/") or "application/json" in request.headers.get(
            "accept", ""
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> Response:
        # A 303 raised by the auth dependency is a redirect, not an error.
        if exc.status_code in (301, 302, 303, 307, 308) and exc.headers:
            location = exc.headers.get("Location")
            if location:
                return RedirectResponse(location, status_code=exc.status_code)

        if _wants_json(request):
            return JSONResponse(
                {"detail": exc.detail}, status_code=exc.status_code, headers=exc.headers
            )

        message_key = {
            403: "ui.forbidden",
            404: "ui.notfound",
            429: "ui.ratelimited",
        }.get(exc.status_code, "ui.error")

        with next(get_db()) as db:  # type: ignore[misc]
            context = page_context(
                request, db, title_key=message_key, message_key=message_key
            )
        return templates.TemplateResponse(
            request,
            "public/message.html",
            context,
            status_code=exc.status_code,
            headers=exc.headers,
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> Response:
        incident = uuid.uuid4().hex[:12]
        logger.exception("unhandled incident=%s path=%s", incident, request.url.path)

        if _wants_json(request):
            return JSONResponse(
                {"detail": "Internal server error", "incident": incident}, status_code=500
            )

        try:
            with next(get_db()) as db:  # type: ignore[misc]
                context = page_context(
                    request,
                    db,
                    title_key="ui.servererror",
                    message_key="ui.servererror",
                    incident=incident,
                )
            return templates.TemplateResponse(
                request, "public/message.html", context, status_code=500
            )
        except Exception:  # noqa: BLE001 - the DB itself may be the failure
            return HTMLResponse(
                "<!doctype html><html lang='ar' dir='rtl'><meta charset='utf-8'>"
                "<title>خطأ مؤقت</title>"
                "<p>حدث خلل مؤقت. يرجى المحاولة بعد قليل.</p>"
                f"<p><small>{incident}</small></p></html>",
                status_code=500,
            )


app = create_app()
