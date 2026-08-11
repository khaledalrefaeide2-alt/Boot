"""The citizen assistant — RAG orchestration end to end.

    question
      -> classify intent
      -> restricted-topic check
      -> retrieve official passages
      -> detect conflicts
      -> compute confidence
      -> generate (grounded, structured)
      -> validate (safety layer)
      -> record telemetry
      -> answer + citations + confidence

The orchestrator returns *message keys* rather than sentences for its canned
responses, so the same logic serves Arabic and English without a translation
living in the business layer.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.ai import retrieval, safety
from app.ai.providers import get_llm
from app.models import (
    AssistanceService,
    Conversation,
    ConversationMessage,
    ServiceStatus,
    UserQuestion,
    utcnow,
)
from app.security.sanitize import clean_line, normalize_question
from app.services import crisis as crisis_service
from app.services import faqs as faq_service
from app.services import settings_store

logger = logging.getLogger("peace.ai.assistant")


class Intent:
    LATEST_UPDATES = "latest_updates"
    WHAT_TO_DO = "what_to_do"
    EMERGENCY_CONTACT = "emergency_contact"
    VERIFY_RUMOR = "verify_rumor"
    ROADS = "roads"
    SCHOOLS = "schools"
    UTILITIES = "utilities"
    SHELTER = "shelter"
    GENERAL = "general"


_INTENT_TERMS: dict[str, tuple[str, ...]] = {
    Intent.EMERGENCY_CONTACT: ("emergency number", "hotline", "call", "ambulance", "police",
                               "رقم الطوارئ", "اتصال", "إسعاف", "شرطة", "الدفاع المدني"),
    Intent.ROADS: ("road", "highway", "traffic", "street", "closed road",
                   "طريق", "طرق", "شارع", "مرور", "الطريق مغلق"),
    Intent.SCHOOLS: ("school", "university", "class", "exam", "student",
                     "مدرسة", "مدارس", "جامعة", "دراسة", "امتحان", "طلاب"),
    Intent.UTILITIES: ("water", "electricity", "power", "outage", "internet",
                       "مياه", "كهرباء", "انقطاع", "إنترنت"),
    Intent.SHELTER: ("shelter", "evacuate", "safe place", "refuge",
                     "مأوى", "ملجأ", "إخلاء", "مكان آمن"),
    Intent.VERIFY_RUMOR: ("rumor", "true", "fake", "verify", "is it true",
                          "شائعة", "صحيح", "كذب", "تحقق", "هل صحيح"),
    Intent.WHAT_TO_DO: ("what should i do", "what do i do", "how do i stay safe", "advice",
                        "ماذا أفعل", "كيف أحمي", "نصائح", "ما العمل"),
    Intent.LATEST_UPDATES: ("latest", "update", "news", "what happened",
                            "آخر", "أخبار", "تحديث", "مستجدات"),
}


def classify_intent(question: str) -> str:
    lowered = question.lower()
    for intent, terms in _INTENT_TERMS.items():
        if any(term in lowered for term in terms):
            return intent
    return Intent.GENERAL


@dataclass
class AssistantResponse:
    """Everything the UI needs, and nothing it should not have."""

    verdict: str
    answer: str = ""
    #: Key into the i18n catalogue for a canned response. Set when ``answer`` is
    #: empty, so the presentation layer picks the wording.
    message_key: str | None = None
    citations: list[dict] = field(default_factory=list)
    confidence: float = 0.0
    intent: str = Intent.GENERAL
    provider: str = "none"
    conflicts: list[dict] = field(default_factory=list)
    recommend_emergency_contact: bool = False
    emergency_services: list[dict] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)
    question_id: int | None = None
    #: True whenever the answer is grounded and above the confidence floor.
    is_answer: bool = False


def ask(
    db: DbSession,
    question: str,
    *,
    locale: str = "ar",
    session_key: str | None = None,
) -> AssistantResponse:
    """Answer a citizen question. Never raises for ordinary failure modes."""
    text = clean_line(question, max_length=500)
    ai_config = settings_store.get_ai_config(db)
    intent = classify_intent(text)

    if len(text) < 3:
        return _finalize(
            db, text, AssistantResponse(
                verdict=safety.Verdict.INSUFFICIENT,
                message_key="assistant.too_short",
                intent=intent,
            )
        )

    if not ai_config.get("assistant_enabled", True):
        return _finalize(
            db, text, AssistantResponse(
                verdict=safety.Verdict.BLOCKED,
                message_key="assistant.disabled",
                intent=intent,
                reasons=["assistant_disabled"],
            )
        )

    # An emergency-contact question is answered from the verified directory, not
    # from a language model. The numbers a citizen dials must come from the
    # audited record, never from generated text.
    if intent == Intent.EMERGENCY_CONTACT or safety.is_high_risk(text):
        services = _emergency_services(db)
        return _finalize(
            db,
            text,
            AssistantResponse(
                verdict=safety.Verdict.OK,
                message_key="assistant.emergency_directory",
                intent=Intent.EMERGENCY_CONTACT,
                confidence=1.0,
                recommend_emergency_contact=True,
                emergency_services=services,
                is_answer=bool(services),
                provider="directory",
            ),
        )

    restricted = safety.is_restricted(text, ai_config)
    if restricted:
        return _finalize(
            db,
            text,
            AssistantResponse(
                verdict=safety.Verdict.ESCALATE,
                message_key=f"assistant.restricted.{restricted}",
                intent=intent,
                recommend_emergency_contact=True,
                emergency_services=_emergency_services(db),
                reasons=[f"restricted_topic:{restricted}"],
            ),
        )

    current_crisis = crisis_service.current(db)
    chunks = retrieval.retrieve(
        db,
        text,
        limit=int(ai_config.get("max_context_chunks", 6)),
        min_trust=int(ai_config.get("min_source_trust", 2)),
        crisis_id=current_crisis.id if current_crisis else None,
    )

    if not chunks:
        return _finalize(
            db,
            text,
            AssistantResponse(
                verdict=safety.Verdict.INSUFFICIENT,
                message_key="assistant.insufficient",
                intent=intent,
                reasons=["retrieval_empty"],
            ),
            retrieval_failed=True,
        )

    conflicts = retrieval.detect_conflicts(chunks)
    confidence = retrieval.confidence_from(chunks, conflicts)

    provider = get_llm()
    try:
        draft = provider.answer(
            question=text,
            chunks=chunks,
            style=str(ai_config.get("response_style", "calm")),
            locale=locale,
        )
    except Exception as exc:  # noqa: BLE001 - a provider fault must not 500 the site
        logger.error("assistant.provider_error provider=%s error=%s", provider.name, exc)
        return _finalize(
            db,
            text,
            AssistantResponse(
                verdict=safety.Verdict.INSUFFICIENT,
                message_key="assistant.unavailable",
                intent=intent,
                reasons=["provider_error"],
            ),
        )

    result = safety.validate_answer(
        draft,
        question=text,
        chunks=chunks,
        confidence=confidence,
        ai_config=ai_config,
        known_phone_numbers=_known_numbers(db),
    )

    response = AssistantResponse(
        verdict=result.verdict,
        answer=result.text,
        citations=result.citations,
        confidence=result.confidence,
        intent=intent,
        provider=draft.provider,
        conflicts=conflicts,
        recommend_emergency_contact=result.recommend_emergency_contact,
        emergency_services=(
            _emergency_services(db) if result.recommend_emergency_contact else []
        ),
        reasons=result.reasons,
        is_answer=result.verdict == safety.Verdict.OK,
    )
    if not response.is_answer:
        response.message_key = (
            "assistant.blocked"
            if result.verdict == safety.Verdict.BLOCKED
            else "assistant.insufficient"
        )
    if conflicts and response.is_answer:
        response.reasons.append("sources_conflict")

    if result.escalated or not response.is_answer:
        logger.info(
            "assistant.escalated verdict=%s reasons=%s confidence=%s",
            result.verdict,
            result.reasons,
            result.confidence,
        )

    return _finalize(db, text, response, session_key=session_key)


def suggested_questions(locale: str = "ar") -> list[dict]:
    """The starter prompts shown beside the input box."""
    return [
        {"key": "assistant.suggest.updates", "intent": Intent.LATEST_UPDATES},
        {"key": "assistant.suggest.what_to_do", "intent": Intent.WHAT_TO_DO},
        {"key": "assistant.suggest.emergency", "intent": Intent.EMERGENCY_CONTACT},
        {"key": "assistant.suggest.verify", "intent": Intent.VERIFY_RUMOR},
        {"key": "assistant.suggest.roads", "intent": Intent.ROADS},
        {"key": "assistant.suggest.schools", "intent": Intent.SCHOOLS},
    ]


def record_feedback(db: DbSession, question_id: int, helpful: bool) -> bool:
    row = db.get(UserQuestion, question_id)
    if row is None:
        return False
    row.feedback = "helpful" if helpful else "not_helpful"
    db.commit()
    return True


# --- Internals ---------------------------------------------------------------


def _finalize(
    db: DbSession,
    question: str,
    response: AssistantResponse,
    *,
    retrieval_failed: bool = False,
    session_key: str | None = None,
) -> AssistantResponse:
    """Persist telemetry and attach the resulting question id."""
    ai_config = settings_store.get_ai_config(db)
    threshold = float(ai_config.get("min_confidence", 0.45))

    row = UserQuestion(
        question=question,
        normalized=normalize_question(question),
        intent=response.intent,
        answered=response.is_answer,
        answer_text=response.answer or None,
        confidence=response.confidence,
        flagged_low_confidence=(
            not response.is_answer or response.confidence < threshold
        ),
        retrieval_failed=retrieval_failed,
        provider=response.provider,
        citations=response.citations or None,
        created_at=utcnow(),
    )

    if session_key:
        conversation = db.scalar(
            select(Conversation).where(Conversation.session_key == session_key)
        )
        if conversation is None:
            conversation = Conversation(session_key=session_key)
            db.add(conversation)
            db.flush()
        row.conversation_id = conversation.id
        now = utcnow()
        db.add(
            ConversationMessage(
                conversation_id=conversation.id,
                role="user",
                content=question,
                created_at=now,
            )
        )
        db.add(
            ConversationMessage(
                conversation_id=conversation.id,
                role="assistant",
                content=response.answer or f"[{response.message_key}]",
                confidence=response.confidence,
                citations=response.citations or None,
                created_at=now,
            )
        )

    db.add(row)
    db.commit()
    db.refresh(row)
    response.question_id = row.id

    # A question that matched an existing FAQ bumps its popularity counter.
    faq_service.bump_frequency(db, question)
    return response


def _emergency_services(db: DbSession) -> list[dict]:
    """Verified contact points, straight from the audited directory."""
    rows = db.scalars(
        select(AssistanceService)
        .where(AssistanceService.status != ServiceStatus.INACTIVE)
        .order_by(AssistanceService.sort_order)
        .limit(6)
    ).all()
    return [
        {
            "organization": service.organization,
            "phone": service.phone,
            "service_type": service.service_type,
            "hours": service.hours,
            "is_demo": service.is_demo,
        }
        for service in rows
    ]


def _known_numbers(db: DbSession) -> set[str]:
    """Digit-only forms of every number in the services directory.

    The safety layer treats these as the only numbers an answer may contain
    that are not literally present in the retrieved evidence.
    """
    numbers: set[str] = set()
    for service in db.scalars(select(AssistanceService)).all():
        digits = re.sub(r"\D", "", service.phone or "")
        if digits:
            numbers.add(digits)
    return numbers
