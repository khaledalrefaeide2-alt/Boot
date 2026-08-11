"""In-process fixed-window rate limiter.

Deliberately simple and dependency-free. It is correct for a single process,
which is what the demo and a small deployment run. For a multi-worker
production deployment, swap ``_HITS`` for a Redis counter — the ``check()``
signature is the seam and nothing else changes. This is called out in
docs/DEPLOYMENT.md rather than hidden.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass

from app.config import get_settings


@dataclass(frozen=True)
class Rule:
    limit: int
    window_seconds: int


#: Per-endpoint budgets. Citizen write paths are the tightest; read paths are
#: generous because during an emergency people refresh a lot and must not be
#: locked out of information.
RULES: dict[str, Rule] = {
    "login": Rule(limit=10, window_seconds=300),
    "assistant": Rule(limit=20, window_seconds=300),
    "rumor_submit": Rule(limit=5, window_seconds=600),
    "report_submit": Rule(limit=5, window_seconds=600),
    "feedback": Rule(limit=30, window_seconds=600),
    "search": Rule(limit=60, window_seconds=60),
}

_HITS: dict[tuple[str, str], tuple[int, float]] = {}
_LOCK = threading.Lock()


class RateLimited(Exception):
    def __init__(self, retry_after: int) -> None:
        super().__init__("rate limited")
        self.retry_after = retry_after


def check(bucket: str, identity: str | None) -> None:
    """Consume one unit from ``bucket`` for ``identity``.

    Raises :class:`RateLimited` when the budget is exhausted.
    """
    settings = get_settings()
    if not settings.rate_limit_enabled:
        return
    rule = RULES.get(bucket)
    if rule is None:
        return

    key = (bucket, identity or "anonymous")
    now = time.monotonic()
    with _LOCK:
        count, window_start = _HITS.get(key, (0, now))
        if now - window_start >= rule.window_seconds:
            count, window_start = 0, now
        count += 1
        _HITS[key] = (count, window_start)
        if count > rule.limit:
            retry_after = int(rule.window_seconds - (now - window_start)) + 1
            raise RateLimited(retry_after)


def reset() -> None:
    """Clear all counters (used by tests)."""
    with _LOCK:
        _HITS.clear()
