"""AI-assisted rumor triage.

What this module produces is a **briefing for a reviewer**, never a verdict.
It writes only to the ``ai_*`` columns via
:func:`app.services.rumors.store_ai_analysis`, and the rumor it touches moves to
``UNDER_REVIEW`` — a state that is not publicly visible.

The risk score is computed here rather than asked of the model: a number that
decides how urgently a human looks at something should be reproducible and
explainable, not generated.
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session as DbSession

from app.ai import retrieval
from app.ai.providers import get_llm
from app.models import Rumor
from app.services import crisis as crisis_service
from app.services import rumors as rumor_service
from app.services import settings_store
from app.services.context import Actor

logger = logging.getLogger("peace.ai.rumor")

#: Claim subjects whose spread does concrete harm during an emergency.
_HIGH_RISK_TOPICS: tuple[tuple[str, float], ...] = (
    ("evacuat", 0.30), ("إخلاء", 0.30),
    ("shelter", 0.25), ("ملجأ", 0.25), ("مأوى", 0.25),
    ("water", 0.25), ("مياه", 0.25),
    ("poison", 0.30), ("سام", 0.30), ("تسمم", 0.30),
    ("contaminat", 0.30), ("ملوث", 0.30),
    ("dam", 0.30), ("سد", 0.30),
    ("collapse", 0.25), ("انهيار", 0.25),
    ("death", 0.20), ("وفيات", 0.20), ("قتلى", 0.20),
    ("hospital", 0.20), ("مستشفى", 0.20),
    ("curfew", 0.20), ("حظر تجول", 0.20),
    ("medicine", 0.20), ("دواء", 0.20),
)


def compute_risk(claim: str, spread_score: float, report_count: int) -> float:
    """Deterministic 0–1 urgency score.

    Three additive components, each capped:

    * topic — does the claim touch something dangerous to get wrong;
    * spread — how many citizens have reported it;
    * actionability — does it tell people to *do* something.
    """
    lowered = claim.lower()

    topic_risk = min(0.6, sum(weight for term, weight in _HIGH_RISK_TOPICS if term in lowered))
    spread_risk = min(0.25, spread_score * 0.25 + min(report_count, 20) / 200.0)

    action_terms = ("must", "immediately", "evacuate", "do not drink", "avoid",
                    "يجب", "فورا", "فوراً", "لا تشربوا", "تجنبوا", "أخلوا")
    action_risk = 0.15 if any(term in lowered for term in action_terms) else 0.0

    return round(min(1.0, topic_risk + spread_risk + action_risk), 3)


def analyze(db: DbSession, actor: Actor, rumor_id: int) -> Rumor:
    """Run retrieval + model assessment and store it as a suggestion."""
    rumor = rumor_service.get(db, rumor_id)
    if rumor is None:
        raise LookupError("rumor not found")

    ai_config = settings_store.get_ai_config(db)
    current = crisis_service.current(db)

    chunks = retrieval.retrieve(
        db,
        rumor.claim,
        limit=int(ai_config.get("max_context_chunks", 6)),
        min_trust=int(ai_config.get("min_source_trust", 2)),
        crisis_id=current.id if current else None,
    )

    risk = compute_risk(rumor.claim, rumor.spread_score, rumor.report_count)

    provider = get_llm()
    try:
        assessment = provider.classify_claim(
            claim=rumor.claim, chunks=chunks, locale="ar"
        )
    except Exception as exc:  # noqa: BLE001 - a provider fault must not block triage
        logger.error("rumor.analysis_failed rumor=%s error=%s", rumor_id, exc)
        assessment = {
            "classification": None,
            "confidence": 0.0,
            "correction": None,
            "rationale": (
                "Automated assessment was unavailable. This claim needs manual research."
            ),
            "citations": [],
        }

    # Guardrail: a correction is only ever a *draft* for the reviewer, and a
    # low-confidence classification is downgraded to "no suggestion" so a weak
    # signal cannot look like a recommendation in the review queue.
    confidence = float(assessment.get("confidence") or 0.0)
    classification = assessment.get("classification")
    if confidence < float(ai_config.get("min_confidence", 0.45)):
        classification = None

    return rumor_service.store_ai_analysis(
        db,
        actor,
        rumor_id,
        classification=classification,
        confidence=confidence,
        correction=assessment.get("correction"),
        rationale=assessment.get("rationale"),
        citations=assessment.get("citations") or [],
        risk_score=risk,
    )
