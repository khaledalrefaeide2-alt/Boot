"""Public alert banners."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.models import Alert, AlertType, utcnow
from app.security.rbac import Permission
from app.security.sanitize import clean_text
from app.services import audit
from app.services.context import Actor

#: Lower sorts first. Urgent alerts outrank everything, but the visual
#: treatment stays restrained — see docs/ARCHITECTURE.md on colour discipline.
_TYPE_PRIORITY = {AlertType.URGENT: 10, AlertType.IMPORTANT: 50, AlertType.AWARENESS: 100}


def active(db: DbSession, placement: str = "global") -> list[Alert]:
    now = utcnow()
    rows = db.scalars(
        select(Alert)
        .where(Alert.active.is_(True), Alert.placement.in_((placement, "global")))
        .order_by(Alert.priority, Alert.created_at.desc())
    ).all()
    return [a for a in rows if _in_window(a, now)]


def list_all(db: DbSession, limit: int = 100) -> list[Alert]:
    return list(db.scalars(select(Alert).order_by(Alert.created_at.desc()).limit(limit)).all())


def create(
    db: DbSession,
    actor: Actor,
    *,
    type: str,
    message: str,
    placement: str = "global",
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
    related_update_id: int | None = None,
) -> Alert:
    actor.require(Permission.ALERTS_MANAGE)
    if type not in AlertType.ALL:
        raise ValueError(f"invalid alert type '{type}'")
    text = clean_text(message, max_length=600)
    if not text:
        raise ValueError("alert message is required")

    alert = Alert(
        type=type,
        message=text,
        placement=placement or "global",
        priority=_TYPE_PRIORITY[type],
        starts_at=starts_at,
        ends_at=ends_at,
        related_update_id=related_update_id,
        created_by=actor.user_id,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    audit.record(
        db,
        actor,
        audit.Action.ALERT_CREATE,
        object_type="alert",
        object_id=alert.id,
        new_value={"type": type, "placement": alert.placement},
    )
    return alert


def deactivate(db: DbSession, actor: Actor, alert_id: int) -> Alert:
    actor.require(Permission.ALERTS_MANAGE)
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise LookupError("alert not found")
    alert.active = False
    db.commit()
    db.refresh(alert)
    audit.record(
        db,
        actor,
        audit.Action.ALERT_DEACTIVATE,
        object_type="alert",
        object_id=alert.id,
        new_value={"active": False},
    )
    return alert


def _in_window(alert: Alert, now: datetime) -> bool:
    from datetime import timezone

    def aware(value):
        if value is None:
            return None
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

    starts, ends = aware(alert.starts_at), aware(alert.ends_at)
    if starts and starts > now:
        return False
    if ends and ends <= now:
        return False
    return True
