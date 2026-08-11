"""Server-side session management for the operations dashboard.

Design notes
------------
* The cookie holds a 256-bit random token; the database holds only its SHA-256.
* Sessions expire two ways: idle (no request for N minutes) and absolute (hard
  cap regardless of activity). Both are checked on every request.
* Every session carries its own CSRF token, so a stolen CSRF token is useless
  without the matching session cookie and vice versa.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.config import get_settings
from app.models import User, UserSession, UserStatus, utcnow

SESSION_COOKIE = "peace_session"
CSRF_HEADER = "X-CSRF-Token"
CSRF_FIELD = "csrf_token"


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(
    db: DbSession,
    user: User,
    *,
    ip_hash: str | None = None,
    user_agent: str | None = None,
) -> tuple[str, UserSession]:
    """Issue a new session. Returns ``(raw_token, record)``.

    The raw token is returned once and never stored; the caller sets it as a
    cookie and forgets it.
    """
    settings = get_settings()
    raw_token = secrets.token_urlsafe(32)
    now = utcnow()
    record = UserSession(
        token_hash=_hash_token(raw_token),
        user_id=user.id,
        csrf_token=secrets.token_urlsafe(32),
        created_at=now,
        last_seen_at=now,
        absolute_expires_at=now + timedelta(hours=settings.session_absolute_hours),
        ip_hash=ip_hash,
        user_agent=(user_agent or "")[:255] or None,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return raw_token, record


def resolve_session(db: DbSession, raw_token: str | None) -> tuple[User, UserSession] | None:
    """Validate a cookie token and slide the idle window.

    Returns ``None`` for anything invalid — unknown token, revoked, expired,
    suspended user — without distinguishing between them to the caller.
    """
    if not raw_token:
        return None
    settings = get_settings()
    now = utcnow()

    record = db.scalar(
        select(UserSession).where(UserSession.token_hash == _hash_token(raw_token))
    )
    if record is None or record.revoked_at is not None:
        return None

    if _aware(record.absolute_expires_at) <= now:
        revoke_session(db, record)
        return None

    idle_deadline = _aware(record.last_seen_at) + timedelta(minutes=settings.session_idle_minutes)
    if idle_deadline <= now:
        revoke_session(db, record)
        return None

    user = db.get(User, record.user_id)
    if user is None or user.status != UserStatus.ACTIVE:
        revoke_session(db, record)
        return None

    record.last_seen_at = now
    db.commit()
    return user, record


def revoke_session(db: DbSession, record: UserSession) -> None:
    if record.revoked_at is None:
        record.revoked_at = utcnow()
        db.commit()


def revoke_all_for_user(db: DbSession, user_id: int) -> int:
    """Revoke every live session for a user (used on suspend and role change)."""
    now = utcnow()
    records = db.scalars(
        select(UserSession).where(
            UserSession.user_id == user_id, UserSession.revoked_at.is_(None)
        )
    ).all()
    for record in records:
        record.revoked_at = now
    db.commit()
    return len(records)


def _aware(value):
    """SQLite loses tzinfo on round-trip; normalise before comparing."""
    from datetime import timezone

    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
