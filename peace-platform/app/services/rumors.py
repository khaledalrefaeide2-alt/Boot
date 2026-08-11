"""Rumor verification workflow.

The governance rule this module enforces:

    A rumor becomes publicly visible only when a human holding
    ``rumors.publish`` calls :func:`publish`, and only after a human has
    supplied the correction text and verdict.

AI analysis writes exclusively to the ``ai_*`` columns. There is no code path
anywhere that copies an ``ai_*`` value into ``correction``/``status`` without a
human passing it in — see :func:`review`.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from app.models import Rumor, RumorStatus, utcnow
from app.security.rbac import Permission
from app.security.sanitize import clean_line, clean_text, normalize_question, safe_url
from app.services import audit
from app.services.context import Actor

#: A submission whose normalised claim matches an existing one increments that
#: rumor's report count instead of creating a duplicate. That count is the
#: platform's honest spread signal — it measures reports received, not reach.
_DUPLICATE_LOOKBACK = 500


def submit(
    db: DbSession,
    actor: Actor,
    *,
    claim: str,
    source_platform: str | None = None,
    seen_where: str | None = None,
    related_to_crisis: bool = True,
    crisis_id: int | None = None,
) -> tuple[Rumor, bool]:
    """Accept a citizen submission. Returns ``(rumor, is_new)``.

    Submission is open to anonymous citizens by design, so this function takes
    no permission — but it is rate-limited at the route and every submission is
    audited with a hashed IP.
    """
    text = clean_text(claim, max_length=4000)
    if len(text) < 10:
        raise ValueError("Please describe the claim in a little more detail.")

    normalized = normalize_question(text)
    existing = _find_duplicate(db, normalized)
    if existing is not None:
        existing.report_count += 1
        existing.spread_score = _spread_from_reports(existing.report_count)
        db.commit()
        db.refresh(existing)
        audit.record(
            db,
            actor,
            audit.Action.RUMOR_SUBMIT,
            object_type="rumor",
            object_id=existing.id,
            new_value={"duplicate_of": existing.id, "report_count": existing.report_count},
        )
        return existing, False

    rumor = Rumor(
        claim=text,
        raw_submission=text,
        source_platform=clean_line(source_platform, max_length=120) or None,
        seen_where=clean_line(seen_where, max_length=255) or None,
        related_to_crisis=bool(related_to_crisis),
        crisis_id=crisis_id,
        submitter_ip_hash=actor.ip_hash,
        status=RumorStatus.UNVERIFIED,
        spread_score=_spread_from_reports(1),
        report_count=1,
    )
    db.add(rumor)
    db.commit()
    db.refresh(rumor)
    audit.record(
        db,
        actor,
        audit.Action.RUMOR_SUBMIT,
        object_type="rumor",
        object_id=rumor.id,
        new_value={"claim_chars": len(text), "platform": rumor.source_platform},
    )
    return rumor, True


def store_ai_analysis(
    db: DbSession,
    actor: Actor,
    rumor_id: int,
    *,
    classification: str | None,
    confidence: float | None,
    correction: str | None,
    rationale: str | None,
    citations: list | None,
    risk_score: float | None = None,
) -> Rumor:
    """Record the assistant's assessment as a *suggestion*.

    Moves the rumor to ``UNDER_REVIEW`` so it appears in the reviewer queue.
    It writes nothing a citizen can see.
    """
    rumor = _get(db, rumor_id)
    rumor.ai_classification = classification
    rumor.ai_confidence = confidence
    rumor.ai_correction = clean_text(correction, max_length=4000) if correction else None
    rumor.ai_rationale = clean_text(rationale, max_length=4000) if rationale else None
    rumor.ai_citations = citations or []
    if risk_score is not None:
        rumor.risk_score = max(0.0, min(1.0, float(risk_score)))
    if rumor.status == RumorStatus.UNVERIFIED:
        rumor.status = RumorStatus.UNDER_REVIEW
    db.commit()
    db.refresh(rumor)
    audit.record(
        db,
        actor,
        audit.Action.RUMOR_ANALYZE,
        object_type="rumor",
        object_id=rumor.id,
        new_value={
            "ai_classification": classification,
            "ai_confidence": confidence,
            "note": "advisory only; requires human approval before publication",
        },
    )
    return rumor


def review(
    db: DbSession,
    actor: Actor,
    rumor_id: int,
    *,
    status: str,
    correction: str,
    explanation: str = "",
    evidence_url: str | None = None,
    evidence_source_id: int | None = None,
) -> Rumor:
    """A human records the verdict and the citizen-facing correction text.

    ``correction`` is required for any concluded verdict: the platform never
    tells a citizen a claim is false without also telling them what is true.
    """
    actor.require(Permission.RUMORS_REVIEW)
    if status not in RumorStatus.ALL:
        raise ValueError(f"invalid rumor status '{status}'")

    rumor = _get(db, rumor_id)
    before = _snapshot(rumor)

    correction_text = clean_text(correction, max_length=4000)
    if status in RumorStatus.CONCLUDED and len(correction_text) < 10:
        raise ValueError(
            "A concluded rumor needs correction text explaining what is actually true."
        )

    rumor.status = status
    rumor.correction = correction_text or None
    rumor.explanation = clean_text(explanation, max_length=4000) or None
    rumor.evidence_url = safe_url(evidence_url)
    rumor.evidence_source_id = evidence_source_id
    rumor.reviewed_by = actor.user_id
    rumor.checked_at = utcnow()
    db.commit()
    db.refresh(rumor)

    audit.record(
        db,
        actor,
        audit.Action.RUMOR_REVIEW,
        object_type="rumor",
        object_id=rumor.id,
        old_value=before,
        new_value=_snapshot(rumor),
    )
    return rumor


def publish(db: DbSession, actor: Actor, rumor_id: int) -> Rumor:
    """Publish a verified rumor. The single gate to public visibility.

    Refuses unless a human has already recorded a concluded verdict *and* a
    correction. An unreviewed rumor — however confident the AI — cannot pass.
    """
    actor.require(Permission.RUMORS_PUBLISH)
    rumor = _get(db, rumor_id)

    if rumor.status not in RumorStatus.CONCLUDED:
        raise ValueError(
            "Only a rumor with a concluded verdict can be published. "
            "Record a review decision first."
        )
    if not rumor.correction or len(rumor.correction.strip()) < 10:
        raise ValueError("Cannot publish without correction text.")
    if rumor.reviewed_by is None:
        raise ValueError("Cannot publish a rumor that no human has reviewed.")

    before = _snapshot(rumor)
    rumor.published = True
    rumor.published_at = utcnow()
    db.commit()
    db.refresh(rumor)
    audit.record(
        db,
        actor,
        audit.Action.RUMOR_PUBLISH,
        object_type="rumor",
        object_id=rumor.id,
        old_value=before,
        new_value=_snapshot(rumor),
    )
    return rumor


def unpublish(db: DbSession, actor: Actor, rumor_id: int, reason: str = "") -> Rumor:
    actor.require(Permission.RUMORS_PUBLISH)
    rumor = _get(db, rumor_id)
    before = _snapshot(rumor)
    rumor.published = False
    db.commit()
    db.refresh(rumor)
    audit.record(
        db,
        actor,
        audit.Action.RUMOR_UNPUBLISH,
        object_type="rumor",
        object_id=rumor.id,
        old_value=before,
        new_value={**_snapshot(rumor), "reason": clean_line(reason, max_length=500)},
    )
    return rumor


def archive(db: DbSession, actor: Actor, rumor_id: int) -> Rumor:
    actor.require(Permission.RUMORS_ARCHIVE)
    rumor = _get(db, rumor_id)
    before = _snapshot(rumor)
    rumor.status = RumorStatus.RESOLVED
    rumor.published = False
    db.commit()
    db.refresh(rumor)
    audit.record(
        db,
        actor,
        audit.Action.RUMOR_ARCHIVE,
        object_type="rumor",
        object_id=rumor.id,
        old_value=before,
        new_value=_snapshot(rumor),
    )
    return rumor


# --- Reads -------------------------------------------------------------------


def list_public(db: DbSession, *, limit: int = 20, offset: int = 0) -> list[Rumor]:
    """Published rumors only. This is the sole query the public site may use."""
    return list(
        db.scalars(
            select(Rumor)
            .where(Rumor.published.is_(True))
            .order_by(Rumor.published_at.desc().nullslast())
            .limit(limit)
            .offset(offset)
        ).all()
    )


def get_public(db: DbSession, rumor_id: int) -> Rumor | None:
    return db.scalar(select(Rumor).where(Rumor.id == rumor_id, Rumor.published.is_(True)))


def trending(db: DbSession, limit: int = 3) -> list[Rumor]:
    return list(
        db.scalars(
            select(Rumor)
            .where(Rumor.published.is_(True))
            .order_by(Rumor.spread_score.desc(), Rumor.published_at.desc().nullslast())
            .limit(limit)
        ).all()
    )


def list_for_dashboard(
    db: DbSession, *, status: str | None = None, limit: int = 50
) -> list[Rumor]:
    stmt = select(Rumor).order_by(Rumor.risk_score.desc(), Rumor.created_at.desc())
    if status and status in RumorStatus.ALL:
        stmt = stmt.where(Rumor.status == status)
    return list(db.scalars(stmt.limit(limit)).all())


def pending_review_count(db: DbSession) -> int:
    return int(
        db.scalar(
            select(func.count(Rumor.id)).where(
                Rumor.status.in_((RumorStatus.UNVERIFIED, RumorStatus.UNDER_REVIEW))
            )
        )
        or 0
    )


def get(db: DbSession, rumor_id: int) -> Rumor | None:
    return db.get(Rumor, rumor_id)


# --- Internals ---------------------------------------------------------------


def _find_duplicate(db: DbSession, normalized: str) -> Rumor | None:
    if not normalized:
        return None
    recent = db.scalars(
        select(Rumor).order_by(Rumor.created_at.desc()).limit(_DUPLICATE_LOOKBACK)
    ).all()
    for rumor in recent:
        if normalize_question(rumor.claim) == normalized:
            return rumor
    return None


def _spread_from_reports(count: int) -> float:
    """Map report count to a 0–1 spread score with diminishing returns.

    Honest by construction: it reflects how many people told *us*, which is the
    only spread signal the platform actually has. It is never presented as
    social-media reach.
    """
    return round(min(1.0, count / (count + 9.0) * 2.0), 3)


def _get(db: DbSession, rumor_id: int) -> Rumor:
    rumor = db.get(Rumor, rumor_id)
    if rumor is None:
        raise LookupError("rumor not found")
    return rumor


def _snapshot(rumor: Rumor) -> dict:
    return {
        "status": rumor.status,
        "published": rumor.published,
        "reviewed_by": rumor.reviewed_by,
        "has_correction": bool(rumor.correction),
    }
