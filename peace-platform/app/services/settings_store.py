"""Global switches: emergency mode and AI configuration.

Both live in the ``system_settings`` key/value table and are written only
through the audited helpers below.
"""

from __future__ import annotations

from sqlalchemy.orm import Session as DbSession

from app.models import SystemSetting, utcnow
from app.security.rbac import Permission
from app.services import audit
from app.services.context import Actor

EMERGENCY_MODE_KEY = "emergency_mode"
AI_CONFIG_KEY = "ai_config"

DEFAULT_EMERGENCY_MODE: dict = {
    "enabled": False,
    "headline": "",
    "hide_nonessential": False,
    "activated_at": None,
    "activated_by": None,
}

DEFAULT_AI_CONFIG: dict = {
    # Response register presented to citizens.
    "response_style": "calm",  # official | simple | calm
    # Answers scoring below this are replaced with the insufficient-evidence
    # message and escalated for human review.
    "min_confidence": 0.45,
    # When true, an answer with no citation is never shown.
    "require_citations": True,
    # Master switch. When false the assistant endpoint returns a maintenance
    # notice instead of an answer; retrieval and the rest of the site are
    # unaffected.
    "assistant_enabled": True,
    # AI suggestions for rumors/updates always need a human; this flag exists so
    # the setting is explicit and auditable rather than implicit in the code.
    "require_human_review": True,
    # Topics the assistant must not attempt to answer directly; it refers the
    # citizen to the relevant emergency service instead.
    "restricted_topics": ["medical_treatment", "legal_advice", "casualty_figures"],
    # Only sources at or above this trust level are used for retrieval.
    "min_source_trust": 2,
    "max_context_chunks": 6,
}


def _get_raw(db: DbSession, key: str, default: dict) -> dict:
    row = db.get(SystemSetting, key)
    if row is None:
        return dict(default)
    merged = dict(default)
    merged.update(row.value or {})
    return merged


def get_emergency_mode(db: DbSession) -> dict:
    return _get_raw(db, EMERGENCY_MODE_KEY, DEFAULT_EMERGENCY_MODE)


def get_ai_config(db: DbSession) -> dict:
    return _get_raw(db, AI_CONFIG_KEY, DEFAULT_AI_CONFIG)


def _write(db: DbSession, key: str, value: dict, actor: Actor) -> dict:
    row = db.get(SystemSetting, key)
    if row is None:
        row = SystemSetting(key=key, value=value, updated_by=actor.user_id)
        db.add(row)
    else:
        row.value = value
        row.updated_by = actor.user_id
    db.commit()
    return value


def set_emergency_mode(
    db: DbSession,
    actor: Actor,
    *,
    enabled: bool,
    headline: str = "",
    hide_nonessential: bool = False,
) -> dict:
    """Toggle platform-wide emergency mode. Always audited."""
    actor.require(Permission.EMERGENCY_TOGGLE)
    previous = get_emergency_mode(db)
    value = {
        "enabled": bool(enabled),
        "headline": headline.strip()[:280],
        "hide_nonessential": bool(hide_nonessential),
        "activated_at": utcnow().isoformat() if enabled else None,
        "activated_by": actor.email if enabled else None,
    }
    _write(db, EMERGENCY_MODE_KEY, value, actor)
    audit.record(
        db,
        actor,
        audit.Action.EMERGENCY_MODE,
        object_type="system_setting",
        object_id=EMERGENCY_MODE_KEY,
        old_value=previous,
        new_value=value,
    )
    return value


def set_ai_config(db: DbSession, actor: Actor, changes: dict) -> dict:
    """Update AI configuration, validating each field. Always audited."""
    actor.require(Permission.AI_CONFIG)
    previous = get_ai_config(db)
    value = dict(previous)

    if "response_style" in changes:
        style = str(changes["response_style"])
        if style not in ("official", "simple", "calm"):
            raise ValueError("response_style must be official, simple or calm")
        value["response_style"] = style

    if "min_confidence" in changes:
        confidence = float(changes["min_confidence"])
        if not 0.0 <= confidence <= 1.0:
            raise ValueError("min_confidence must be between 0 and 1")
        value["min_confidence"] = round(confidence, 3)

    if "min_source_trust" in changes:
        trust = int(changes["min_source_trust"])
        if not 1 <= trust <= 5:
            raise ValueError("min_source_trust must be between 1 and 5")
        value["min_source_trust"] = trust

    if "max_context_chunks" in changes:
        chunks = int(changes["max_context_chunks"])
        if not 1 <= chunks <= 20:
            raise ValueError("max_context_chunks must be between 1 and 20")
        value["max_context_chunks"] = chunks

    for flag in ("require_citations", "assistant_enabled", "require_human_review"):
        if flag in changes:
            value[flag] = bool(changes[flag])

    if "restricted_topics" in changes:
        topics = changes["restricted_topics"]
        if isinstance(topics, str):
            topics = [t.strip() for t in topics.split(",")]
        value["restricted_topics"] = [str(t).strip()[:64] for t in topics if str(t).strip()]

    # Human review of AI-suggested public content is a governance guarantee of
    # this platform, not a tunable. Refuse rather than silently ignore.
    if value["require_human_review"] is not True:
        raise ValueError(
            "require_human_review cannot be disabled: human approval of "
            "AI-suggested public content is a platform guarantee."
        )

    _write(db, AI_CONFIG_KEY, value, actor)
    audit.record(
        db,
        actor,
        audit.Action.AI_CONFIG_CHANGE,
        object_type="system_setting",
        object_id=AI_CONFIG_KEY,
        old_value=previous,
        new_value=value,
    )
    return value
