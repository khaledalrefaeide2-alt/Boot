"""Embedding providers.

``HashingEmbedder`` is the default: a deterministic, dependency-free bag of
character n-grams hashed into a fixed-width L2-normalised vector. It needs no
network and no model download, it handles Arabic without a tokenizer, and it is
reproducible across machines — which makes the demo and the test suite honest.
It is genuinely weaker than a learned embedding at matching paraphrases, and the
retriever compensates by combining it with a lexical score (see retrieval.py).

``VoyageEmbedder`` swaps in a learned model for production. Nothing else in the
pipeline changes; ``EMBEDDING_PROVIDER=voyage`` is the whole migration, plus a
reindex.
"""

from __future__ import annotations

import hashlib
import logging
import math
import re

from app.config import get_settings

logger = logging.getLogger("peace.ai.embeddings")

_WORD_RE = re.compile(r"[\w؀-ۿ]+")


class HashingEmbedder:
    """Deterministic offline embedder over word and character n-grams."""

    name = "hashing"

    def __init__(self, dimension: int | None = None) -> None:
        self.dimension = dimension or get_settings().embedding_dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(text) for text in texts]

    def _embed_one(self, text: str) -> list[float]:
        vector = [0.0] * self.dimension
        for feature, weight in self._features(text):
            index = (
                int.from_bytes(
                    hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest(), "big"
                )
                % self.dimension
            )
            # Signed hashing keeps unrelated collisions from always reinforcing.
            sign = 1.0 if index % 2 == 0 else -1.0
            vector[index] += weight * sign

        norm = math.sqrt(sum(value * value for value in vector))
        if norm == 0.0:
            return vector
        return [value / norm for value in vector]

    @staticmethod
    def _features(text: str) -> list[tuple[str, float]]:
        lowered = text.lower()
        words = _WORD_RE.findall(lowered)
        features: list[tuple[str, float]] = [(f"w:{w}", 1.0) for w in words]
        # Word bigrams capture short phrases ("مياه الشرب", "school closure").
        features += [
            (f"b:{words[i]}_{words[i + 1]}", 0.8) for i in range(len(words) - 1)
        ]
        # Character 4-grams give partial credit for Arabic morphology and typos.
        for word in words:
            if len(word) > 4:
                features += [(f"c:{word[i:i + 4]}", 0.35) for i in range(len(word) - 3)]
        return features


class VoyageEmbedder:
    """Voyage AI embeddings (Anthropic's recommended embedding partner)."""

    name = "voyage"

    def __init__(self) -> None:
        settings = get_settings()
        if not settings.voyage_api_key:
            raise RuntimeError("VOYAGE_API_KEY is not configured")
        self._api_key = settings.voyage_api_key
        self._model = settings.voyage_model
        self.dimension = settings.embedding_dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        import httpx

        response = httpx.post(
            "https://api.voyageai.com/v1/embeddings",
            headers={"Authorization": f"Bearer {self._api_key}"},
            json={"input": texts, "model": self._model},
            timeout=30.0,
        )
        response.raise_for_status()
        data = response.json()["data"]
        vectors = [item["embedding"] for item in sorted(data, key=lambda d: d["index"])]
        if vectors:
            self.dimension = len(vectors[0])
        return vectors


def build_embedder():
    settings = get_settings()
    if settings.embedding_provider == "voyage":
        try:
            return VoyageEmbedder()
        except Exception as exc:  # noqa: BLE001 - degrade rather than fail startup
            logger.warning("voyage embedder unavailable (%s); using hashing embedder", exc)
    return HashingEmbedder()


def cosine(a: list[float] | None, b: list[float] | None) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    # Both sides are L2-normalised at creation time, so the dot product is the
    # cosine; recomputing norms per query would be wasted work.
    return max(-1.0, min(1.0, sum(x * y for x, y in zip(a, b))))
