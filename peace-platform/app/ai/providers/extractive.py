"""Offline, deterministic provider — the platform's default and its safety net.

It performs **extraction, never generation**: every sentence it returns is
copied verbatim from a retrieved official passage. That makes hallucination
structurally impossible rather than merely discouraged, which is why it is also
the fallback whenever the hosted model is unavailable: a degraded assistant
still cannot invent an emergency number.

The trade-off is honest and documented: answers read like quoted source
material rather than fluent prose. For a platform whose first duty is not to
mislead, that is the right default when no reviewed model is configured.
"""

from __future__ import annotations

import re

from app.ai.providers.base import LLMAnswer, RetrievedChunk

_SENTENCE_SPLIT = re.compile(r"(?<=[.!؟?])\s+|\n+")
_STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "were", "of", "in", "on", "to", "and",
    "or", "for", "what", "when", "where", "how", "why", "do", "does", "did",
    "من", "ما", "هل", "في", "على", "الى", "إلى", "عن", "هو", "هي", "و", "أو",
    "the", "متى", "أين", "كيف", "لماذا", "هذا", "هذه", "ذلك",
}


def _tokens(text: str) -> set[str]:
    words = re.findall(r"[\w؀-ۿ]+", text.lower())
    return {w for w in words if w not in _STOPWORDS and len(w) > 1}


class ExtractiveProvider:
    """Selects the most relevant verbatim sentences from the evidence."""

    name = "extractive"

    def __init__(self, max_sentences: int = 4) -> None:
        self.max_sentences = max_sentences

    def answer(
        self,
        *,
        question: str,
        chunks: list[RetrievedChunk],
        style: str,
        locale: str,
    ) -> LLMAnswer:
        if not chunks:
            return LLMAnswer(
                text="",
                insufficient_evidence=True,
                provider=self.name,
            )

        question_tokens = _tokens(question)
        scored: list[tuple[float, int, str]] = []
        for chunk in chunks:
            # Passages flagged for prompt injection are never quoted back to a
            # citizen, even though they remain retrievable for operators.
            if chunk.injection_flagged:
                continue
            for sentence in _SENTENCE_SPLIT.split(chunk.text):
                sentence = sentence.strip()
                if len(sentence) < 25:
                    continue
                overlap = len(question_tokens & _tokens(sentence))
                if overlap == 0:
                    continue
                # Weight by question overlap, then by the source's trust level.
                score = overlap + (chunk.trust_level / 10.0) + (chunk.score / 4.0)
                scored.append((score, chunk.label, sentence))

        if not scored:
            return LLMAnswer(text="", insufficient_evidence=True, provider=self.name)

        scored.sort(key=lambda item: item[0], reverse=True)

        seen: set[str] = set()
        lines: list[str] = []
        used: list[int] = []
        for _score, label, sentence in scored:
            key = sentence[:80]
            if key in seen:
                continue
            seen.add(key)
            lines.append(f"{sentence} [{label}]")
            if label not in used:
                used.append(label)
            if len(lines) >= self.max_sentences:
                break

        return LLMAnswer(
            text="\n".join(lines),
            used_labels=used,
            insufficient_evidence=False,
            uncertainty_note="",
            provider=self.name,
        )

    def classify_claim(
        self, *, claim: str, chunks: list[RetrievedChunk], locale: str
    ) -> dict:
        """Offline claim triage.

        Deliberately conservative: with no language model available it will not
        assert that something is false. It reports how much official evidence
        overlaps the claim and leaves the verdict entirely to the reviewer.
        """
        usable = [c for c in chunks if not c.injection_flagged]
        if not usable:
            return {
                "classification": None,
                "confidence": 0.0,
                "correction": None,
                "rationale": (
                    "No official source in the knowledge base addresses this claim. "
                    "A human reviewer must research it before any verdict."
                ),
                "citations": [],
                "provider": self.name,
            }

        claim_tokens = _tokens(claim)
        best = max(
            usable,
            key=lambda c: len(claim_tokens & _tokens(c.text)) + c.trust_level / 10.0,
        )
        overlap = len(claim_tokens & _tokens(best.text))
        coverage = overlap / max(len(claim_tokens), 1)

        return {
            "classification": None,  # never auto-assigns a verdict
            "confidence": round(min(coverage, 0.6), 3),
            "correction": None,
            "rationale": (
                f"Closest official material: “{best.title}” ({best.organization}). "
                f"Term overlap with the claim: {overlap}. "
                "This is a retrieval signal only — it is not a verdict. "
                "Read the source and decide."
            ),
            "citations": [c.citation() for c in usable[:3]],
            "provider": self.name,
        }

    def summarize_for_citizens(self, *, text: str, style: str, locale: str) -> str:
        """Extractive summary: the first sentences of the original, unaltered."""
        sentences = [s.strip() for s in _SENTENCE_SPLIT.split(text) if s.strip()]
        return " ".join(sentences[:3])
