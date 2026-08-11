"""Aggregations for the operations dashboard.

Every number here is computed from live tables — there is no decorative
placeholder anywhere on the dashboard.
"""

from __future__ import annotations

from collections import Counter

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from app.models import (
    AuditLog,
    Faq,
    OfficialUpdate,
    Report,
    ReportStatus,
    Rumor,
    RumorStatus,
    UpdateStatus,
    UserQuestion,
)
from app.services import crisis as crisis_service
from app.services import faqs as faq_service
from app.services import settings_store


def overview(db: DbSession) -> dict:
    current = crisis_service.current(db)
    ai_config = settings_store.get_ai_config(db)
    threshold = float(ai_config.get("min_confidence", 0.45))

    published_updates = _count(db, OfficialUpdate, OfficialUpdate.status == UpdateStatus.PUBLISHED)
    draft_updates = _count(
        db,
        OfficialUpdate,
        OfficialUpdate.status.in_((UpdateStatus.DRAFT, UpdateStatus.PENDING_REVIEW)),
    )
    incoming_rumors = _count(db, Rumor, Rumor.status == RumorStatus.UNVERIFIED)
    pending_rumors = _count(
        db, Rumor, Rumor.status.in_((RumorStatus.UNVERIFIED, RumorStatus.UNDER_REVIEW))
    )
    published_rumors = _count(db, Rumor, Rumor.published.is_(True))

    low_confidence = _count(
        db,
        UserQuestion,
        UserQuestion.flagged_low_confidence.is_(True),
        UserQuestion.human_correction.is_(None),
    )
    unanswered = _count(db, UserQuestion, UserQuestion.answered.is_(False))
    new_reports = _count(db, Report, Report.status == ReportStatus.NEW)
    emergency_reports = _count(
        db, Report, Report.is_emergency.is_(True), Report.status == ReportStatus.NEW
    )

    return {
        "crisis": current,
        "emergency_mode": settings_store.get_emergency_mode(db),
        "counts": {
            "published_updates": published_updates,
            "draft_updates": draft_updates,
            "incoming_rumors": incoming_rumors,
            "pending_reviews": pending_rumors,
            "published_rumors": published_rumors,
            "low_confidence_answers": low_confidence,
            "unanswered_questions": unanswered,
            "new_reports": new_reports,
            "emergency_reports": emergency_reports,
            "published_faqs": _count(db, Faq, Faq.status == "published"),
        },
        "confidence_threshold": threshold,
        "frequent_questions": frequent_questions(db),
        "information_gaps": faq_service.information_gaps(db),
        "recent_activity": recent_activity(db),
        "low_confidence_answers": low_confidence_answers(db, limit=5),
    }


def frequent_questions(db: DbSession, limit: int = 8) -> list[dict]:
    rows = db.scalars(
        select(UserQuestion).order_by(UserQuestion.created_at.desc()).limit(500)
    ).all()
    counter: Counter[str] = Counter()
    examples: dict[str, str] = {}
    answered: dict[str, int] = {}
    for row in rows:
        key = row.normalized
        if not key:
            continue
        counter[key] += 1
        examples.setdefault(key, row.question)
        answered[key] = answered.get(key, 0) + (1 if row.answered else 0)
    return [
        {
            "question": examples[key],
            "count": count,
            "answered_ratio": round(answered.get(key, 0) / count, 2),
        }
        for key, count in counter.most_common(limit)
    ]


def low_confidence_answers(db: DbSession, limit: int = 20) -> list[UserQuestion]:
    return list(
        db.scalars(
            select(UserQuestion)
            .where(
                UserQuestion.flagged_low_confidence.is_(True),
                UserQuestion.human_correction.is_(None),
            )
            .order_by(UserQuestion.created_at.desc())
            .limit(limit)
        ).all()
    )


def recent_activity(db: DbSession, limit: int = 12) -> list[AuditLog]:
    return list(
        db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)).all()
    )


def ai_quality(db: DbSession) -> dict:
    """Metrics for the AI quality dashboard."""
    total = _count(db, UserQuestion)
    if total == 0:
        return {
            "total": 0,
            "answered": 0,
            "answered_rate": 0.0,
            "low_confidence": 0,
            "retrieval_failures": 0,
            "corrected": 0,
            "helpful": 0,
            "not_helpful": 0,
            "avg_confidence": 0.0,
            "unanswered_topics": [],
        }

    answered = _count(db, UserQuestion, UserQuestion.answered.is_(True))
    avg_confidence = db.scalar(
        select(func.avg(UserQuestion.confidence)).where(UserQuestion.confidence.is_not(None))
    )
    return {
        "total": total,
        "answered": answered,
        "answered_rate": round(answered / total, 3),
        "low_confidence": _count(db, UserQuestion, UserQuestion.flagged_low_confidence.is_(True)),
        "retrieval_failures": _count(db, UserQuestion, UserQuestion.retrieval_failed.is_(True)),
        "corrected": _count(db, UserQuestion, UserQuestion.human_correction.is_not(None)),
        "helpful": _count(db, UserQuestion, UserQuestion.feedback == "helpful"),
        "not_helpful": _count(db, UserQuestion, UserQuestion.feedback == "not_helpful"),
        "avg_confidence": round(float(avg_confidence or 0.0), 3),
        "unanswered_topics": faq_service.information_gaps(db, limit=10, min_count=1),
    }


def _count(db: DbSession, model, *conditions) -> int:
    stmt = select(func.count(model.id))
    for condition in conditions:
        stmt = stmt.where(condition)
    return int(db.scalar(stmt) or 0)
