"""The audit trail.

``record()`` is the only writer of ``audit_logs`` in the entire application, and
there is no updater or deleter — the table is append-only from the app's point
of view. ``docs/SECURITY.md`` describes enforcing that at the database level too.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.models import AuditLog
from app.services.context import Actor

logger = logging.getLogger("peace.audit")


class Action:
    LOGIN_SUCCESS = "auth.login.success"
    LOGIN_FAILURE = "auth.login.failure"
    LOGIN_LOCKED = "auth.login.locked"
    LOGOUT = "auth.logout"

    UPDATE_CREATE = "update.create"
    UPDATE_EDIT = "update.edit"
    UPDATE_PUBLISH = "update.publish"
    UPDATE_ARCHIVE = "update.archive"
    UPDATE_AI_SUGGESTION = "update.ai_suggestion"

    RUMOR_SUBMIT = "rumor.submit"
    RUMOR_ANALYZE = "rumor.ai_analyze"
    RUMOR_REVIEW = "rumor.review"
    RUMOR_PUBLISH = "rumor.publish"
    RUMOR_UNPUBLISH = "rumor.unpublish"
    RUMOR_ARCHIVE = "rumor.archive"

    FAQ_CREATE = "faq.create"
    FAQ_EDIT = "faq.edit"
    FAQ_PUBLISH = "faq.publish"
    FAQ_MERGE = "faq.merge"
    FAQ_DELETE = "faq.delete"

    SERVICE_CREATE = "service.create"
    SERVICE_EDIT = "service.edit"
    SERVICE_STATUS = "service.status_change"

    SOURCE_CREATE = "source.create"
    SOURCE_EDIT = "source.edit"

    GUIDANCE_EDIT = "guidance.edit"

    ALERT_CREATE = "alert.create"
    ALERT_EDIT = "alert.edit"
    ALERT_DEACTIVATE = "alert.deactivate"

    REPORT_SUBMIT = "report.submit"
    REPORT_TRIAGE = "report.triage"

    CRISIS_CREATE = "crisis.create"
    CRISIS_EDIT = "crisis.edit"
    EMERGENCY_MODE = "system.emergency_mode"

    AI_CONFIG_CHANGE = "ai.config_change"
    KNOWLEDGE_ADD = "knowledge.add"
    KNOWLEDGE_REINDEX = "knowledge.reindex"
    KNOWLEDGE_DISABLE = "knowledge.disable"
    AI_ANSWER_CORRECTED = "ai.answer_corrected"

    USER_CREATE = "user.create"
    USER_EDIT = "user.edit"
    USER_ROLE_CHANGE = "user.role_change"
    USER_SUSPEND = "user.suspend"
    USER_PASSWORD_RESET = "user.password_reset"


def _jsonable(value: Any) -> Any:
    """Coerce arbitrary values into something the JSON column accepts."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    return str(value)


def record(
    db: DbSession,
    actor: Actor,
    action: str,
    *,
    object_type: str | None = None,
    object_id: str | int | None = None,
    old_value: dict | None = None,
    new_value: dict | None = None,
    commit: bool = True,
) -> AuditLog:
    """Append one audit entry.

    Flushed with the caller's transaction by default so that an action and its
    audit record commit together — an operation can never succeed while its
    audit entry is rolled back.
    """
    entry = AuditLog(
        user_id=actor.user_id,
        user_email=actor.email,
        role=actor.role,
        action=action,
        object_type=object_type,
        object_id=str(object_id) if object_id is not None else None,
        old_value=_jsonable(old_value),
        new_value=_jsonable(new_value),
        ip_hash=actor.ip_hash,
        user_agent=(actor.user_agent or "")[:255] or None,
    )
    db.add(entry)
    if commit:
        db.commit()
        db.refresh(entry)
    else:
        db.flush()

    logger.info(
        "audit %s",
        json.dumps(
            {
                "action": action,
                "actor": actor.email,
                "role": actor.role,
                "object": f"{object_type}:{object_id}" if object_type else None,
            },
            ensure_ascii=False,
        ),
    )
    return entry


def search(
    db: DbSession,
    *,
    action: str | None = None,
    object_type: str | None = None,
    user_email: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[AuditLog]:
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if object_type:
        stmt = stmt.where(AuditLog.object_type == object_type)
    if user_email:
        stmt = stmt.where(AuditLog.user_email == user_email)
    return list(db.scalars(stmt.limit(min(limit, 500)).offset(offset)).all())
