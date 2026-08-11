"""Safety guidance content.

Guidance is the one content type where an AI-invented instruction could get
someone hurt. The assistant is therefore never allowed to write here: guidance
is authored by humans and, where it derives from an official manual, carries a
``source_id`` pointing at the organisation it came from.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.models import ContentStatus, Guidance, GuidanceAudience, GuidanceKind, GuidancePhase
from app.security.rbac import Permission
from app.security.sanitize import clean_line, clean_text
from app.services import audit
from app.services.context import Actor


def list_published(
    db: DbSession, *, phase: str | None = None, audience: str | None = None
) -> list[Guidance]:
    stmt = select(Guidance).where(Guidance.status == ContentStatus.PUBLISHED)
    if phase and phase in GuidancePhase.ALL:
        stmt = stmt.where(Guidance.phase == phase)
    if audience and audience in GuidanceAudience.ALL:
        stmt = stmt.where(Guidance.audience == audience)
    return list(db.scalars(stmt.order_by(Guidance.sort_order, Guidance.id)).all())


def grouped(db: DbSession) -> dict[str, dict[str, list[Guidance]]]:
    """Guidance organised as ``{phase: {audience: [items]}}`` for the template."""
    result: dict[str, dict[str, list[Guidance]]] = {
        phase: {audience: [] for audience in GuidanceAudience.ALL}
        for phase in GuidancePhase.ALL
    }
    for item in list_published(db):
        result.setdefault(item.phase, {}).setdefault(item.audience, []).append(item)
    return result


def create(
    db: DbSession,
    actor: Actor,
    *,
    phase: str,
    audience: str,
    kind: str,
    title: str,
    body: str,
    sort_order: int = 100,
    source_id: int | None = None,
    publish: bool = True,
    is_demo: bool = False,
) -> Guidance:
    actor.require(Permission.GUIDANCE_MANAGE)
    if phase not in GuidancePhase.ALL:
        raise ValueError(f"invalid guidance phase '{phase}'")
    if audience not in GuidanceAudience.ALL:
        raise ValueError(f"invalid guidance audience '{audience}'")
    if kind not in GuidanceKind.ALL:
        raise ValueError(f"invalid guidance kind '{kind}'")

    item = Guidance(
        phase=phase,
        audience=audience,
        kind=kind,
        title=clean_line(title, max_length=255),
        body=clean_text(body, max_length=4000),
        sort_order=sort_order,
        source_id=source_id,
        status=ContentStatus.PUBLISHED if publish else ContentStatus.DRAFT,
        is_demo=is_demo,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    audit.record(
        db,
        actor,
        audit.Action.GUIDANCE_EDIT,
        object_type="guidance",
        object_id=item.id,
        new_value={"phase": phase, "audience": audience, "title": item.title},
    )
    return item
