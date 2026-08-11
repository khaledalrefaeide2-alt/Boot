"""Emergency services directory and the official sources register.

Emergency contact details are the highest-stakes data in the platform: a wrong
number during a flood is worse than no number. Two consequences show up here:

* every change is audited with the previous value, so a bad edit is traceable;
* demo records carry ``is_demo`` and every template that renders a number
  checks it. Seeded numbers use the reserved ``555`` range.
"""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.models import AssistanceService, OfficialSource, ServiceStatus
from app.security.rbac import Permission
from app.security.sanitize import clean_line, clean_text, normalize_digits, safe_url
from app.services import audit
from app.services.context import Actor

SERVICE_TYPES = (
    "general_emergency",
    "civil_defense",
    "ambulance",
    "police",
    "electricity",
    "water",
    "municipality",
    "government_call_center",
    "hospital",
    "shelter",
)

_PHONE_RE = re.compile(r"^[0-9+][0-9\s\-()]{1,30}$")


# --- Assistance services -----------------------------------------------------


def list_services(
    db: DbSession, *, service_type: str | None = None, include_inactive: bool = False
) -> list[AssistanceService]:
    stmt = select(AssistanceService).order_by(
        AssistanceService.sort_order, AssistanceService.organization
    )
    if not include_inactive:
        stmt = stmt.where(AssistanceService.status != ServiceStatus.INACTIVE)
    if service_type and service_type in SERVICE_TYPES:
        stmt = stmt.where(AssistanceService.service_type == service_type)
    return list(db.scalars(stmt).all())


def create_service(
    db: DbSession,
    actor: Actor,
    *,
    organization: str,
    phone: str,
    service_type: str,
    hours: str = "",
    website: str | None = None,
    location: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    notes: str | None = None,
    sort_order: int = 100,
    is_demo: bool = False,
) -> AssistanceService:
    actor.require(Permission.SERVICES_MANAGE)
    if service_type not in SERVICE_TYPES:
        raise ValueError(f"invalid service type '{service_type}'")

    service = AssistanceService(
        organization=clean_line(organization, max_length=160),
        phone=_validate_phone(phone),
        service_type=service_type,
        hours=clean_line(hours, max_length=160),
        website=safe_url(website),
        location=clean_line(location, max_length=255) or None,
        latitude=latitude,
        longitude=longitude,
        notes=clean_text(notes, max_length=1000) or None,
        sort_order=sort_order,
        is_demo=is_demo,
    )
    db.add(service)
    db.commit()
    db.refresh(service)
    audit.record(
        db,
        actor,
        audit.Action.SERVICE_CREATE,
        object_type="assistance_service",
        object_id=service.id,
        new_value={"organization": service.organization, "phone": service.phone},
    )
    return service


def edit_service(db: DbSession, actor: Actor, service_id: int, **changes) -> AssistanceService:
    actor.require(Permission.SERVICES_MANAGE)
    service = _get_service(db, service_id)
    before = _service_snapshot(service)

    if "organization" in changes:
        service.organization = clean_line(changes["organization"], max_length=160)
    if "phone" in changes:
        service.phone = _validate_phone(changes["phone"])
    if "service_type" in changes:
        if changes["service_type"] not in SERVICE_TYPES:
            raise ValueError("invalid service type")
        service.service_type = changes["service_type"]
    if "hours" in changes:
        service.hours = clean_line(changes["hours"], max_length=160)
    if "website" in changes:
        service.website = safe_url(changes["website"])
    if "location" in changes:
        service.location = clean_line(changes["location"], max_length=255) or None
    if "notes" in changes:
        service.notes = clean_text(changes["notes"], max_length=1000) or None
    if "status" in changes:
        if changes["status"] not in ServiceStatus.ALL:
            raise ValueError("invalid service status")
        service.status = changes["status"]

    db.commit()
    db.refresh(service)
    action = (
        audit.Action.SERVICE_STATUS
        if set(changes) == {"status"}
        else audit.Action.SERVICE_EDIT
    )
    audit.record(
        db,
        actor,
        action,
        object_type="assistance_service",
        object_id=service.id,
        old_value=before,
        new_value=_service_snapshot(service),
    )
    return service


# --- Official sources --------------------------------------------------------


def list_sources(db: DbSession, *, include_inactive: bool = False) -> list[OfficialSource]:
    stmt = select(OfficialSource).order_by(
        OfficialSource.trust_level.desc(), OfficialSource.name
    )
    if not include_inactive:
        stmt = stmt.where(OfficialSource.is_active.is_(True))
    return list(db.scalars(stmt).all())


def get_source(db: DbSession, source_id: int) -> OfficialSource | None:
    return db.get(OfficialSource, source_id)


def create_source(
    db: DbSession,
    actor: Actor,
    *,
    name: str,
    slug: str,
    organization: str = "",
    url: str | None = None,
    type: str = "government",
    trust_level: int = 3,
    why_trusted: str = "",
    social_links: dict | None = None,
    is_demo: bool = False,
) -> OfficialSource:
    actor.require(Permission.SOURCES_MANAGE)
    if not 1 <= int(trust_level) <= 5:
        raise ValueError("trust_level must be between 1 and 5")

    source = OfficialSource(
        name=clean_line(name, max_length=160),
        slug=clean_line(slug, max_length=160).lower().replace(" ", "-"),
        organization=clean_line(organization, max_length=160),
        url=safe_url(url),
        type=clean_line(type, max_length=64),
        trust_level=int(trust_level),
        why_trusted=clean_text(why_trusted, max_length=2000),
        social_links=social_links or {},
        is_demo=is_demo,
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    audit.record(
        db,
        actor,
        audit.Action.SOURCE_CREATE,
        object_type="official_source",
        object_id=source.id,
        new_value={"name": source.name, "trust_level": source.trust_level},
    )
    return source


def edit_source(db: DbSession, actor: Actor, source_id: int, **changes) -> OfficialSource:
    actor.require(Permission.SOURCES_MANAGE)
    source = db.get(OfficialSource, source_id)
    if source is None:
        raise LookupError("official source not found")
    before = {
        "name": source.name,
        "trust_level": source.trust_level,
        "is_active": source.is_active,
    }

    if "name" in changes:
        source.name = clean_line(changes["name"], max_length=160)
    if "url" in changes:
        source.url = safe_url(changes["url"])
    if "trust_level" in changes:
        level = int(changes["trust_level"])
        if not 1 <= level <= 5:
            raise ValueError("trust_level must be between 1 and 5")
        source.trust_level = level
    if "why_trusted" in changes:
        source.why_trusted = clean_text(changes["why_trusted"], max_length=2000)
    if "is_active" in changes:
        source.is_active = bool(changes["is_active"])

    db.commit()
    db.refresh(source)
    audit.record(
        db,
        actor,
        audit.Action.SOURCE_EDIT,
        object_type="official_source",
        object_id=source.id,
        old_value=before,
        new_value={
            "name": source.name,
            "trust_level": source.trust_level,
            "is_active": source.is_active,
        },
    )
    return source


# --- Internals ---------------------------------------------------------------


def _validate_phone(value: str) -> str:
    phone = normalize_digits(clean_line(value, max_length=48))
    if not phone or not _PHONE_RE.match(phone):
        raise ValueError(
            "Phone number must contain only digits, spaces, +, - and parentheses."
        )
    return phone


def _get_service(db: DbSession, service_id: int) -> AssistanceService:
    service = db.get(AssistanceService, service_id)
    if service is None:
        raise LookupError("assistance service not found")
    return service


def _service_snapshot(service: AssistanceService) -> dict:
    return {
        "organization": service.organization,
        "phone": service.phone,
        "service_type": service.service_type,
        "status": service.status,
        "hours": service.hours,
    }
