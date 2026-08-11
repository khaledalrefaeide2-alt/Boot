"""Security response headers.

The CSP is strict by design: no inline script is permitted at all. Every
interactive behaviour on the site lives in ``/static/js/app.js``, which is why
the platform can run without ``unsafe-inline``.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.config import get_settings

CSP = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        # data: is needed for the inline SVG/data-URI icons used in the
        # low-data theme; no remote image origins are allowed.
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "object-src 'none'",
    ]
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        headers = response.headers
        headers.setdefault("Content-Security-Policy", CSP)
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers.setdefault("X-Frame-Options", "DENY")
        headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        headers.setdefault(
            "Permissions-Policy", "geolocation=(self), microphone=(), camera=()"
        )
        headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        if get_settings().is_production:
            headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        # The dashboard must never be cached by a shared proxy.
        if request.url.path.startswith("/dash"):
            headers["Cache-Control"] = "no-store, private"
        return response
