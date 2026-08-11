"""Emergency services directory and the register of trusted official sources."""

from __future__ import annotations

from sqlalchemy import JSON, Boolean, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import ServiceStatus, TimestampMixin


class AssistanceService(Base, TimestampMixin):
    """A contact point for official help.

    ``is_demo`` is not cosmetic: every surface that renders a phone number reads
    it and labels the record as demonstration data. Seeded numbers use the
    reserved 555 range so they cannot collide with a real service.
    """

    __tablename__ = "assistance_services"

    id: Mapped[int] = mapped_column(primary_key=True)
    organization: Mapped[str] = mapped_column(String(160), index=True)
    phone: Mapped[str] = mapped_column(String(48))
    service_type: Mapped[str] = mapped_column(String(64), index=True)
    hours: Mapped[str] = mapped_column(String(160), default="")
    website: Mapped[str | None] = mapped_column(String(500))
    location: Mapped[str | None] = mapped_column(String(255))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(32), default=ServiceStatus.ACTIVE, index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=100)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class OfficialSource(Base, TimestampMixin):
    """A trusted organisation.

    ``trust_level`` (1–5) feeds RAG reranking: higher-trust, fresher sources win
    when evidence conflicts. See docs/AI_RAG.md.
    """

    __tablename__ = "official_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    organization: Mapped[str] = mapped_column(String(160), default="")
    url: Mapped[str | None] = mapped_column(String(500))
    type: Mapped[str] = mapped_column(String(64), default="government")
    trust_level: Mapped[int] = mapped_column(Integer, default=3, index=True)
    logo_url: Mapped[str | None] = mapped_column(String(500))
    social_links: Mapped[dict | None] = mapped_column(JSON)
    verification_status: Mapped[str] = mapped_column(String(32), default="verified")
    why_trusted: Mapped[str] = mapped_column(Text, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
