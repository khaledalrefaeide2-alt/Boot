"""Password hashing and strength checks (bcrypt, cost 12)."""

from __future__ import annotations

import bcrypt

#: bcrypt truncates at 72 bytes; reject longer input rather than silently
#: ignoring the tail, which would make two different passwords equivalent.
MAX_PASSWORD_BYTES = 72
MIN_PASSWORD_LENGTH = 12
_BCRYPT_ROUNDS = 12


class PasswordError(ValueError):
    pass


def validate_strength(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise PasswordError(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
        )
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise PasswordError("Password is too long (max 72 bytes).")
    classes = (
        any(c.islower() for c in password),
        any(c.isupper() for c in password),
        any(c.isdigit() for c in password),
        any(not c.isalnum() for c in password),
    )
    if sum(classes) < 3:
        raise PasswordError(
            "Password must mix at least three of: lowercase, uppercase, digits, symbols."
        )


def hash_password(password: str) -> str:
    validate_strength(password)
    return bcrypt.hashpw(
        password.encode("utf-8"), bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)
    ).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    if not password or not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        # Malformed stored hash: fail closed rather than raising into the
        # login handler, where the difference would be an oracle.
        return False
