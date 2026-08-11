"""Hybrid retrieval and reranking.

Semantic similarity alone is unreliable for the questions this platform gets:
"is the water outage nationwide?" hinges on the specific words *water*,
*outage*, *nationwide*. So the retriever combines a dense score (embeddings)
with a lexical score (term overlap), then reranks with the three things that
matter for official information:

* **authority** — a ministry outranks a regional office;
* **freshness** — during a crisis a six-hour-old bulletin beats a six-day-old one;
* **crisis relevance** — material about the active crisis outranks background.

Conflicts are surfaced rather than resolved: :func:`detect_conflicts` reports
when high-trust sources of similar authority disagree, so the assistant can say
so and a human can look.
"""

from __future__ import annotations

import math
import re
from datetime import timezone

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.ai.providers import cosine, get_embedder
from app.ai.providers.base import RetrievedChunk
from app.models import DocumentChunk, DocumentStatus, RagDocument, utcnow

_WORD_RE = re.compile(r"[\w؀-ۿ]+")

#: Weights for the blended score. Dense and lexical are deliberately close:
#: with the offline hashing embedder the lexical half carries most of the
#: signal, and with a learned embedder the dense half does. Neither
#: configuration falls over.
_DENSE_WEIGHT = 0.55
_LEXICAL_WEIGHT = 0.45

#: Rerank bonuses, applied after blending.
_TRUST_WEIGHT = 0.10  # per trust level above 1
_FRESHNESS_WEIGHT = 0.20
_CRISIS_BONUS = 0.10
_INJECTION_PENALTY = 0.50

#: Half-life for the freshness bonus, in days.
_FRESHNESS_HALF_LIFE_DAYS = 3.0


def _terms(text: str) -> set[str]:
    return {w.lower() for w in _WORD_RE.findall(text or "") if len(w) > 1}


def _lexical_score(query_terms: set[str], text: str) -> float:
    if not query_terms:
        return 0.0
    chunk_terms = _terms(text)
    if not chunk_terms:
        return 0.0
    overlap = len(query_terms & chunk_terms)
    if overlap == 0:
        return 0.0
    # Coverage of the query, damped by chunk length so a long passage does not
    # win merely by containing many words.
    coverage = overlap / len(query_terms)
    length_penalty = 1.0 / (1.0 + math.log1p(len(chunk_terms) / 40.0))
    return coverage * length_penalty


def _freshness(published_at) -> float:
    """1.0 for something published now, decaying with a 3-day half-life."""
    if published_at is None:
        return 0.0
    moment = published_at if published_at.tzinfo else published_at.replace(tzinfo=timezone.utc)
    age_days = max(0.0, (utcnow() - moment).total_seconds() / 86400.0)
    return 0.5 ** (age_days / _FRESHNESS_HALF_LIFE_DAYS)


def retrieve(
    db: DbSession,
    query: str,
    *,
    limit: int = 6,
    min_trust: int = 1,
    crisis_id: int | None = None,
    candidate_pool: int = 200,
    include_flagged: bool = False,
) -> list[RetrievedChunk]:
    """Return the best passages for ``query``, already labelled for citation."""
    query = (query or "").strip()
    if not query:
        return []

    rows = db.execute(
        select(DocumentChunk, RagDocument)
        .join(RagDocument, DocumentChunk.document_id == RagDocument.id)
        .where(
            RagDocument.status == DocumentStatus.INDEXED,
            RagDocument.trust_level >= min_trust,
        )
        .order_by(RagDocument.published_at.desc().nullslast())
        .limit(candidate_pool)
    ).all()
    if not rows:
        return []

    query_vector = get_embedder().embed([query])[0]
    query_terms = _terms(query)

    scored: list[tuple[float, DocumentChunk, RagDocument]] = []
    for chunk, document in rows:
        if chunk.injection_flagged and not include_flagged:
            # Still scored, but heavily penalised: an operator inspecting
            # retrieval should be able to see that the passage exists.
            pass

        dense = max(0.0, cosine(query_vector, chunk.embedding))
        lexical = _lexical_score(query_terms, chunk.text)
        score = _DENSE_WEIGHT * dense + _LEXICAL_WEIGHT * lexical

        if score <= 0.0:
            continue

        score += _TRUST_WEIGHT * (document.trust_level - 1)
        score += _FRESHNESS_WEIGHT * _freshness(document.published_at)
        if crisis_id is not None and document.crisis_id == crisis_id:
            score += _CRISIS_BONUS
        if chunk.injection_flagged:
            score -= _INJECTION_PENALTY

        scored.append((score, chunk, document))

    scored.sort(key=lambda item: item[0], reverse=True)

    results: list[RetrievedChunk] = []
    seen_documents: dict[int, int] = {}
    for score, chunk, document in scored:
        if chunk.injection_flagged and not include_flagged:
            continue
        # At most two passages per document, so one verbose source cannot crowd
        # out a contradicting one — that is what makes conflict detection work.
        if seen_documents.get(document.id, 0) >= 2:
            continue
        seen_documents[document.id] = seen_documents.get(document.id, 0) + 1

        results.append(
            RetrievedChunk(
                chunk_id=chunk.id,
                document_id=document.id,
                title=document.title,
                organization=document.organization or "",
                text=chunk.text,
                trust_level=document.trust_level,
                published_at=(
                    document.published_at.isoformat() if document.published_at else None
                ),
                url=document.url,
                score=round(score, 4),
                injection_flagged=chunk.injection_flagged,
                label=len(results) + 1,
            )
        )
        if len(results) >= limit:
            break

    return results


def detect_conflicts(chunks: list[RetrievedChunk]) -> list[dict]:
    """Flag pairs of comparably-authoritative sources that may disagree.

    A cheap, explainable heuristic: two passages from different organisations
    at similar trust levels that share a topic but differ on a negation or a
    number. It intentionally over-reports — the cost of a false positive is one
    extra "sources differ" note; the cost of a false negative is the platform
    silently picking a side.
    """
    conflicts: list[dict] = []
    negations = ("not", "no ", "closed", "suspended", "cancelled", "لا ", "ليس", "مغلق", "معلق")

    for i, a in enumerate(chunks):
        for b in chunks[i + 1 :]:
            if a.document_id == b.document_id or a.organization == b.organization:
                continue
            if abs(a.trust_level - b.trust_level) > 1:
                continue  # a clearly higher authority simply wins

            # Both passages must be about substantially the same thing before a
            # disagreement between them means anything. Jaccard rather than a
            # raw shared-term count: two unrelated Arabic bulletins share plenty
            # of common words, and a raw count made this fire on almost every
            # answer — a warning shown every time is a warning nobody reads.
            a_terms, b_terms = _terms(a.text), _terms(b.text)
            shared = a_terms & b_terms
            union = a_terms | b_terms
            if len(shared) < 8 or (len(shared) / len(union)) < 0.3:
                continue

            a_neg = any(n in a.text.lower() for n in negations)
            b_neg = any(n in b.text.lower() for n in negations)
            a_numbers = set(re.findall(r"\d+", a.text))
            b_numbers = set(re.findall(r"\d+", b.text))

            if a_neg != b_neg or (a_numbers and b_numbers and not (a_numbers & b_numbers)):
                conflicts.append(
                    {
                        "labels": [a.label, b.label],
                        "organizations": [a.organization, b.organization],
                        "reason": "negation_mismatch" if a_neg != b_neg else "figure_mismatch",
                    }
                )
    return conflicts


def confidence_from(chunks: list[RetrievedChunk], conflicts: list[dict]) -> float:
    """Blend retrieval quality, source authority and freshness into 0–1.

    Explainable on purpose: an operator investigating a low-confidence answer
    can reconstruct the number from the retrieved passages.
    """
    if not chunks:
        return 0.0

    top = chunks[0]
    # Top score, mapped into 0–1 (a blended score above ~1.2 is a strong hit).
    strength = min(1.0, top.score / 1.2)
    # Agreement: more supporting passages raise confidence, with sharp
    # diminishing returns after three.
    support = min(1.0, len(chunks) / 3.0)
    authority = min(1.0, max(c.trust_level for c in chunks) / 5.0)
    freshness = max(
        (_freshness_from_iso(c.published_at) for c in chunks), default=0.0
    )

    score = 0.45 * strength + 0.20 * support + 0.20 * authority + 0.15 * freshness

    # An unresolved conflict between comparable sources should never look
    # confident, regardless of how well the passages matched.
    if conflicts:
        score *= 0.55
    return round(max(0.0, min(1.0, score)), 3)


def _freshness_from_iso(value: str | None) -> float:
    if not value:
        return 0.0
    from datetime import datetime

    try:
        return _freshness(datetime.fromisoformat(value))
    except ValueError:
        return 0.0
