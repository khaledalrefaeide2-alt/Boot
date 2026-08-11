"""FAQ management, question-frequency tracking and information-gap detection."""

from __future__ import annotations

from collections import Counter

from sqlalchemy import or_, select
from sqlalchemy.orm import Session as DbSession

from app.models import ContentStatus, Faq, UserQuestion
from app.security.rbac import Permission
from app.security.sanitize import clean_line, clean_text, normalize_question
from app.services import audit
from app.services.context import Actor

CATEGORIES = ("education", "roads", "public_services", "health", "assistance", "general")


def list_published(
    db: DbSession, *, category: str | None = None, query: str | None = None
) -> list[Faq]:
    stmt = select(Faq).where(Faq.status == ContentStatus.PUBLISHED)
    if category and category in CATEGORIES:
        stmt = stmt.where(Faq.category == category)
    if query:
        needle = f"%{clean_line(query, max_length=120)}%"
        stmt = stmt.where(or_(Faq.question.ilike(needle), Faq.answer.ilike(needle)))
    return list(db.scalars(stmt.order_by(Faq.frequency.desc(), Faq.question)).all())


def popular(db: DbSession, limit: int = 5) -> list[Faq]:
    return list(
        db.scalars(
            select(Faq)
            .where(Faq.status == ContentStatus.PUBLISHED)
            .order_by(Faq.frequency.desc())
            .limit(limit)
        ).all()
    )


def list_for_dashboard(db: DbSession, *, limit: int = 200) -> list[Faq]:
    return list(db.scalars(select(Faq).order_by(Faq.frequency.desc()).limit(limit)).all())


def create(
    db: DbSession,
    actor: Actor,
    *,
    question: str,
    answer: str,
    category: str = "general",
    publish: bool = False,
    is_demo: bool = False,
) -> Faq:
    actor.require(Permission.FAQS_MANAGE)
    if category not in CATEGORIES:
        raise ValueError(f"invalid FAQ category '{category}'")
    faq = Faq(
        question=clean_line(question, max_length=500),
        answer=clean_text(answer, max_length=8000),
        category=category,
        status=ContentStatus.PUBLISHED if publish else ContentStatus.DRAFT,
        created_by=actor.user_id,
        updated_by=actor.user_id,
        is_demo=is_demo,
    )
    if not faq.question or not faq.answer:
        raise ValueError("question and answer are required")
    db.add(faq)
    db.commit()
    db.refresh(faq)
    audit.record(
        db,
        actor,
        audit.Action.FAQ_CREATE,
        object_type="faq",
        object_id=faq.id,
        new_value={"question": faq.question, "status": faq.status},
    )
    return faq


def edit(db: DbSession, actor: Actor, faq_id: int, **changes) -> Faq:
    actor.require(Permission.FAQS_MANAGE)
    faq = _get(db, faq_id)
    before = {"question": faq.question, "status": faq.status, "category": faq.category}

    if "question" in changes:
        faq.question = clean_line(changes["question"], max_length=500)
    if "answer" in changes:
        faq.answer = clean_text(changes["answer"], max_length=8000)
    if "category" in changes:
        if changes["category"] not in CATEGORIES:
            raise ValueError("invalid FAQ category")
        faq.category = changes["category"]
    if "status" in changes:
        if changes["status"] not in ContentStatus.ALL:
            raise ValueError("invalid FAQ status")
        faq.status = changes["status"]
    faq.updated_by = actor.user_id

    db.commit()
    db.refresh(faq)
    audit.record(
        db,
        actor,
        audit.Action.FAQ_EDIT,
        object_type="faq",
        object_id=faq.id,
        old_value=before,
        new_value={"question": faq.question, "status": faq.status, "category": faq.category},
    )
    return faq


def merge(db: DbSession, actor: Actor, *, keep_id: int, merge_id: int) -> Faq:
    """Fold a duplicate FAQ into another, summing their frequencies."""
    actor.require(Permission.FAQS_MANAGE)
    if keep_id == merge_id:
        raise ValueError("cannot merge an entry into itself")
    keep, duplicate = _get(db, keep_id), _get(db, merge_id)

    keep.frequency += duplicate.frequency
    keep.updated_by = actor.user_id
    db.delete(duplicate)
    db.commit()
    db.refresh(keep)
    audit.record(
        db,
        actor,
        audit.Action.FAQ_MERGE,
        object_type="faq",
        object_id=keep.id,
        old_value={"merged_id": merge_id, "merged_question": duplicate.question},
        new_value={"frequency": keep.frequency},
    )
    return keep


def bump_frequency(db: DbSession, question: str) -> Faq | None:
    """Increment the counter for whichever FAQ a citizen question matches.

    Uses the same normalisation as rumor de-duplication, so different spellings
    of the same question count together.
    """
    key = normalize_question(question)
    if not key:
        return None
    for faq in db.scalars(select(Faq)).all():
        if normalize_question(faq.question) == key:
            faq.frequency += 1
            db.commit()
            return faq
    return None


def information_gaps(db: DbSession, *, limit: int = 10, min_count: int = 2) -> list[dict]:
    """Repeated questions the assistant could not answer.

    This is the "high demand detected for X" signal: it clusters unanswered or
    low-confidence questions by their normalised form and surfaces the clusters
    an operator should turn into an FAQ or an official update.
    """
    rows = db.scalars(
        select(UserQuestion)
        .where(
            or_(
                UserQuestion.answered.is_(False),
                UserQuestion.flagged_low_confidence.is_(True),
                UserQuestion.retrieval_failed.is_(True),
            )
        )
        .order_by(UserQuestion.created_at.desc())
        .limit(1000)
    ).all()

    counter: Counter[str] = Counter()
    examples: dict[str, str] = {}
    for row in rows:
        key = row.normalized or normalize_question(row.question)
        if not key:
            continue
        counter[key] += 1
        examples.setdefault(key, row.question)

    return [
        {"question": examples[key], "count": count, "normalized": key}
        for key, count in counter.most_common(limit)
        if count >= min_count
    ]


def _get(db: DbSession, faq_id: int) -> Faq:
    faq = db.get(Faq, faq_id)
    if faq is None:
        raise LookupError("FAQ not found")
    return faq
