"""Crisis records, public alerts and the system-settings key/value store."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import CrisisStatus, Severity, TimestampMixin


class Crisis(Base, TimestampMixin):
    __tablename__ = "crises"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    type: Mapped[str] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(String(255))
    severity: Mapped[str] = mapped_column(String(16), default=Severity.MEDIUM)
    status: Mapped[str] = mapped_column(String(32), default=CrisisStatus.ONGOING)
    description: Mapped[str] = mapped_column(Text, default="")
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: Exactly one crisis is the "current" one shown on the public home page.
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class Alert(Base, TimestampMixin):
    """A banner shown on the public site. Urgent alerts are visually distinct
    but deliberately restrained — see docs/ARCHITECTURE.md on colour usage."""

    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(16), index=True)
    message: Mapped[str] = mapped_column(Text)
    #: Where the alert renders: "global" (all pages) or a specific route name.
    placement: Mapped[str] = mapped_column(String(64), default="global")
    priority: Mapped[int] = mapped_column(Integer, default=100)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    related_update_id: Mapped[int | None] = mapped_column(
        ForeignKey("official_updates.id", ondelete="SET NULL")
    )
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class SystemSetting(Base, TimestampMixin):
    """Key/value store for global switches: emergency mode, AI configuration.

    Kept as one table rather than a column-per-flag so adding a setting never
    requires a migration, and every write goes through the audited settings
    service.
    """

    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
