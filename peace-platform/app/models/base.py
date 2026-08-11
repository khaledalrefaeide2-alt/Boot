"""Shared column helpers and the controlled vocabularies used across the schema.

Status/severity/role values are kept as plain strings with Python-side constants
rather than native database ENUM types: adding a value later is then a code
change instead of a migration, and the same DDL works on SQLite and PostgreSQL.
Validation happens in the service layer, which is also where auditing lives.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlalchemy.orm import Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


# --- Controlled vocabularies -------------------------------------------------


class Severity:
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    ALL = (LOW, MEDIUM, HIGH)


class CrisisStatus:
    ONGOING = "ongoing"
    UNDER_CONTROL = "under_control"
    ENDED = "ended"
    ALL = (ONGOING, UNDER_CONTROL, ENDED)


class UpdateStatus:
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    ARCHIVED = "archived"
    ALL = (DRAFT, PENDING_REVIEW, SCHEDULED, PUBLISHED, ARCHIVED)


class UpdateCategory:
    TRANSPORT = "transport"
    EDUCATION = "education"
    PUBLIC_SERVICES = "public_services"
    HEALTH_SAFETY = "health_safety"
    GENERAL = "general"
    ALL = (TRANSPORT, EDUCATION, PUBLIC_SERVICES, HEALTH_SAFETY, GENERAL)


class Importance:
    NORMAL = "normal"
    IMPORTANT = "important"
    CRITICAL = "critical"
    ALL = (NORMAL, IMPORTANT, CRITICAL)


class RumorStatus:
    """Lifecycle of a rumor.

    Only ``VERIFIED``/``MISLEADING``/``FALSE``/``RESOLVED`` may be published, and
    only a human with ``rumors.publish`` can move a rumor into a published state.
    """

    UNVERIFIED = "unverified"
    UNDER_REVIEW = "under_review"
    VERIFIED = "verified"
    MISLEADING = "misleading"
    FALSE = "false"
    RESOLVED = "resolved"
    ALL = (UNVERIFIED, UNDER_REVIEW, VERIFIED, MISLEADING, FALSE, RESOLVED)
    #: Verdicts that carry a public judgement. Reaching one of these still does
    #: not publish the rumor — publication is a separate, explicit human action.
    CONCLUDED = (VERIFIED, MISLEADING, FALSE, RESOLVED)


class ContentStatus:
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"
    ALL = (DRAFT, PUBLISHED, ARCHIVED)


class ServiceStatus:
    ACTIVE = "active"
    DEGRADED = "degraded"
    INACTIVE = "inactive"
    ALL = (ACTIVE, DEGRADED, INACTIVE)


class GuidancePhase:
    BEFORE = "before"
    DURING = "during"
    AFTER = "after"
    ALL = (BEFORE, DURING, AFTER)


class GuidanceAudience:
    GENERAL = "general"
    ELDERLY = "elderly"
    CHILDREN = "children"
    DISABILITIES = "disabilities"
    VULNERABLE = "vulnerable"
    ALL = (GENERAL, ELDERLY, CHILDREN, DISABILITIES, VULNERABLE)


class GuidanceKind:
    DO = "do"
    DONT = "dont"
    INFO = "info"
    ALL = (DO, DONT, INFO)


class AlertType:
    URGENT = "urgent"
    IMPORTANT = "important"
    AWARENESS = "awareness"
    ALL = (URGENT, IMPORTANT, AWARENESS)


class ReportStatus:
    NEW = "new"
    TRIAGED = "triaged"
    ROUTED = "routed"
    CLOSED = "closed"
    ALL = (NEW, TRIAGED, ROUTED, CLOSED)


class ReportType:
    EMERGENCY = "emergency"
    SERVICE_ISSUE = "service_issue"
    RUMOR = "rumor"
    INFORMATION_REQUEST = "information_request"
    OTHER = "other"
    ALL = (EMERGENCY, SERVICE_ISSUE, RUMOR, INFORMATION_REQUEST, OTHER)


class DocumentStatus:
    PENDING = "pending"
    PROCESSING = "processing"
    INDEXED = "indexed"
    FAILED = "failed"
    DISABLED = "disabled"
    ALL = (PENDING, PROCESSING, INDEXED, FAILED, DISABLED)


class UserStatus:
    ACTIVE = "active"
    SUSPENDED = "suspended"
    ALL = (ACTIVE, SUSPENDED)
