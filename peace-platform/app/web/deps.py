"""Shared request plumbing: locale, templates, authentication and CSRF."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, HTTPException, Request, status
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session as DbSession

from app import i18n
from app.config import BASE_DIR, get_settings
from app.db import get_db
from app.models import User
from app.security import sessions
from app.security.privacy import client_ip, hash_ip
from app.security.rbac import ROLE_PERMISSIONS
from app.security.sanitize import paragraphs
from app.services import alerts as alert_service
from app.services import crisis as crisis_service
from app.services import settings_store
from app.services.context import Actor

TEMPLATES_DIR = Path(BASE_DIR) / "app" / "templates"
LOCALE_COOKIE = "peace_locale"
LOW_DATA_COOKIE = "peace_lowdata"
ASSISTANT_COOKIE = "peace_chat"

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


# --- Template helpers --------------------------------------------------------


def _relative_time(value: datetime | None, locale: str) -> str:
    if value is None:
        return "—"
    moment = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    delta = datetime.now(timezone.utc) - moment
    minutes = int(delta.total_seconds() // 60)
    if minutes < 1:
        return i18n.translate("ui.justnow", locale)
    if minutes < 60:
        return i18n.translate("ui.minutes_ago", locale, n=minutes)
    hours = minutes // 60
    if hours < 24:
        return i18n.translate("ui.hours_ago", locale, n=hours)
    return i18n.translate("ui.days_ago", locale, n=hours // 24)


def _format_datetime(value: datetime | None) -> str:
    if value is None:
        return "—"
    moment = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return moment.strftime("%Y-%m-%d %H:%M")


#: Translation keys the browser script renders client-side. Kept explicit so
#: the whole catalogue is never shipped to the client.
_JS_KEYS = (
    "assistant.thinking",
    "assistant.answer",
    "assistant.sources",
    "assistant.confidence",
    "assistant.confidence.high",
    "assistant.confidence.medium",
    "assistant.confidence.low",
    "assistant.disclaimer",
    "assistant.conflict",
    "assistant.insufficient",
    "assistant.insufficient.next",
    "assistant.blocked",
    "assistant.too_short",
    "assistant.disabled",
    "assistant.unavailable",
    "assistant.emergency_directory",
    "assistant.restricted.medical_treatment",
    "assistant.restricted.legal_advice",
    "assistant.restricted.casualty_figures",
    "assistant.feedback",
    "assistant.feedback.yes",
    "assistant.feedback.no",
    "assistant.feedback.thanks",
    "demo.number",
    "ui.error",
    "ui.ratelimited",
)

templates.env.globals["paragraphs"] = paragraphs
templates.env.globals["format_datetime"] = _format_datetime
templates.env.filters["paragraphs"] = paragraphs
# Autoescaping is on by default for .html in Jinja2Templates; the platform
# stores no HTML, so escaped output is always the correct rendering.


# --- Locale and presentation preferences -------------------------------------


def get_locale(request: Request) -> str:
    explicit = request.query_params.get("lang")
    if explicit:
        return i18n.normalize_locale(explicit)
    return i18n.normalize_locale(request.cookies.get(LOCALE_COOKIE))


def is_low_data(request: Request) -> bool:
    return request.cookies.get(LOW_DATA_COOKIE) == "1"


# --- Authentication ----------------------------------------------------------


def get_actor(request: Request, db: DbSession = Depends(get_db)) -> Actor:
    """Actor for any request, authenticated or not."""
    ip = hash_ip(client_ip(request))
    agent = request.headers.get("user-agent")
    resolved = sessions.resolve_session(db, request.cookies.get(sessions.SESSION_COOKIE))
    if resolved is None:
        return Actor.anonymous(ip_hash=ip, user_agent=agent)
    user, _record = resolved
    return Actor.from_user(user, ip_hash=ip, user_agent=agent)


def current_user_or_none(
    request: Request, db: DbSession = Depends(get_db)
) -> tuple[User, str] | None:
    """Returns ``(user, csrf_token)`` when signed in."""
    resolved = sessions.resolve_session(db, request.cookies.get(sessions.SESSION_COOKIE))
    if resolved is None:
        return None
    user, record = resolved
    return user, record.csrf_token


def require_user(request: Request, db: DbSession = Depends(get_db)) -> tuple[User, str]:
    resolved = current_user_or_none(request, db)
    if resolved is None:
        # Sends the browser to the login page while keeping the intended path.
        raise HTTPException(
            status_code=status.HTTP_303_SEE_OTHER,
            headers={"Location": f"/dash/login?next={request.url.path}"},
        )
    return resolved


def require_permission(permission: str):
    """Dependency factory guarding a dashboard route."""

    def dependency(
        request: Request, db: DbSession = Depends(get_db)
    ) -> tuple[User, str]:
        user, csrf = require_user(request, db)
        if permission not in ROLE_PERMISSIONS.get(user.role, frozenset()):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
        return user, csrf

    return dependency


# --- CSRF --------------------------------------------------------------------


def verify_csrf(request: Request, db: DbSession, submitted: str | None) -> None:
    """Validate a state-changing request against the session's CSRF token.

    Double-checked: the token must match the one bound to *this* session, so a
    token leaked from another session is useless.
    """
    resolved = sessions.resolve_session(db, request.cookies.get(sessions.SESSION_COOKIE))
    if resolved is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No session.")
    _user, record = resolved
    token = submitted or request.headers.get(sessions.CSRF_HEADER)
    if not token or not secrets.compare_digest(token, record.csrf_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token."
        )


# --- Template context --------------------------------------------------------


def page_context(
    request: Request,
    db: DbSession,
    *,
    title_key: str | None = None,
    **extra,
) -> dict:
    """Base context every page template receives."""
    locale = get_locale(request)
    settings = get_settings()
    signed_in = current_user_or_none(request, db)

    context: dict = {
        "request": request,
        "locale": locale,
        "dir": i18n.direction(locale),
        "t": lambda key, **kw: i18n.translate(key, locale, **kw),
        # Strings the client script needs, handed over in a data attribute so
        # the CSP can forbid inline <script> outright.
        "js_strings": {key: i18n.translate(key, locale) for key in _JS_KEYS},
        "relative_time": lambda value: _relative_time(value, locale),
        "low_data": is_low_data(request),
        "settings": settings.public_settings(),
        "demo_mode": settings.demo_mode,
        "title_key": title_key,
        "current_path": request.url.path,
        "crisis": crisis_service.current(db),
        "emergency_mode": settings_store.get_emergency_mode(db),
        "alerts": alert_service.active(db),
        "signed_in_user": signed_in[0] if signed_in else None,
        "other_locale": "en" if locale == "ar" else "ar",
    }
    context.update(extra)
    return context


def dash_context(
    request: Request,
    db: DbSession,
    user: User,
    csrf_token: str,
    **extra,
) -> dict:
    context = page_context(request, db, **extra)
    context.update(
        {
            "user": user,
            "csrf_token": csrf_token,
            "permissions": ROLE_PERMISSIONS.get(user.role, frozenset()),
        }
    )
    return context
