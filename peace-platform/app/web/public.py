"""Public citizen portal (server-rendered).

Every form here works with JavaScript disabled: the POST handlers render a full
page. ``static/js/app.js`` layers progressive enhancement on top, calling the
JSON API and updating in place — but nothing depends on it. On a degraded
network that is the difference between a usable site and a blank one.
"""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session as DbSession

from app.ai import assistant as assistant_service
from app.db import get_db
from app.models import GuidancePhase, Importance, UpdateCategory
from app.security.ratelimit import RateLimited, check as rate_check
from app.services import directory as directory_service
from app.services import faqs as faq_service
from app.services import guidance as guidance_service
from app.services import reports as report_service
from app.services import rumors as rumor_service
from app.services import updates as update_service
from app.services.context import Actor
from app.web.deps import (
    ASSISTANT_COOKIE,
    LOCALE_COOKIE,
    LOW_DATA_COOKIE,
    get_actor,
    page_context,
    templates,
)

router = APIRouter()


@router.get("/", response_class=HTMLResponse)
def home(request: Request, db: DbSession = Depends(get_db)):
    context = page_context(
        request,
        db,
        title_key="nav.home",
        latest_updates=update_service.list_published(db, limit=4)[0],
        trending_rumors=rumor_service.trending(db, limit=3),
        sources=directory_service.list_sources(db)[:6],
        popular_faqs=faq_service.popular(db, limit=4),
        emergency_services=directory_service.list_services(db)[:4],
    )
    return templates.TemplateResponse(request, "public/home.html", context)


# --- Official updates --------------------------------------------------------


@router.get("/updates", response_class=HTMLResponse)
def updates_index(
    request: Request,
    db: DbSession = Depends(get_db),
    category: str | None = None,
    importance: str | None = None,
    q: str | None = None,
    page: int = 1,
):
    page = max(1, page)
    per_page = 10
    items, total = update_service.list_published(
        db,
        category=category,
        importance=importance,
        query=q,
        limit=per_page,
        offset=(page - 1) * per_page,
    )
    context = page_context(
        request,
        db,
        title_key="updates.title",
        updates=items,
        total=total,
        page=page,
        per_page=per_page,
        has_next=page * per_page < total,
        categories=UpdateCategory.ALL,
        importances=Importance.ALL,
        active_category=category,
        active_importance=importance,
        query=q or "",
    )
    return templates.TemplateResponse(request, "public/updates.html", context)


@router.get("/updates/{update_id}", response_class=HTMLResponse)
def update_detail(update_id: int, request: Request, db: DbSession = Depends(get_db)):
    update = update_service.get_published(db, update_id)
    if update is None:
        return _not_found(request, db)
    source = (
        directory_service.get_source(db, update.source_id) if update.source_id else None
    )
    context = page_context(
        request, db, title_key="updates.title", update=update, source=source
    )
    return templates.TemplateResponse(request, "public/update_detail.html", context)


# --- Rumors ------------------------------------------------------------------


@router.get("/rumors", response_class=HTMLResponse)
def rumors_index(request: Request, db: DbSession = Depends(get_db)):
    context = page_context(
        request,
        db,
        title_key="rumors.title",
        rumors=rumor_service.list_public(db, limit=30),
    )
    return templates.TemplateResponse(request, "public/rumors.html", context)


@router.get("/rumors/submit", response_class=HTMLResponse)
def rumor_form(request: Request, db: DbSession = Depends(get_db)):
    context = page_context(request, db, title_key="rumors.submit.title", form_error=None)
    return templates.TemplateResponse(request, "public/rumor_submit.html", context)


@router.post("/rumors/submit", response_class=HTMLResponse)
def rumor_submit(
    request: Request,
    db: DbSession = Depends(get_db),
    actor: Actor = Depends(get_actor),
    claim: str = Form(...),
    source_platform: str = Form(""),
    seen_where: str = Form(""),
    related_to_crisis: str = Form("on"),
):
    try:
        rate_check("rumor_submit", actor.ip_hash)
    except RateLimited:
        return _rate_limited(request, db)

    try:
        _rumor, is_new = rumor_service.submit(
            db,
            actor,
            claim=claim,
            source_platform=source_platform,
            seen_where=seen_where,
            related_to_crisis=related_to_crisis == "on",
        )
    except ValueError as exc:
        context = page_context(
            request, db, title_key="rumors.submit.title", form_error=str(exc)
        )
        return templates.TemplateResponse(
            request, "public/rumor_submit.html", context, status_code=400
        )

    context = page_context(
        request, db, title_key="rumors.submit.received", is_new=is_new
    )
    return templates.TemplateResponse(request, "public/rumor_received.html", context)


@router.get("/rumors/{rumor_id}", response_class=HTMLResponse)
def rumor_detail(rumor_id: int, request: Request, db: DbSession = Depends(get_db)):
    rumor = rumor_service.get_public(db, rumor_id)
    if rumor is None:
        return _not_found(request, db)
    context = page_context(request, db, title_key="rumors.title", rumor=rumor)
    return templates.TemplateResponse(request, "public/rumor_detail.html", context)


# --- Assistant ---------------------------------------------------------------


@router.get("/assistant", response_class=HTMLResponse)
def assistant_page(request: Request, db: DbSession = Depends(get_db)):
    context = page_context(
        request,
        db,
        title_key="assistant.title",
        suggestions=assistant_service.suggested_questions(),
        response=None,
        question="",
    )
    return templates.TemplateResponse(request, "public/assistant.html", context)


@router.post("/assistant", response_class=HTMLResponse)
def assistant_ask(
    request: Request,
    db: DbSession = Depends(get_db),
    actor: Actor = Depends(get_actor),
    question: str = Form(...),
):
    """No-JavaScript path: render the answer into a full page."""
    try:
        rate_check("assistant", actor.ip_hash)
    except RateLimited:
        return _rate_limited(request, db)

    session_key = request.cookies.get(ASSISTANT_COOKIE) or secrets.token_urlsafe(16)
    locale = page_context(request, db)["locale"]
    result = assistant_service.ask(db, question, locale=locale, session_key=session_key)

    context = page_context(
        request,
        db,
        title_key="assistant.title",
        suggestions=assistant_service.suggested_questions(),
        response=result,
        question=question,
    )
    response = templates.TemplateResponse(request, "public/assistant.html", context)
    response.set_cookie(
        ASSISTANT_COOKIE,
        session_key,
        max_age=60 * 60 * 8,
        httponly=True,
        samesite="lax",
    )
    return response


# --- Directory, guidance, FAQ ------------------------------------------------


@router.get("/services", response_class=HTMLResponse)
def services_page(
    request: Request, db: DbSession = Depends(get_db), type: str | None = None
):
    services = directory_service.list_services(db, service_type=type)
    grouped: dict[str, list] = {}
    for service in services:
        grouped.setdefault(service.service_type, []).append(service)
    context = page_context(
        request,
        db,
        title_key="services.title",
        grouped_services=grouped,
        service_types=directory_service.SERVICE_TYPES,
        active_type=type,
    )
    return templates.TemplateResponse(request, "public/services.html", context)


@router.get("/guidance", response_class=HTMLResponse)
def guidance_page(request: Request, db: DbSession = Depends(get_db)):
    context = page_context(
        request,
        db,
        title_key="guidance.title",
        guidance=guidance_service.grouped(db),
        phases=GuidancePhase.ALL,
    )
    return templates.TemplateResponse(request, "public/guidance.html", context)


@router.get("/faq", response_class=HTMLResponse)
def faq_page(
    request: Request,
    db: DbSession = Depends(get_db),
    category: str | None = None,
    q: str | None = None,
):
    context = page_context(
        request,
        db,
        title_key="faq.title",
        faqs=faq_service.list_published(db, category=category, query=q),
        popular=faq_service.popular(db, limit=5),
        categories=faq_service.CATEGORIES,
        active_category=category,
        query=q or "",
    )
    return templates.TemplateResponse(request, "public/faq.html", context)


# --- Reports -----------------------------------------------------------------


@router.get("/report", response_class=HTMLResponse)
def report_form(request: Request, db: DbSession = Depends(get_db)):
    context = page_context(request, db, title_key="report.title", form_error=None)
    return templates.TemplateResponse(request, "public/report.html", context)


@router.post("/report", response_class=HTMLResponse)
def report_submit(
    request: Request,
    db: DbSession = Depends(get_db),
    actor: Actor = Depends(get_actor),
    report_type: str = Form(...),
    description: str = Form(...),
    location_text: str = Form(""),
    is_emergency: str = Form(""),
    contact: str = Form(""),
):
    try:
        rate_check("report_submit", actor.ip_hash)
    except RateLimited:
        return _rate_limited(request, db)

    try:
        _report, routing = report_service.submit(
            db,
            actor,
            report_type=report_type,
            description=description,
            location_text=location_text,
            is_emergency=is_emergency == "on",
            contact=contact,
        )
    except ValueError as exc:
        context = page_context(request, db, title_key="report.title", form_error=str(exc))
        return templates.TemplateResponse(
            request, "public/report.html", context, status_code=400
        )

    context = page_context(
        request,
        db,
        title_key="report.received",
        routing=routing,
        emergency_services=directory_service.list_services(db)[:4],
    )
    return templates.TemplateResponse(request, "public/report_received.html", context)


# --- Sources and about -------------------------------------------------------


@router.get("/sources", response_class=HTMLResponse)
def sources_page(request: Request, db: DbSession = Depends(get_db)):
    context = page_context(
        request, db, title_key="sources.title", sources=directory_service.list_sources(db)
    )
    return templates.TemplateResponse(request, "public/sources.html", context)


@router.get("/about", response_class=HTMLResponse)
def about_page(request: Request, db: DbSession = Depends(get_db)):
    context = page_context(request, db, title_key="about.title")
    return templates.TemplateResponse(request, "public/about.html", context)


@router.get("/about/{section}", response_class=HTMLResponse)
def about_section(section: str, request: Request, db: DbSession = Depends(get_db)):
    if section not in ("governance", "privacy", "terms"):
        return _not_found(request, db)
    context = page_context(request, db, title_key=f"about.{section}", section=section)
    return templates.TemplateResponse(request, "public/about_section.html", context)


# --- Search ------------------------------------------------------------------


@router.get("/search", response_class=HTMLResponse)
def search_page(
    request: Request,
    db: DbSession = Depends(get_db),
    actor: Actor = Depends(get_actor),
    q: str = "",
):
    query = (q or "").strip()
    updates: list = []
    faqs: list = []
    rumors: list = []
    if query:
        try:
            rate_check("search", actor.ip_hash)
        except RateLimited:
            return _rate_limited(request, db)
        updates = update_service.list_published(db, query=query, limit=8)[0]
        faqs = faq_service.list_published(db, query=query)[:8]
        rumors = [
            r
            for r in rumor_service.list_public(db, limit=50)
            if query.lower() in (r.claim or "").lower()
        ][:5]

    context = page_context(
        request,
        db,
        title_key="home.search",
        query=query,
        updates=updates,
        faqs=faqs,
        rumors=rumors,
        has_results=bool(updates or faqs or rumors),
    )
    return templates.TemplateResponse(request, "public/search.html", context)


# --- Preferences -------------------------------------------------------------


@router.post("/prefs/low-data")
def toggle_low_data(request: Request, enable: str = Form("1")):
    """Low-data mode. A cookie, not an account setting — no login required."""
    target = request.headers.get("referer", "/")
    if not target.startswith("/"):
        from urllib.parse import urlparse

        parsed = urlparse(target)
        target = parsed.path or "/"
    response = RedirectResponse(target, status_code=303)
    if enable == "1":
        response.set_cookie(
            LOW_DATA_COOKIE, "1", max_age=60 * 60 * 24 * 90, samesite="lax"
        )
    else:
        response.delete_cookie(LOW_DATA_COOKIE)
    return response


@router.get("/prefs/lang/{locale}")
def set_language(locale: str, request: Request):
    from app import i18n

    normalized = i18n.normalize_locale(locale)
    target = request.query_params.get("next", "/")
    if not target.startswith("/"):
        target = "/"
    response = RedirectResponse(target, status_code=303)
    response.set_cookie(
        LOCALE_COOKIE, normalized, max_age=60 * 60 * 24 * 365, samesite="lax"
    )
    return response


# --- Shared error renderings -------------------------------------------------


def _not_found(request: Request, db: DbSession) -> HTMLResponse:
    context = page_context(request, db, title_key="ui.notfound", message_key="ui.notfound")
    return templates.TemplateResponse(
        request, "public/message.html", context, status_code=404
    )


def _rate_limited(request: Request, db: DbSession) -> HTMLResponse:
    context = page_context(
        request, db, title_key="ui.ratelimited", message_key="ui.ratelimited"
    )
    return templates.TemplateResponse(
        request, "public/message.html", context, status_code=429
    )
