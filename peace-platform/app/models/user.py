"""Operators, their sessions, and the role vocabulary used by RBAC."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import TimestampMixin, UserStatus


class Role:
    SYSTEM_ADMIN = "system_admin"
    CONTENT_EDITOR = "content_editor"
    RUMOR_REVIEWER = "rumor_reviewer"
    OPS_SUPERVISOR = "ops_supervisor"
    AI_ADMIN = "ai_admin"
    VIEWER = "viewer"
    ALL = (
        SYSTEM_ADMIN,
        CONTENT_EDITOR,
        RUMOR_REVIEWER,
        OPS_SUPERVISOR,
        AI_ADMIN,
        VIEWER,
    )


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    #: bcrypt hash. The plaintext password never leaves the request handler.
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default=Role.VIEWER, index=True)
    status: Mapped[str] = mapped_column(String(32), default=UserStatus.ACTIVE, index=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class UserSession(Base):
    """A server-side session.

    Only the SHA-256 of the session token is stored, so a database disclosure
    does not hand an attacker usable session cookies. Sessions carry both an
    idle and an absolute expiry, and can be revoked individually.
    """

    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    absolute_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ip_hash: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(255))
