"""Official update lifecycle.

Publication is a distinct, permission-gated, audited operation. Creating or
editing an update never publishes it, and an AI-generated citizen summary is
stored unapproved until a human explicitly approves it.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.orm import Session as DbSession

from app.models import (
    Importance,
    OfficialSource,
    OfficialUpdate,
    UpdateCategory,
    UpdateStatus,
    utcnow,
)
from app.security.rbac import Permission
from app.security.sanitize import clean_line, clean_text, safe_url
from app.services import audit
from app.services.context import Actor


def list_published(
    db: DbSession,
    *,
    category: str | None = None,
    importance: str | None = None,
    query: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[OfficialUpdate], int]:
    stmt = select(OfficialUpdate).where(OfficialUpdate.status == UpdateStatus.PUBLISHED)
    if category and category in UpdateCategory.ALL:
        stmt = stmt.where(OfficialUpdate.category == category)
    if importance and importance in Importance.ALL:
        stmt = stmt.where(OfficialUpdate.importance == importance)
    if query:
        needle = f"%{clean_line(query, max_length=120)}%"
        stmt = stmt.where(
            or_(
                OfficialUpdate.title.ilike(needle),
                OfficialUpdate.content.ilike(needle),
                OfficialUpdate.organization.ilike(needle),
            )
        )
    total = len(db.scalars(stmt).all())
    rows = db.scalars(
        stmt.order_by(OfficialUpdate.published_at.desc().nullslast()).limit(limit).offset(offset)
    ).all()
    return list(rows), total


def get_published(db: DbSession, update_id: int) -> OfficialUpdate | None:
    return db.scalar(
        select(OfficialUpdate).where(
            OfficialUpdate.id == update_id,
            OfficialUpdate.status == UpdateStatus.PUBLISHED,
        )
    )


def list_for_dashboard(
    db: DbSession, *, status: str | None = None, limit: int = 50
) -> list[OfficialUpdate]:
    stmt = select(OfficialUpdate).order_by(OfficialUpdate.updated_at.desc())
    if status and status in UpdateStatus.ALL:
        stmt = stmt.where(OfficialUpdate.status == status)
    return list(db.scalars(stmt.limit(limit)).all())


def create(
    db: DbSession,
    actor: Actor,
    *,
    title: str,
    content: str,
    category: str,
    importance: str,
    source_id: int | None = None,
    source_url: str | None = None,
    crisis_id: int | None = None,
    scheduled_for: datetime | None = None,
    is_demo: bool = False,
) -> OfficialUpdate:
    actor.require(Permission.UPDATES_CREATE)
    _validate(category, importance)

    organization = ""
    if source_id is not None:
        source = db.get(OfficialSource, source_id)
        if source is None:
            raise LookupError("official source not found")
        organization = source.name

    update = OfficialUpdate(
        title=clean_line(title, max_length=255),
        content=clean_text(content, max_length=20_000),
        category=category,
        importance=importance,
        status=UpdateStatus.SCHEDULED if scheduled_for else UpdateStatus.DRAFT,
        source_id=source_id,
        organization=organization,
        source_url=safe_url(source_url),
        crisis_id=crisis_id,
        scheduled_for=scheduled_for,
        created_by=actor.user_id,
        is_demo=is_demo,
    )
    if not update.title or not update.content:
        raise ValueError("title and content are required")

    db.add(update)
    db.commit()
    db.refresh(update)
    audit.record(
        db,
        actor,
        audit.Action.UPDATE_CREATE,
        object_type="official_update",
        object_id=update.id,
        new_value={"title": update.title, "status": update.status},
    )
    return update


def edit(db: DbSession, actor: Actor, update_id: int, **changes) -> OfficialUpdate:
    actor.require(Permission.UPDATES_EDIT)
    update = _get(db, update_id)
    before = _snapshot(update)

    if "title" in changes:
        update.title = clean_line(changes["title"], max_length=255)
    if "content" in changes:
        update.content = clean_text(changes["content"], max_length=20_000)
    if "category" in changes:
        _validate(changes["category"], update.importance)
        update.category = changes["category"]
    if "importance" in changes:
        _validate(update.category, changes["importance"])
        update.importance = changes["importance"]
    if "source_url" in changes:
        update.source_url = safe_url(changes["source_url"])
    if "source_id" in changes:
        source_id = changes["source_id"]
        update.source_id = source_id
        if source_id:
            source = db.get(OfficialSource, source_id)
            if source is None:
                raise LookupError("official source not found")
            update.organization = source.name
    if "scheduled_for" in changes:
        update.scheduled_for = changes["scheduled_for"]

    db.commit()
    db.refresh(update)
    audit.record(
        db,
        actor,
        audit.Action.UPDATE_EDIT,
        object_type="official_update",
        object_id=update.id,
        old_value=before,
        new_value=_snapshot(update),
    )
    return update


def store_ai_suggestion(
    db: DbSession, actor: Actor, update_id: int, *, citizen_summary: str
) -> OfficialUpdate:
    """Attach an AI-drafted citizen summary.

    The suggestion is stored **unapproved**. Nothing on the public site reads an
    unapproved summary, so an AI draft cannot reach citizens by this path.
    """
    actor.require(Permission.UPDATES_EDIT)
    update = _get(db, update_id)
    update.citizen_summary = clean_text(citizen_summary, max_length=4000)
    update.citizen_summary_approved = False
    db.commit()
    db.refresh(update)
    audit.record(
        db,
        actor,
        audit.Action.UPDATE_AI_SUGGESTION,
        object_type="official_update",
        object_id=update.id,
        new_value={"citizen_summary_chars": len(update.citizen_summary or "")},
    )
    return update


def approve_ai_summary(db: DbSession, actor: Actor, update_id: int) -> OfficialUpdate:
    """A human accepts the AI summary for public display."""
    actor.require(Permission.UPDATES_PUBLISH)
    update = _get(db, update_id)
    if not update.citizen_summary:
        raise ValueError("there is no summary to approve")
    update.citizen_summary_approved = True
    db.commit()
    db.refresh(update)
    audit.record(
        db,
        actor,
        audit.Action.UPDATE_EDIT,
        object_type="official_update",
        object_id=update.id,
        new_value={"citizen_summary_approved": True},
    )
    return update


def publish(db: DbSession, actor: Actor, update_id: int) -> OfficialUpdate:
    """Make an update publicly visible. The only path to ``PUBLISHED``."""
    actor.require(Permission.UPDATES_PUBLISH)
    update = _get(db, update_id)
    if update.status == UpdateStatus.PUBLISHED:
        return update

    before = _snapshot(update)
    update.status = UpdateStatus.PUBLISHED
    update.published_at = utcnow()
    update.approved_by = actor.user_id
    update.verified = True
    db.commit()
    db.refresh(update)
    audit.record(
        db,
        actor,
        audit.Action.UPDATE_PUBLISH,
        object_type="official_update",
        object_id=update.id,
        old_value=before,
        new_value=_snapshot(update),
    )
    return update


def archive(db: DbSession, actor: Actor, update_id: int) -> OfficialUpdate:
    actor.require(Permission.UPDATES_ARCHIVE)
    update = _get(db, update_id)
    before = _snapshot(update)
    update.status = UpdateStatus.ARCHIVED
    db.commit()
    db.refresh(update)
    audit.record(
        db,
        actor,
        audit.Action.UPDATE_ARCHIVE,
        object_type="official_update",
        object_id=update.id,
        old_value=before,
        new_value=_snapshot(update),
    )
    return update


def publish_due_scheduled(db: DbSession, actor: Actor) -> int:
    """Publish updates whose scheduled time has arrived.

    Called on request by the dashboard rather than by a background scheduler, so
    the platform has no hidden process that publishes without a human present.
    """
    actor.require(Permission.UPDATES_PUBLISH)
    now = utcnow()
    due = db.scalars(
        select(OfficialUpdate).where(
            OfficialUpdate.status == UpdateStatus.SCHEDULED,
            OfficialUpdate.scheduled_for.is_not(None),
        )
    ).all()
    count = 0
    for update in due:
        scheduled = update.scheduled_for
        if scheduled and _aware(scheduled) <= now:
            publish(db, actor, update.id)
            count += 1
    return count


def _aware(value):
    from datetime import timezone

    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _get(db: DbSession, update_id: int) -> OfficialUpdate:
    update = db.get(OfficialUpdate, update_id)
    if update is None:
        raise LookupError("official update not found")
    return update


def _snapshot(update: OfficialUpdate) -> dict:
    return {
        "title": update.title,
        "status": update.status,
        "category": update.category,
        "importance": update.importance,
        "organization": update.organization,
    }


def _validate(category: str, importance: str) -> None:
    if category not in UpdateCategory.ALL:
        raise ValueError(f"invalid category '{category}'")
    if importance not in Importance.ALL:
        raise ValueError(f"invalid importance '{importance}'")
