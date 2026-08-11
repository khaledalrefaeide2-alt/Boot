"""Provider selection.

The platform always has a working provider. If Claude is configured it is used;
otherwise the deterministic extractive provider takes over. There is no state in
which the assistant silently answers from model knowledge.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from app.ai.providers.base import EmbeddingProvider, LLMAnswer, LLMProvider, RetrievedChunk
from app.ai.providers.embeddings import HashingEmbedder, build_embedder, cosine
from app.ai.providers.extractive import ExtractiveProvider
from app.config import get_settings

logger = logging.getLogger("peace.ai.providers")

__all__ = [
    "EmbeddingProvider",
    "ExtractiveProvider",
    "HashingEmbedder",
    "LLMAnswer",
    "LLMProvider",
    "RetrievedChunk",
    "cosine",
    "get_embedder",
    "get_llm",
    "reset_providers",
]


@lru_cache(maxsize=1)
def get_llm() -> LLMProvider:
    settings = get_settings()
    if settings.llm_configured:
        try:
            from app.ai.providers.anthropic_provider import AnthropicProvider

            provider = AnthropicProvider()
            logger.info("LLM provider: anthropic (%s)", settings.llm_model)
            return provider
        except Exception as exc:  # noqa: BLE001 - never fail startup over the LLM
            logger.warning(
                "Anthropic provider unavailable (%s); "
                "falling back to the offline extractive provider.",
                exc,
            )
    else:
        logger.info(
            "No ANTHROPIC_API_KEY configured; using the offline extractive provider. "
            "Answers will be verbatim quotations from official sources."
        )
    return ExtractiveProvider()


@lru_cache(maxsize=1)
def get_embedder() -> EmbeddingProvider:
    return build_embedder()


def reset_providers() -> None:
    """Drop cached providers (used by tests and after a config change)."""
    get_llm.cache_clear()
    get_embedder.cache_clear()
