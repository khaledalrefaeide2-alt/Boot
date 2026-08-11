"""Operator accounts, authentication and role administration."""

from __future__ import annotations

from datetime import timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.config import get_settings
from app.models import Role, User, UserStatus, utcnow
from app.security import sessions
from app.security.passwords import hash_password, verify_password
from app.security.rbac import Permission
from app.security.sanitize import clean_line
from app.services import audit
from app.services.context import Actor


class AuthError(Exception):
    """Authentication failed. Deliberately carries no detail for the client."""


def authenticate(db: DbSession, email: str, password: str, actor: Actor) -> User:
    """Verify credentials with lockout.

    Every failure path raises the same :class:`AuthError` with the same message
    so the response cannot be used to enumerate accounts. A dummy hash
    comparison runs for unknown emails to keep timing comparable.
    """
    settings = get_settings()
    normalized = clean_line(email, max_length=255).lower()
    user = db.scalar(select(User).where(User.email == normalized))

    if user is None:
        # Constant-ish work for unknown accounts.
        verify_password(password, "$2b$12$" + "." * 53)
        audit.record(
            db,
            actor,
            audit.Action.LOGIN_FAILURE,
            object_type="user",
            new_value={"email": normalized, "reason": "unknown_account"},
        )
        raise AuthError("Invalid email or password.")

    now = utcnow()
    if user.locked_until and _aware(user.locked_until) > now:
        audit.record(
            db,
            actor,
            audit.Action.LOGIN_LOCKED,
            object_type="user",
            object_id=user.id,
            new_value={"email": normalized},
        )
        raise AuthError("Invalid email or password.")

    if user.status != UserStatus.ACTIVE or not verify_password(password, user.password_hash):
        user.failed_login_count += 1
        reason = "suspended" if user.status != UserStatus.ACTIVE else "bad_password"
        if user.failed_login_count >= settings.login_max_attempts:
            user.locked_until = now + timedelta(minutes=settings.login_lockout_minutes)
            user.failed_login_count = 0
        db.commit()
        audit.record(
            db,
            actor,
            audit.Action.LOGIN_FAILURE,
            object_type="user",
            object_id=user.id,
            new_value={"email": normalized, "reason": reason},
        )
        raise AuthError("Invalid email or password.")

    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now
    db.commit()
    audit.record(
        db,
        Actor.from_user(user, ip_hash=actor.ip_hash, user_agent=actor.user_agent),
        audit.Action.LOGIN_SUCCESS,
        object_type="user",
        object_id=user.id,
    )
    return user


def create_user(
    db: DbSession,
    actor: Actor,
    *,
    name: str,
    email: str,
    password: str,
    role: str,
    is_demo: bool = False,
) -> User:
    actor.require(Permission.USERS_MANAGE)
    if role not in Role.ALL:
        raise ValueError(f"invalid role '{role}'")
    normalized = clean_line(email, max_length=255).lower()
    if db.scalar(select(User).where(User.email == normalized)):
        raise ValueError("An account with that email already exists.")

    user = User(
        name=clean_line(name, max_length=160),
        email=normalized,
        password_hash=hash_password(password),
        role=role,
        status=UserStatus.ACTIVE,
        is_demo=is_demo,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    audit.record(
        db,
        actor,
        audit.Action.USER_CREATE,
        object_type="user",
        object_id=user.id,
        new_value={"email": user.email, "role": user.role},
    )
    return user


def change_role(db: DbSession, actor: Actor, user_id: int, role: str) -> User:
    """Change a user's role and immediately revoke their live sessions.

    Without the revocation a demoted user would keep their old permissions for
    the remainder of their session, since RBAC is evaluated from the session's
    user record at request time.
    """
    actor.require(Permission.USERS_MANAGE)
    if role not in Role.ALL:
        raise ValueError(f"invalid role '{role}'")
    user = _get(db, user_id)
    if user.id == actor.user_id and role != Role.SYSTEM_ADMIN:
        raise ValueError("You cannot remove your own administrator role.")

    before = user.role
    user.role = role
    db.commit()
    revoked = sessions.revoke_all_for_user(db, user.id)
    db.refresh(user)
    audit.record(
        db,
        actor,
        audit.Action.USER_ROLE_CHANGE,
        object_type="user",
        object_id=user.id,
        old_value={"role": before},
        new_value={"role": role, "sessions_revoked": revoked},
    )
    return user


def set_status(db: DbSession, actor: Actor, user_id: int, status: str) -> User:
    actor.require(Permission.USERS_MANAGE)
    if status not in UserStatus.ALL:
        raise ValueError(f"invalid status '{status}'")
    user = _get(db, user_id)
    if user.id == actor.user_id and status != UserStatus.ACTIVE:
        raise ValueError("You cannot suspend your own account.")

    before = user.status
    user.status = status
    db.commit()
    revoked = sessions.revoke_all_for_user(db, user.id) if status != UserStatus.ACTIVE else 0
    db.refresh(user)
    audit.record(
        db,
        actor,
        audit.Action.USER_SUSPEND,
        object_type="user",
        object_id=user.id,
        old_value={"status": before},
        new_value={"status": status, "sessions_revoked": revoked},
    )
    return user


def reset_password(db: DbSession, actor: Actor, user_id: int, new_password: str) -> User:
    actor.require(Permission.USERS_MANAGE)
    user = _get(db, user_id)
    user.password_hash = hash_password(new_password)
    user.must_change_password = True
    user.failed_login_count = 0
    user.locked_until = None
    db.commit()
    revoked = sessions.revoke_all_for_user(db, user.id)
    db.refresh(user)
    audit.record(
        db,
        actor,
        audit.Action.USER_PASSWORD_RESET,
        object_type="user",
        object_id=user.id,
        new_value={"sessions_revoked": revoked},
    )
    return user


def list_users(db: DbSession) -> list[User]:
    return list(db.scalars(select(User).order_by(User.name)).all())


def _get(db: DbSession, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise LookupError("user not found")
    return user


def _aware(value):
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
