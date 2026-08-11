"""Citizen reports of problems and needs."""

from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import ReportStatus, ReportType, TimestampMixin


class Report(Base, TimestampMixin):
    """A citizen-submitted problem or need.

    The platform does not claim delivery to any authority: ``routed_to`` records
    the *suggested* destination, and the public confirmation page says plainly
    that this is a routing suggestion, not a dispatch. See ``services/reports.py``.
    """

    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    report_type: Mapped[str] = mapped_column(String(32), default=ReportType.OTHER, index=True)
    description: Mapped[str] = mapped_column(Text)
    location_text: Mapped[str | None] = mapped_column(String(255))
    is_emergency: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    #: Optional and free-text; citizens are told they may leave it blank.
    contact: Mapped[str | None] = mapped_column(String(255))

    status: Mapped[str] = mapped_column(String(32), default=ReportStatus.NEW, index=True)
    routed_to: Mapped[str | None] = mapped_column(String(160))
    triage_note: Mapped[str | None] = mapped_column(Text)
    handled_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    #: If triage decided this is really a rumor, the rumor it became.
    linked_rumor_id: Mapped[int | None] = mapped_column(
        ForeignKey("rumors.id", ondelete="SET NULL")
    )
    ip_hash: Mapped[str | None] = mapped_column(String(64), index=True)
