"""Crisis records and the platform's notion of "the current crisis"."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.models import Crisis, CrisisStatus, Severity, utcnow
from app.security.rbac import Permission
from app.security.sanitize import clean_line, clean_text
from app.services import audit
from app.services.context import Actor


def current(db: DbSession) -> Crisis | None:
    return db.scalar(
        select(Crisis).where(Crisis.is_active.is_(True)).order_by(Crisis.updated_at.desc())
    )


def list_all(db: DbSession) -> list[Crisis]:
    return list(db.scalars(select(Crisis).order_by(Crisis.created_at.desc())).all())


def create(
    db: DbSession,
    actor: Actor,
    *,
    code: str,
    type: str,
    title: str,
    severity: str,
    status: str,
    description: str = "",
    make_active: bool = False,
    is_demo: bool = False,
) -> Crisis:
    actor.require(Permission.CRISIS_MANAGE)
    _validate(severity, status)

    crisis = Crisis(
        code=clean_line(code, max_length=64),
        type=clean_line(type, max_length=120),
        title=clean_line(title, max_length=255),
        severity=severity,
        status=status,
        description=clean_text(description, max_length=4000),
        start_date=utcnow(),
        is_demo=is_demo,
    )
    db.add(crisis)
    db.flush()
    if make_active:
        _deactivate_others(db, crisis.id)
        crisis.is_active = True
    db.commit()
    db.refresh(crisis)

    audit.record(
        db,
        actor,
        audit.Action.CRISIS_CREATE,
        object_type="crisis",
        object_id=crisis.id,
        new_value={"code": crisis.code, "severity": severity, "status": status},
    )
    return crisis


def update(
    db: DbSession,
    actor: Actor,
    crisis_id: int,
    *,
    severity: str | None = None,
    status: str | None = None,
    title: str | None = None,
    description: str | None = None,
    make_active: bool | None = None,
) -> Crisis:
    actor.require(Permission.CRISIS_MANAGE)
    crisis = db.get(Crisis, crisis_id)
    if crisis is None:
        raise LookupError("crisis not found")

    before = {
        "severity": crisis.severity,
        "status": crisis.status,
        "is_active": crisis.is_active,
    }
    if severity is not None:
        _validate(severity, crisis.status)
        crisis.severity = severity
    if status is not None:
        _validate(crisis.severity, status)
        crisis.status = status
        if status == CrisisStatus.ENDED and crisis.end_date is None:
            crisis.end_date = utcnow()
    if title is not None:
        crisis.title = clean_line(title, max_length=255)
    if description is not None:
        crisis.description = clean_text(description, max_length=4000)
    if make_active is not None:
        if make_active:
            _deactivate_others(db, crisis.id)
        crisis.is_active = make_active

    db.commit()
    db.refresh(crisis)
    audit.record(
        db,
        actor,
        audit.Action.CRISIS_EDIT,
        object_type="crisis",
        object_id=crisis.id,
        old_value=before,
        new_value={
            "severity": crisis.severity,
            "status": crisis.status,
            "is_active": crisis.is_active,
        },
    )
    return crisis


def _deactivate_others(db: DbSession, keep_id: int) -> None:
    for other in db.scalars(select(Crisis).where(Crisis.is_active.is_(True))).all():
        if other.id != keep_id:
            other.is_active = False


def _validate(severity: str, status: str) -> None:
    if severity not in Severity.ALL:
        raise ValueError(f"invalid severity '{severity}'")
    if status not in CrisisStatus.ALL:
        raise ValueError(f"invalid status '{status}'")
