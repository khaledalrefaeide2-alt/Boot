"""Citizen-facing content: official updates, FAQs and safety guidance."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import (
    ContentStatus,
    GuidanceAudience,
    GuidanceKind,
    GuidancePhase,
    Importance,
    TimestampMixin,
    UpdateCategory,
    UpdateStatus,
)


class OfficialUpdate(Base, TimestampMixin):
    """An official statement.

    ``content`` always holds the original wording from the source organisation.
    ``citizen_summary`` may be AI-assisted, but it is stored separately and the
    original is always reachable from the public detail page — the AI can never
    replace an official text, only sit beside it.
    """

    __tablename__ = "official_updates"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    content: Mapped[str] = mapped_column(Text)
    #: AI-generated plain-language rendering. Requires human approval to publish.
    citizen_summary: Mapped[str | None] = mapped_column(Text)
    citizen_summary_approved: Mapped[bool] = mapped_column(Boolean, default=False)

    category: Mapped[str] = mapped_column(String(32), default=UpdateCategory.GENERAL, index=True)
    importance: Mapped[str] = mapped_column(String(16), default=Importance.NORMAL, index=True)
    status: Mapped[str] = mapped_column(String(32), default=UpdateStatus.DRAFT, index=True)

    source_id: Mapped[int | None] = mapped_column(
        ForeignKey("official_sources.id", ondelete="SET NULL"), index=True
    )
    #: Denormalised organisation name so a published update keeps attribution
    #: even if the source record is later renamed or deactivated.
    organization: Mapped[str] = mapped_column(String(160), default="")
    source_url: Mapped[str | None] = mapped_column(String(500))
    verified: Mapped[bool] = mapped_column(Boolean, default=False)

    crisis_id: Mapped[int | None] = mapped_column(
        ForeignKey("crises.id", ondelete="SET NULL"), index=True
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class Faq(Base, TimestampMixin):
    __tablename__ = "faqs"

    id: Mapped[int] = mapped_column(primary_key=True)
    question: Mapped[str] = mapped_column(String(500), index=True)
    answer: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(64), default="general", index=True)
    #: How often citizens have asked something matching this entry. Drives the
    #: "popular questions" list and the information-gap report.
    frequency: Mapped[int] = mapped_column(Integer, default=0, index=True)
    status: Mapped[str] = mapped_column(String(32), default=ContentStatus.DRAFT, index=True)
    crisis_id: Mapped[int | None] = mapped_column(ForeignKey("crises.id", ondelete="SET NULL"))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class Guidance(Base, TimestampMixin):
    """Before/during/after safety guidance, segmented by audience."""

    __tablename__ = "guidance"

    id: Mapped[int] = mapped_column(primary_key=True)
    phase: Mapped[str] = mapped_column(String(16), default=GuidancePhase.DURING, index=True)
    audience: Mapped[str] = mapped_column(
        String(32), default=GuidanceAudience.GENERAL, index=True
    )
    kind: Mapped[str] = mapped_column(String(16), default=GuidanceKind.INFO)
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=100)
    status: Mapped[str] = mapped_column(String(32), default=ContentStatus.PUBLISHED, index=True)
    crisis_id: Mapped[int | None] = mapped_column(ForeignKey("crises.id", ondelete="SET NULL"))
    source_id: Mapped[int | None] = mapped_column(
        ForeignKey("official_sources.id", ondelete="SET NULL")
    )
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
