"""JSON API (``/api/v1``).

Read endpoints are open. Citizen write endpoints are rate-limited. Privileged
endpoints authenticate with the same session cookie as the dashboard and
additionally require the ``X-CSRF-Token`` header, because a cookie-authenticated
JSON endpoint is otherwise CSRF-able.

Handlers call the same service functions the dashboard uses, so the two
surfaces cannot drift on what is permitted.
"""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DbSession

from app.ai import assistant as assistant_service
from app.db import get_db
from app.models import RumorStatus
from app.security.ratelimit import RateLimited, check as rate_check
from app.services import alerts as alert_service
from app.services import crisis as crisis_service
from app.services import directory as directory_service
from app.services import faqs as faq_service
from app.services import guidance as guidance_service
from app.services import reports as report_service
from app.services import rumors as rumor_service
from app.services import settings_store
from app.services import updates as update_service
from app.services.context import Actor
from app.web.deps import ASSISTANT_COOKIE, get_actor, require_permission, verify_csrf

router = APIRouter(prefix="/api/v1")


# --- Schemas -----------------------------------------------------------------


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    locale: str = Field(default="ar", max_length=8)


class RumorSubmission(BaseModel):
    claim: str = Field(min_length=10, max_length=4000)
    source_platform: str | None = Field(default=None, max_length=120)
    seen_where: str | None = Field(default=None, max_length=255)
    related_to_crisis: bool = True


class ReportSubmission(BaseModel):
    report_type: str = Field(max_length=32)
    description: str = Field(min_length=10, max_length=4000)
    location_text: str | None = Field(default=None, max_length=255)
    is_emergency: bool = False
    contact: str | None = Field(default=None, max_length=255)


class FeedbackRequest(BaseModel):
    question_id: int
    helpful: bool


# --- Health ------------------------------------------------------------------


@router.get("/health")
def health():
    """Liveness. Intentionally does no I/O."""
    from app import __version__

    return {"status": "ok", "version": __version__}


@router.get("/health/ready")
def readiness(db: DbSession = Depends(get_db)):
    """Readiness: database reachable and the AI provider resolved."""
    from sqlalchemy import text

    from app.ai.providers import get_llm

    checks = {"database": "ok", "ai_provider": "ok"}
    try:
        db.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        checks["database"] = "error"
    try:
        checks["ai_provider"] = get_llm().name
    except Exception:  # noqa: BLE001
        checks["ai_provider"] = "error"

    healthy = checks["database"] == "ok"
    return Response(
        content=__import__("json").dumps({"status": "ok" if healthy else "degraded", **checks}),
        media_type="application/json",
        status_code=200 if healthy else 503,
    )


# --- Public reads ------------------------------------------------------------


@router.get("/crisis/current")
def current_crisis(db: DbSession = Depends(get_db)):
    crisis = crisis_service.current(db)
    emergency = settings_store.get_emergency_mode(db)
    if crisis is None:
        return {"crisis": None, "emergency_mode": emergency["enabled"]}
    return {
        "crisis": {
            "id": crisis.id,
            "code": crisis.code,
            "type": crisis.type,
            "title": crisis.title,
            "severity": crisis.severity,
            "status": crisis.status,
            "description": crisis.description,
            "updated_at": crisis.updated_at.isoformat(),
            "is_demo": crisis.is_demo,
        },
        "emergency_mode": emergency["enabled"],
    }


@router.get("/updates")
def list_updates(
    db: DbSession = Depends(get_db),
    category: str | None = None,
    importance: str | None = None,
    q: str | None = None,
    limit: int = 20,
    offset: int = 0,
):
    items, total = update_service.list_published(
        db,
        category=category,
        importance=importance,
        query=q,
        limit=min(limit, 100),
        offset=max(offset, 0),
    )
    return {"total": total, "items": [_update_json(u) for u in items]}


@router.get("/updates/{update_id}")
def get_update(update_id: int, db: DbSession = Depends(get_db)):
    update = update_service.get_published(db, update_id)
    if update is None:
        raise HTTPException(status_code=404, detail="Not found")
    return _update_json(update, include_content=True)


@router.get("/rumors")
def list_rumors(db: DbSession = Depends(get_db), limit: int = 20, offset: int = 0):
    items = rumor_service.list_public(db, limit=min(limit, 100), offset=max(offset, 0))
    return {"items": [_rumor_json(r) for r in items]}


@router.get("/rumors/{rumor_id}")
def get_rumor(rumor_id: int, db: DbSession = Depends(get_db)):
    rumor = rumor_service.get_public(db, rumor_id)
    if rumor is None:
        raise HTTPException(status_code=404, detail="Not found")
    return _rumor_json(rumor)


@router.get("/services")
def list_services(db: DbSession = Depends(get_db), type: str | None = None):
    return {
        "items": [
            {
                "id": s.id,
                "organization": s.organization,
                "phone": s.phone,
                "service_type": s.service_type,
                "hours": s.hours,
                "website": s.website,
                "location": s.location,
                "status": s.status,
                "is_demo": s.is_demo,
            }
            for s in directory_service.list_services(db, service_type=type)
        ]
    }


@router.get("/faqs")
def list_faqs(db: DbSession = Depends(get_db), category: str | None = None, q: str | None = None):
    return {
        "items": [
            {
                "id": f.id,
                "question": f.question,
                "answer": f.answer,
                "category": f.category,
                "frequency": f.frequency,
            }
            for f in faq_service.list_published(db, category=category, query=q)
        ]
    }


@router.get("/guidance")
def list_guidance(
    db: DbSession = Depends(get_db), phase: str | None = None, audience: str | None = None
):
    return {
        "items": [
            {
                "id": g.id,
                "phase": g.phase,
                "audience": g.audience,
                "kind": g.kind,
                "title": g.title,
                "body": g.body,
            }
            for g in guidance_service.list_published(db, phase=phase, audience=audience)
        ]
    }


@router.get("/sources")
def list_sources(db: DbSession = Depends(get_db)):
    return {
        "items": [
            {
                "id": s.id,
                "name": s.name,
                "organization": s.organization,
                "url": s.url,
                "type": s.type,
                "trust_level": s.trust_level,
                "verification_status": s.verification_status,
                "why_trusted": s.why_trusted,
                "is_demo": s.is_demo,
            }
            for s in directory_service.list_sources(db)
        ]
    }


@router.get("/alerts/active")
def list_active_alerts(db: DbSession = Depends(get_db)):
    return {
        "items": [
            {"id": a.id, "type": a.type, "message": a.message, "placement": a.placement}
            for a in alert_service.active(db)
        ]
    }


# --- Citizen writes ----------------------------------------------------------


@router.post("/assistant/ask")
def assistant_ask(
    payload: AskRequest,
    request: Request,
    response: Response,
    db: DbSession = Depends(get_db),
    actor: Actor = Depends(get_actor),
):
    try:
        rate_check("assistant", actor.ip_hash)
    except RateLimited as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(exc.retry_after)},
            detail="Too many requests",
        ) from None

    session_key = request.cookies.get(ASSISTANT_COOKIE) or secrets.token_urlsafe(16)
    result = assistant_service.ask(
        db, payload.question, locale=payload.locale, session_key=session_key
    )
    response.set_cookie(
        ASSISTANT_COOKIE, session_key, max_age=60 * 60 * 8, httponly=True, samesite="lax"
    )
    return {
        "verdict": result.verdict,
        "is_answer": result.is_answer,
        "answer": result.answer,
        "message_key": result.message_key,
        "citations": result.citations,
        "confidence": result.confidence,
        "intent": result.intent,
        "conflicts": result.conflicts,
        "recommend_emergency_contact": result.recommend_emergency_contact,
        "emergency_services": result.emergency_services,
        "question_id": result.question_id,
        # The provider name is disclosed so citizens can see that an answer came
        # from the offline extractive path rather than a language model.
        "provider": result.provider,
    }


@router.post("/assistant/feedback")
def assistant_feedback(
    payload: FeedbackRequest,
    db: DbSession = Depends(get_db),
    actor: Actor = Depends(get_actor),
):
    try:
        rate_check("feedback", actor.ip_hash)
    except RateLimited as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(exc.retry_after)},
            detail="Too many requests",
        ) from None

    if not assistant_service.record_feedback(db, payload.question_id, payload.helpful):
        raise HTTPException(status_code=404, detail="Not found")
    return {"status": "recorded"}


@router.post("/rumors/submit", status_code=201)
def submit_rumor(
    payload: RumorSubmission,
    db: DbSession = Depends(get_db),
    actor: Actor = Depends(get_actor),
):
    try:
        rate_check("rumor_submit", actor.ip_hash)
    except RateLimited as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(exc.retry_after)},
            detail="Too many requests",
        ) from None

    try:
        _rumor, is_new = rumor_service.submit(
            db,
            actor,
            claim=payload.claim,
            source_platform=payload.source_platform,
            seen_where=payload.seen_where,
            related_to_crisis=payload.related_to_crisis,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None

    # The rumor id is deliberately not returned: an unpublished rumor is not
    # public, and handing back an identifier would invite probing for it.
    return {
        "status": "received",
        "is_new": is_new,
        "note": "Submissions are reviewed by a person before anything is published.",
    }


@router.post("/reports", status_code=201)
def submit_report(
    payload: ReportSubmission,
    db: DbSession = Depends(get_db),
    actor: Actor = Depends(get_actor),
):
    try:
        rate_check("report_submit", actor.ip_hash)
    except RateLimited as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(exc.retry_after)},
            detail="Too many requests",
        ) from None

    try:
        _report, routing = report_service.submit(
            db,
            actor,
            report_type=payload.report_type,
            description=payload.description,
            location_text=payload.location_text,
            is_emergency=payload.is_emergency,
            contact=payload.contact,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None

    return {
        "status": "received",
        "routing": routing,
        "note": (
            "This platform does not forward reports to any authority automatically."
        ),
    }


# --- Privileged --------------------------------------------------------------


@router.post("/admin/rumors/{rumor_id}/publish")
def admin_publish_rumor(
    rumor_id: int,
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission("rumors.publish")),
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
):
    user, _csrf = auth
    verify_csrf(request, db, x_csrf_token)
    from app.security.privacy import client_ip, hash_ip

    actor = Actor.from_user(user, ip_hash=hash_ip(client_ip(request)))
    try:
        rumor = rumor_service.publish(db, actor, rumor_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except LookupError:
        raise HTTPException(status_code=404, detail="Not found") from None
    return {"status": "published", "rumor_id": rumor.id}


@router.post("/admin/updates/{update_id}/publish")
def admin_publish_update(
    update_id: int,
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission("updates.publish")),
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
):
    user, _csrf = auth
    verify_csrf(request, db, x_csrf_token)
    from app.security.privacy import client_ip, hash_ip

    actor = Actor.from_user(user, ip_hash=hash_ip(client_ip(request)))
    try:
        update = update_service.publish(db, actor, update_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Not found") from None
    return {"status": "published", "update_id": update.id}


# --- Serialisers -------------------------------------------------------------


def _update_json(update, *, include_content: bool = False) -> dict:
    data = {
        "id": update.id,
        "title": update.title,
        "category": update.category,
        "importance": update.importance,
        "organization": update.organization,
        "source_url": update.source_url,
        "verified": update.verified,
        "published_at": update.published_at.isoformat() if update.published_at else None,
        "is_demo": update.is_demo,
    }
    if include_content:
        data["content"] = update.content
        # An unapproved AI summary is never exposed, on any surface.
        data["citizen_summary"] = (
            update.citizen_summary if update.citizen_summary_approved else None
        )
    else:
        data["excerpt"] = (update.content or "")[:280]
    return data


def _rumor_json(rumor) -> dict:
    return {
        "id": rumor.id,
        "claim": rumor.claim,
        "status": rumor.status,
        "status_is_verdict": rumor.status in RumorStatus.CONCLUDED,
        "correction": rumor.correction,
        "explanation": rumor.explanation,
        "evidence_url": rumor.evidence_url,
        "spread_score": rumor.spread_score,
        "report_count": rumor.report_count,
        "checked_at": rumor.checked_at.isoformat() if rumor.checked_at else None,
        "published_at": rumor.published_at.isoformat() if rumor.published_at else None,
        "human_reviewed": rumor.reviewed_by is not None,
        "is_demo": rumor.is_demo,
    }
