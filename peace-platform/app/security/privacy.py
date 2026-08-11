"""Privacy helpers: irreversible hashing of citizen network identifiers."""

from __future__ import annotations

import hashlib

from fastapi import Request

from app.config import get_settings


def hash_ip(ip: str | None) -> str | None:
    """Salted SHA-256 of an IP address.

    Raw addresses are never persisted. The hash is still enough to rate-limit
    and to spot a flood of identical submissions, which is all the platform
    needs it for.
    """
    if not ip:
        return None
    salt = get_settings().ip_hash_salt
    return hashlib.sha256(f"{salt}:{ip}".encode("utf-8")).hexdigest()


def client_ip(request: Request) -> str | None:
    """Best-effort client address.

    ``X-Forwarded-For`` is honoured only when the app is explicitly running
    behind a proxy in a non-development environment; otherwise any client could
    spoof its own rate-limit bucket by setting the header.
    """
    settings = get_settings()
    if settings.is_production:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None
