"""Append-only audit trail and operator notifications."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import TimestampMixin, utcnow


class AuditLog(Base):
    """One row per sensitive operation.

    Append-only from the application: there is no update or delete path to this
    table anywhere in ``app/`` — only ``audit.record()`` inserts. The actor's
    email and role are denormalised so the record stays readable after a user is
    renamed or deleted.
    """

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    user_email: Mapped[str | None] = mapped_column(String(255), index=True)
    role: Mapped[str | None] = mapped_column(String(32))
    action: Mapped[str] = mapped_column(String(120), index=True)
    object_type: Mapped[str | None] = mapped_column(String(64), index=True)
    object_id: Mapped[str | None] = mapped_column(String(64), index=True)
    old_value: Mapped[dict | None] = mapped_column(JSON)
    new_value: Mapped[dict | None] = mapped_column(JSON)
    #: Salted hash rather than the raw address, matching the privacy policy.
    ip_hash: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )


class Notification(Base, TimestampMixin):
    """An item in an operator's queue — e.g. a low-confidence AI answer."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    #: Either a specific user or a whole role gets the notification.
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[str | None] = mapped_column(String(32), index=True)
    type: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text, default="")
    link: Mapped[str | None] = mapped_column(String(255))
    read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
