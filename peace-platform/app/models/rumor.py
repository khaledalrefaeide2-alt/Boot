"""Rumor submissions and their human-governed verification workflow."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import RumorStatus, TimestampMixin


class Rumor(Base, TimestampMixin):
    """A claim submitted for verification.

    AI-derived fields are namespaced ``ai_*`` and are advisory only. The fields
    a citizen ever sees — ``correction``, ``explanation``, ``status`` once
    published — are written by a human reviewer. ``published`` is flipped by a
    single audited service call that requires the ``rumors.publish`` permission.
    """

    __tablename__ = "rumors"

    id: Mapped[int] = mapped_column(primary_key=True)

    # --- As submitted ---
    claim: Mapped[str] = mapped_column(Text)
    raw_submission: Mapped[str | None] = mapped_column(Text)
    source_platform: Mapped[str | None] = mapped_column(String(120))
    seen_where: Mapped[str | None] = mapped_column(String(255))
    related_to_crisis: Mapped[bool] = mapped_column(Boolean, default=True)
    crisis_id: Mapped[int | None] = mapped_column(
        ForeignKey("crises.id", ondelete="SET NULL"), index=True
    )
    #: Salted hash of the submitter IP. Never the address itself.
    submitter_ip_hash: Mapped[str | None] = mapped_column(String(64), index=True)

    # --- Assessment ---
    spread_score: Mapped[float] = mapped_column(Float, default=0.0)
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(32), default=RumorStatus.UNVERIFIED, index=True)

    # --- AI suggestions (advisory, never published as-is) ---
    ai_classification: Mapped[str | None] = mapped_column(String(32))
    ai_confidence: Mapped[float | None] = mapped_column(Float)
    ai_correction: Mapped[str | None] = mapped_column(Text)
    ai_rationale: Mapped[str | None] = mapped_column(Text)
    ai_citations: Mapped[list | None] = mapped_column(JSON)

    # --- Human decision ---
    correction: Mapped[str | None] = mapped_column(Text)
    explanation: Mapped[str | None] = mapped_column(Text)
    evidence_source_id: Mapped[int | None] = mapped_column(
        ForeignKey("official_sources.id", ondelete="SET NULL")
    )
    evidence_url: Mapped[str | None] = mapped_column(String(500))
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    #: The single gate between the workflow and the public site.
    published: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: Number of citizens who submitted a matching claim — a spread signal.
    report_count: Mapped[int] = mapped_column(Integer, default=1)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
