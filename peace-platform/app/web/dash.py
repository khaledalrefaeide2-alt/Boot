"""Government operations dashboard.

Handlers are thin: they parse the form, call the matching service function, and
re-render. Permission checks appear twice on purpose — once as a route
dependency (so the page 403s before any work happens) and once inside the
service (so the rule holds for the JSON API and for scripts too).
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session as DbSession

from app.ai import ingest as ingest_service
from app.ai import rumor_analysis
from app.db import get_db
from app.models import (
    ContentStatus,
    Importance,
    OfficialUpdate,
    RumorStatus,
    ServiceStatus,
    UpdateCategory,
    UpdateStatus,
    User,
)
from app.models.base import AlertType, CrisisStatus, ReportStatus, Severity
from app.models.user import Role
from app.security import sessions
from app.security.privacy import client_ip, hash_ip
from app.security.rbac import Permission
from app.security.ratelimit import RateLimited, check as rate_check
from app.security.uploads import UploadError, store as store_upload, validate as validate_upload
from app.services import (
    alerts as alert_service,
    audit,
    crisis as crisis_service,
    dashboard as dashboard_service,
    directory as directory_service,
    faqs as faq_service,
    reports as report_service,
    rumors as rumor_service,
    settings_store,
    updates as update_service,
    users as user_service,
)
from app.services.context import Actor
from app.web.deps import dash_context, page_context, require_permission, templates, verify_csrf

router = APIRouter(prefix="/dash")


def _actor(request: Request, user: User) -> Actor:
    return Actor.from_user(
        user,
        ip_hash=hash_ip(client_ip(request)),
        user_agent=request.headers.get("user-agent"),
    )


def _redirect(path: str) -> RedirectResponse:
    return RedirectResponse(path, status_code=303)


def _flash(path: str, message: str, kind: str = "ok") -> RedirectResponse:
    from urllib.parse import quote

    return _redirect(f"{path}?{kind}={quote(message[:200])}")


# --- Authentication ----------------------------------------------------------


@router.get("/login", response_class=HTMLResponse)
def login_form(request: Request, db: DbSession = Depends(get_db), next: str = "/dash"):
    context = page_context(
        request, db, title_key="dash.login", error=None, next_path=_safe_next(next)
    )
    return templates.TemplateResponse(request, "dash/login.html", context)


@router.post("/login", response_class=HTMLResponse)
def login_submit(
    request: Request,
    db: DbSession = Depends(get_db),
    email: str = Form(...),
    password: str = Form(...),
    next: str = Form("/dash"),
):
    ip_hash = hash_ip(client_ip(request))
    anon = Actor.anonymous(ip_hash=ip_hash, user_agent=request.headers.get("user-agent"))

    try:
        rate_check("login", ip_hash)
    except RateLimited:
        context = page_context(
            request, db, title_key="dash.login", error="ui.ratelimited", next_path="/dash"
        )
        return templates.TemplateResponse(
            request, "dash/login.html", context, status_code=429
        )

    try:
        user = user_service.authenticate(db, email, password, anon)
    except user_service.AuthError:
        context = page_context(
            request,
            db,
            title_key="dash.login",
            error="dash.login.error",
            next_path=_safe_next(next),
        )
        return templates.TemplateResponse(
            request, "dash/login.html", context, status_code=401
        )

    from app.config import get_settings

    token, _record = sessions.create_session(
        db, user, ip_hash=ip_hash, user_agent=request.headers.get("user-agent")
    )
    response = _redirect(_safe_next(next))
    response.set_cookie(
        sessions.SESSION_COOKIE,
        token,
        httponly=True,
        secure=get_settings().cookie_secure,
        samesite="strict",
        path="/",
    )
    return response


@router.post("/logout")
def logout(request: Request, db: DbSession = Depends(get_db)):
    resolved = sessions.resolve_session(db, request.cookies.get(sessions.SESSION_COOKIE))
    if resolved is not None:
        user, record = resolved
        audit.record(db, _actor(request, user), audit.Action.LOGOUT, object_type="user",
                     object_id=user.id)
        sessions.revoke_session(db, record)
    response = _redirect("/dash/login")
    response.delete_cookie(sessions.SESSION_COOKIE, path="/")
    return response


def _safe_next(value: str) -> str:
    """Only same-site dashboard paths, to prevent an open redirect on login."""
    return value if value.startswith("/dash") else "/dash"


# --- Overview ----------------------------------------------------------------


@router.get("", response_class=HTMLResponse)
@router.get("/", response_class=HTMLResponse)
def overview(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.DASHBOARD_VIEW)),
):
    user, csrf = auth
    context = dash_context(
        request, db, user, csrf, title_key="dash.overview", **dashboard_service.overview(db)
    )
    return templates.TemplateResponse(request, "dash/overview.html", context)


# --- Official updates --------------------------------------------------------


@router.get("/updates", response_class=HTMLResponse)
def updates_list(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.UPDATES_VIEW)),
    status: str | None = None,
):
    user, csrf = auth
    context = dash_context(
        request,
        db,
        user,
        csrf,
        title_key="dash.updates",
        updates=update_service.list_for_dashboard(db, status=status),
        statuses=UpdateStatus.ALL,
        categories=UpdateCategory.ALL,
        importances=Importance.ALL,
        sources=directory_service.list_sources(db),
        active_status=status,
    )
    return templates.TemplateResponse(request, "dash/updates.html", context)


@router.post("/updates/create")
def updates_create(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.UPDATES_CREATE)),
    csrf_token: str = Form(...),
    title: str = Form(...),
    content: str = Form(...),
    category: str = Form("general"),
    importance: str = Form("normal"),
    source_id: str = Form(""),
    source_url: str = Form(""),
    scheduled_for: str = Form(""),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    current = crisis_service.current(db)
    try:
        update_service.create(
            db,
            _actor(request, user),
            title=title,
            content=content,
            category=category,
            importance=importance,
            source_id=int(source_id) if source_id else None,
            source_url=source_url or None,
            crisis_id=current.id if current else None,
            scheduled_for=_parse_datetime(scheduled_for),
        )
    except (ValueError, LookupError) as exc:
        return _flash("/dash/updates", str(exc), "error")
    return _flash("/dash/updates", "Update created as a draft.")


@router.post("/updates/{update_id}/publish")
def updates_publish(
    update_id: int,
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.UPDATES_PUBLISH)),
    csrf_token: str = Form(...),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    try:
        update_service.publish(db, _actor(request, user), update_id)
    except (ValueError, LookupError) as exc:
        return _flash("/dash/updates", str(exc), "error")
    return _flash("/dash/updates", "Update published.")


@router.post("/updates/{update_id}/archive")
def updates_archive(
    update_id: int,
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.UPDATES_ARCHIVE)),
    csrf_token: str = Form(...),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    update_service.archive(db, _actor(request, user), update_id)
    return _flash("/dash/updates", "Update archived.")


@router.post("/updates/{update_id}/suggest-summary")
def updates_suggest_summary(
    update_id: int,
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.UPDATES_EDIT)),
    csrf_token: str = Form(...),
):
    """Ask the model for a plain-language version. Stored unapproved."""
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    from app.ai.providers import get_llm

    update = db.get(OfficialUpdate, update_id)
    if update is None:
        return _flash("/dash/updates", "Update not found.", "error")

    ai_config = settings_store.get_ai_config(db)
    try:
        summary = get_llm().summarize_for_citizens(
            text=update.content, style=ai_config.get("response_style", "calm"), locale="ar"
        )
    except Exception:  # noqa: BLE001 - surface a message, never a stack trace
        return _flash("/dash/updates", "The summarisation service is unavailable.", "error")

    if not summary:
        return _flash("/dash/updates", "No summary was produced.", "error")
    update_service.store_ai_suggestion(
        db, _actor(request, user), update_id, citizen_summary=summary
    )
    return _flash(
        "/dash/updates", "Draft summary saved. It stays hidden until you approve it."
    )


@router.post("/updates/{update_id}/approve-summary")
def updates_approve_summary(
    update_id: int,
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.UPDATES_PUBLISH)),
    csrf_token: str = Form(...),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    try:
        update_service.approve_ai_summary(db, _actor(request, user), update_id)
    except (ValueError, LookupError) as exc:
        return _flash("/dash/updates", str(exc), "error")
    return _flash("/dash/updates", "Summary approved for public display.")


# --- Rumors ------------------------------------------------------------------


@router.get("/rumors", response_class=HTMLResponse)
def rumors_list(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.RUMORS_VIEW)),
    status: str | None = None,
):
    user, csrf = auth
    context = dash_context(
        request,
        db,
        user,
        csrf,
        title_key="dash.rumors",
        rumors=rumor_service.list_for_dashboard(db, status=status),
        statuses=RumorStatus.ALL,
        active_status=status,
    )
    return templates.TemplateResponse(request, "dash/rumors.html", context)


@router.get("/rumors/{rumor_id}", response_class=HTMLResponse)
def rumor_detail(
    rumor_id: int,
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.RUMORS_VIEW)),
):
    user, csrf = auth
    rumor = rumor_service.get(db, rumor_id)
    if rumor is None:
        raise HTTPException(status_code=404)
    context = dash_context(
        request,
        db,
        user,
        csrf,
        title_key="dash.rumors",
        rumor=rumor,
        statuses=RumorStatus.ALL,
        sources=directory_service.list_sources(db),
    )
    return templates.TemplateResponse(request, "dash/rumor_detail.html", context)


@router.post("/rumors/{rumor_id}/analyze")
def rumor_analyze(
    rumor_id: int,
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.RUMORS_REVIEW)),
    csrf_token: str = Form(...),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    try:
        rumor_analysis.analyze(db, _actor(request, user), rumor_id)
    except LookupError:
        raise HTTPException(status_code=404) from None
    return _flash(
        f"/dash/rumors/{rumor_id}",
        "Analysis stored as a suggestion. It is not published.",
    )


@router.post("/rumors/{rumor_id}/review")
def rumor_review(
    rumor_id: int,
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.RUMORS_REVIEW)),
    csrf_token: str = Form(...),
    status: str = Form(...),
    correction: str = Form(""),
    explanation: str = Form(""),
    evidence_url: str = Form(""),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    try:
        rumor_service.review(
            db,
            _actor(request, user),
            rumor_id,
            status=status,
            correction=correction,
            explanation=explanation,
            evidence_url=evidence_url or None,
        )
    except (ValueError, LookupError) as exc:
        return _flash(f"/dash/rumors/{rumor_id}", str(exc), "error")
    return _flash(f"/dash/rumors/{rumor_id}", "Review recorded. Publish it separately.")


@router.post("/rumors/{rumor_id}/publish")
def rumor_publish(
    rumor_id: int,
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.RUMORS_PUBLISH)),
    csrf_token: str = Form(...),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    try:
        rumor_service.publish(db, _actor(request, user), rumor_id)
    except (ValueError, LookupError) as exc:
        return _flash(f"/dash/rumors/{rumor_id}", str(exc), "error")
    return _flash(f"/dash/rumors/{rumor_id}", "Verification published.")


@router.post("/rumors/{rumor_id}/unpublish")
def rumor_unpublish(
    rumor_id: int,
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.RUMORS_PUBLISH)),
    csrf_token: str = Form(...),
    reason: str = Form(""),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    rumor_service.unpublish(db, _actor(request, user), rumor_id, reason)
    return _flash(f"/dash/rumors/{rumor_id}", "Verification withdrawn from the site.")


# --- FAQs --------------------------------------------------------------------


@router.get("/faqs", response_class=HTMLResponse)
def faqs_list(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.FAQS_VIEW)),
):
    user, csrf = auth
    context = dash_context(
        request,
        db,
        user,
        csrf,
        title_key="dash.faqs",
        faqs=faq_service.list_for_dashboard(db),
        categories=faq_service.CATEGORIES,
        statuses=ContentStatus.ALL,
        gaps=faq_service.information_gaps(db),
    )
    return templates.TemplateResponse(request, "dash/faqs.html", context)


@router.post("/faqs/create")
def faqs_create(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.FAQS_MANAGE)),
    csrf_token: str = Form(...),
    question: str = Form(...),
    answer: str = Form(...),
    category: str = Form("general"),
    publish: str = Form(""),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    try:
        faq_service.create(
            db,
            _actor(request, user),
            question=question,
            answer=answer,
            category=category,
            publish=publish == "on",
        )
    except ValueError as exc:
        return _flash("/dash/faqs", str(exc), "error")
    return _flash("/dash/faqs", "FAQ saved.")


@router.post("/faqs/{faq_id}/status")
def faqs_status(
    faq_id: int,
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.FAQS_MANAGE)),
    csrf_token: str = Form(...),
    status: str = Form(...),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    try:
        faq_service.edit(db, _actor(request, user), faq_id, status=status)
    except (ValueError, LookupError) as exc:
        return _flash("/dash/faqs", str(exc), "error")
    return _flash("/dash/faqs", "FAQ updated.")


# --- Services ----------------------------------------------------------------


@router.get("/services", response_class=HTMLResponse)
def services_list(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.SERVICES_VIEW)),
):
    user, csrf = auth
    context = dash_context(
        request,
        db,
        user,
        csrf,
        title_key="dash.services",
        services=directory_service.list_services(db, include_inactive=True),
        service_types=directory_service.SERVICE_TYPES,
        statuses=ServiceStatus.ALL,
    )
    return templates.TemplateResponse(request, "dash/services.html", context)


@router.post("/services/create")
def services_create(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.SERVICES_MANAGE)),
    csrf_token: str = Form(...),
    organization: str = Form(...),
    phone: str = Form(...),
    service_type: str = Form(...),
    hours: str = Form(""),
    website: str = Form(""),
    location: str = Form(""),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    try:
        directory_service.create_service(
            db,
            _actor(request, user),
            organization=organization,
            phone=phone,
            service_type=service_type,
            hours=hours,
            website=website or None,
            location=location or None,
        )
    except ValueError as exc:
        return _flash("/dash/services", str(exc), "error")
    return _flash("/dash/services", "Service added.")


@router.post("/services/{service_id}/edit")
def services_edit(
    service_id: int,
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.SERVICES_MANAGE)),
    csrf_token: str = Form(...),
    phone: str = Form(...),
    hours: str = Form(""),
    status: str = Form("active"),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    try:
        directory_service.edit_service(
            db, _actor(request, user), service_id, phone=phone, hours=hours, status=status
        )
    except (ValueError, LookupError) as exc:
        return _flash("/dash/services", str(exc), "error")
    return _flash("/dash/services", "Service updated. The change is in the audit log.")


# --- Alerts ------------------------------------------------------------------


@router.get("/alerts", response_class=HTMLResponse)
def alerts_list(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.ALERTS_VIEW)),
):
    user, csrf = auth
    context = dash_context(
        request,
        db,
        user,
        csrf,
        title_key="dash.alerts",
        alerts=alert_service.list_all(db),
        alert_types=AlertType.ALL,
    )
    return templates.TemplateResponse(request, "dash/alerts.html", context)


@router.post("/alerts/create")
def alerts_create(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.ALERTS_MANAGE)),
    csrf_token: str = Form(...),
    type: str = Form(...),
    message: str = Form(...),
    ends_at: str = Form(""),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    try:
        alert_service.create(
            db,
            _actor(request, user),
            type=type,
            message=message,
            ends_at=_parse_datetime(ends_at),
        )
    except ValueError as exc:
        return _flash("/dash/alerts", str(exc), "error")
    return _flash("/dash/alerts", "Alert published.")


@router.post("/alerts/{alert_id}/deactivate")
def alerts_deactivate(
    alert_id: int,
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.ALERTS_MANAGE)),
    csrf_token: str = Form(...),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    alert_service.deactivate(db, _actor(request, user), alert_id)
    return _flash("/dash/alerts", "Alert deactivated.")


# --- Reports -----------------------------------------------------------------


@router.get("/reports", response_class=HTMLResponse)
def reports_list(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.REPORTS_VIEW)),
    status: str | None = None,
):
    user, csrf = auth
    context = dash_context(
        request,
        db,
        user,
        csrf,
        title_key="dash.reports",
        reports=report_service.list_for_dashboard(db, status=status),
        statuses=ReportStatus.ALL,
        active_status=status,
    )
    return templates.TemplateResponse(request, "dash/reports.html", context)


@router.post("/reports/{report_id}/triage")
def reports_triage(
    report_id: int,
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.REPORTS_MANAGE)),
    csrf_token: str = Form(...),
    status: str = Form(...),
    triage_note: str = Form(""),
    routed_to: str = Form(""),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    try:
        report_service.triage(
            db,
            _actor(request, user),
            report_id,
            status=status,
            triage_note=triage_note,
            routed_to=routed_to or None,
        )
    except (ValueError, LookupError) as exc:
        return _flash("/dash/reports", str(exc), "error")
    return _flash("/dash/reports", "Report triaged.")


# --- Sources -----------------------------------------------------------------


@router.get("/sources", response_class=HTMLResponse)
def sources_list(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.SOURCES_VIEW)),
):
    user, csrf = auth
    context = dash_context(
        request,
        db,
        user,
        csrf,
        title_key="dash.sources",
        sources=directory_service.list_sources(db, include_inactive=True),
    )
    return templates.TemplateResponse(request, "dash/sources.html", context)


@router.post("/sources/create")
def sources_create(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.SOURCES_MANAGE)),
    csrf_token: str = Form(...),
    name: str = Form(...),
    slug: str = Form(...),
    url: str = Form(""),
    trust_level: int = Form(3),
    why_trusted: str = Form(""),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    try:
        directory_service.create_source(
            db,
            _actor(request, user),
            name=name,
            slug=slug,
            url=url or None,
            trust_level=trust_level,
            why_trusted=why_trusted,
        )
    except ValueError as exc:
        return _flash("/dash/sources", str(exc), "error")
    return _flash("/dash/sources", "Source registered.")


# --- Knowledge base ----------------------------------------------------------


@router.get("/knowledge", response_class=HTMLResponse)
def knowledge_list(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.KNOWLEDGE_VIEW)),
):
    user, csrf = auth
    context = dash_context(
        request,
        db,
        user,
        csrf,
        title_key="dash.knowledge",
        documents=ingest_service.list_documents(db),
        sources=directory_service.list_sources(db),
    )
    return templates.TemplateResponse(request, "dash/knowledge.html", context)


@router.post("/knowledge/add-text")
def knowledge_add_text(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.KNOWLEDGE_MANAGE)),
    csrf_token: str = Form(...),
    title: str = Form(...),
    body: str = Form(...),
    source_id: str = Form(""),
    trust_level: int = Form(3),
    topic: str = Form(""),
    url: str = Form(""),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    current = crisis_service.current(db)
    try:
        ingest_service.add_document(
            db,
            _actor(request, user),
            title=title,
            raw_text=body,
            source_id=int(source_id) if source_id else None,
            doc_type="text",
            url=url or None,
            topic=topic or None,
            crisis_id=current.id if current else None,
            trust_level=trust_level,
            published_at=datetime.now(timezone.utc),
        )
    except (ValueError, LookupError, ingest_service.ExtractionError) as exc:
        return _flash("/dash/knowledge", str(exc), "error")
    return _flash("/dash/knowledge", "Source indexed.")


@router.post("/knowledge/upload")
async def knowledge_upload(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.KNOWLEDGE_MANAGE)),
    csrf_token: str = Form(...),
    title: str = Form(...),
    source_id: str = Form(""),
    trust_level: int = Form(3),
    file: UploadFile = File(...),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    data = await file.read()

    try:
        suffix = validate_upload(file.filename or "", file.content_type, data)
        text = ingest_service.extract_text(data, suffix)
        path, digest = store_upload(data, suffix)
    except (UploadError, ingest_service.ExtractionError) as exc:
        return _flash("/dash/knowledge", str(exc), "error")

    current = crisis_service.current(db)
    try:
        ingest_service.add_document(
            db,
            _actor(request, user),
            title=title,
            raw_text=text,
            source_id=int(source_id) if source_id else None,
            doc_type="pdf" if suffix == ".pdf" else "file",
            file_path=str(path),
            file_hash=digest,
            crisis_id=current.id if current else None,
            trust_level=trust_level,
            published_at=datetime.now(timezone.utc),
        )
    except (ValueError, LookupError, ingest_service.ExtractionError) as exc:
        return _flash("/dash/knowledge", str(exc), "error")
    return _flash("/dash/knowledge", "Document uploaded and indexed.")


@router.post("/knowledge/{document_id}/status")
def knowledge_status(
    document_id: int,
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.KNOWLEDGE_MANAGE)),
    csrf_token: str = Form(...),
    status: str = Form(...),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    try:
        ingest_service.set_document_status(db, _actor(request, user), document_id, status)
    except (ValueError, LookupError) as exc:
        return _flash("/dash/knowledge", str(exc), "error")
    return _flash("/dash/knowledge", "Source status updated.")


# --- AI configuration, playground and quality --------------------------------


@router.get("/ai", response_class=HTMLResponse)
def ai_config_page(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.AI_QUALITY_VIEW)),
):
    from app.ai.providers import get_llm
    from app.config import get_settings

    user, csrf = auth
    settings = get_settings()
    context = dash_context(
        request,
        db,
        user,
        csrf,
        title_key="dash.ai",
        ai_config=settings_store.get_ai_config(db),
        provider_name=get_llm().name,
        model_name=settings.llm_model if settings.llm_configured else "—",
        llm_configured=settings.llm_configured,
    )
    return templates.TemplateResponse(request, "dash/ai_config.html", context)


@router.post("/ai/config")
def ai_config_save(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.AI_CONFIG)),
    csrf_token: str = Form(...),
    response_style: str = Form("calm"),
    min_confidence: float = Form(0.45),
    min_source_trust: int = Form(2),
    max_context_chunks: int = Form(6),
    require_citations: str = Form(""),
    assistant_enabled: str = Form(""),
    restricted_topics: str = Form(""),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    try:
        settings_store.set_ai_config(
            db,
            _actor(request, user),
            {
                "response_style": response_style,
                "min_confidence": min_confidence,
                "min_source_trust": min_source_trust,
                "max_context_chunks": max_context_chunks,
                "require_citations": require_citations == "on",
                "assistant_enabled": assistant_enabled == "on",
                "restricted_topics": restricted_topics,
            },
        )
    except ValueError as exc:
        return _flash("/dash/ai", str(exc), "error")
    return _flash("/dash/ai", "AI configuration saved.")


@router.get("/ai/playground", response_class=HTMLResponse)
def ai_playground(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.KNOWLEDGE_VIEW)),
    q: str = "",
):
    """Retrieval inspector: shows exactly which passages a question retrieves."""
    from app.ai import retrieval

    user, csrf = auth
    ai_config = settings_store.get_ai_config(db)
    current = crisis_service.current(db)
    chunks = (
        retrieval.retrieve(
            db,
            q,
            limit=int(ai_config.get("max_context_chunks", 6)),
            min_trust=int(ai_config.get("min_source_trust", 2)),
            crisis_id=current.id if current else None,
            include_flagged=True,
        )
        if q
        else []
    )
    conflicts = retrieval.detect_conflicts(chunks) if chunks else []
    context = dash_context(
        request,
        db,
        user,
        csrf,
        title_key="dash.ai",
        query=q,
        chunks=chunks,
        conflicts=conflicts,
        confidence=retrieval.confidence_from(chunks, conflicts) if chunks else 0.0,
        threshold=ai_config.get("min_confidence", 0.45),
    )
    return templates.TemplateResponse(request, "dash/ai_playground.html", context)


@router.get("/ai/quality", response_class=HTMLResponse)
def ai_quality(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.AI_QUALITY_VIEW)),
):
    user, csrf = auth
    context = dash_context(
        request,
        db,
        user,
        csrf,
        title_key="dash.quality",
        metrics=dashboard_service.ai_quality(db),
        low_confidence=dashboard_service.low_confidence_answers(db, limit=25),
    )
    return templates.TemplateResponse(request, "dash/ai_quality.html", context)


@router.post("/ai/quality/{question_id}/correct")
def ai_quality_correct(
    question_id: int,
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.FAQS_MANAGE)),
    csrf_token: str = Form(...),
    correction: str = Form(...),
):
    """Record a human correction; optionally promote it to a published FAQ."""
    from app.models import UserQuestion
    from app.security.sanitize import clean_text

    user, _ = auth
    verify_csrf(request, db, csrf_token)
    row = db.get(UserQuestion, question_id)
    if row is None:
        return _flash("/dash/ai/quality", "Question not found.", "error")

    row.human_correction = clean_text(correction, max_length=4000)
    row.corrected_by = user.id
    db.commit()
    audit.record(
        db,
        _actor(request, user),
        audit.Action.AI_ANSWER_CORRECTED,
        object_type="user_question",
        object_id=row.id,
        new_value={"question": row.question[:200]},
    )
    return _flash("/dash/ai/quality", "Correction recorded.")


# --- Users, audit, crisis ----------------------------------------------------


@router.get("/users", response_class=HTMLResponse)
def users_list(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.USERS_VIEW)),
):
    user, csrf = auth
    context = dash_context(
        request,
        db,
        user,
        csrf,
        title_key="dash.users",
        users=user_service.list_users(db),
        roles=Role.ALL,
    )
    return templates.TemplateResponse(request, "dash/users.html", context)


@router.post("/users/create")
def users_create(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.USERS_MANAGE)),
    csrf_token: str = Form(...),
    name: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    role: str = Form("viewer"),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    try:
        user_service.create_user(
            db, _actor(request, user), name=name, email=email, password=password, role=role
        )
    except ValueError as exc:
        return _flash("/dash/users", str(exc), "error")
    return _flash("/dash/users", "Account created.")


@router.post("/users/{user_id}/role")
def users_role(
    user_id: int,
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.USERS_MANAGE)),
    csrf_token: str = Form(...),
    role: str = Form(...),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    try:
        user_service.change_role(db, _actor(request, user), user_id, role)
    except (ValueError, LookupError) as exc:
        return _flash("/dash/users", str(exc), "error")
    return _flash("/dash/users", "Role updated and active sessions revoked.")


@router.post("/users/{user_id}/status")
def users_status(
    user_id: int,
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.USERS_MANAGE)),
    csrf_token: str = Form(...),
    status: str = Form(...),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    try:
        user_service.set_status(db, _actor(request, user), user_id, status)
    except (ValueError, LookupError) as exc:
        return _flash("/dash/users", str(exc), "error")
    return _flash("/dash/users", "Account status updated.")


@router.get("/audit", response_class=HTMLResponse)
def audit_page(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.AUDIT_VIEW)),
    action: str | None = None,
    object_type: str | None = None,
):
    user, csrf = auth
    context = dash_context(
        request,
        db,
        user,
        csrf,
        title_key="dash.audit",
        entries=audit.search(db, action=action, object_type=object_type, limit=200),
        active_action=action,
        active_object_type=object_type,
    )
    return templates.TemplateResponse(request, "dash/audit.html", context)


@router.get("/crisis", response_class=HTMLResponse)
def crisis_page(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.DASHBOARD_VIEW)),
):
    user, csrf = auth
    context = dash_context(
        request,
        db,
        user,
        csrf,
        title_key="dash.crisis",
        crises=crisis_service.list_all(db),
        severities=Severity.ALL,
        crisis_statuses=CrisisStatus.ALL,
        emergency=settings_store.get_emergency_mode(db),
    )
    return templates.TemplateResponse(request, "dash/crisis.html", context)


@router.post("/crisis/{crisis_id}/update")
def crisis_update(
    crisis_id: int,
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.CRISIS_MANAGE)),
    csrf_token: str = Form(...),
    severity: str = Form(...),
    status: str = Form(...),
    make_active: str = Form(""),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    try:
        crisis_service.update(
            db,
            _actor(request, user),
            crisis_id,
            severity=severity,
            status=status,
            make_active=(make_active == "on") or None,
        )
    except (ValueError, LookupError) as exc:
        return _flash("/dash/crisis", str(exc), "error")
    return _flash("/dash/crisis", "Crisis status updated.")


@router.post("/crisis/emergency-mode")
def emergency_mode(
    request: Request,
    db: DbSession = Depends(get_db),
    auth=Depends(require_permission(Permission.EMERGENCY_TOGGLE)),
    csrf_token: str = Form(...),
    enabled: str = Form(""),
    headline: str = Form(""),
    hide_nonessential: str = Form(""),
):
    user, _ = auth
    verify_csrf(request, db, csrf_token)
    settings_store.set_emergency_mode(
        db,
        _actor(request, user),
        enabled=enabled == "on",
        headline=headline,
        hide_nonessential=hide_nonessential == "on",
    )
    return _flash("/dash/crisis", "Emergency mode updated.")


# --- Helpers -----------------------------------------------------------------


def _parse_datetime(value: str) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
