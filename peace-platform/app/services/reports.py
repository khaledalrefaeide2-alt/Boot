"""Citizen problem/need reports and their routing.

The platform is explicit that submitting a report is **not** contacting
emergency services. :func:`route_suggestion` returns advice about who to
contact; it never claims a report was dispatched anywhere, because no such
integration exists. If one is added later, this is the single place that
changes, and the wording in ``templates/public/report.html`` changes with it.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from app.models import Report, ReportStatus, ReportType
from app.security.rbac import Permission
from app.security.sanitize import clean_line, clean_text
from app.services import audit
from app.services.context import Actor


def route_suggestion(report_type: str, is_emergency: bool) -> dict:
    """Where the citizen should go. Advice only — never a delivery claim."""
    if is_emergency or report_type == ReportType.EMERGENCY:
        return {
            "route": "emergency_services",
            "message_key": "report.route.emergency",
            "target": "general_emergency",
        }
    if report_type == ReportType.RUMOR:
        return {
            "route": "rumor_verification",
            "message_key": "report.route.rumor",
            "target": None,
        }
    if report_type == ReportType.SERVICE_ISSUE:
        return {
            "route": "service_provider",
            "message_key": "report.route.service",
            "target": "government_call_center",
        }
    return {
        "route": "information",
        "message_key": "report.route.information",
        "target": None,
    }


def submit(
    db: DbSession,
    actor: Actor,
    *,
    report_type: str,
    description: str,
    location_text: str | None = None,
    is_emergency: bool = False,
    contact: str | None = None,
) -> tuple[Report, dict]:
    if report_type not in ReportType.ALL:
        raise ValueError(f"invalid report type '{report_type}'")
    text = clean_text(description, max_length=4000)
    if len(text) < 10:
        raise ValueError("Please describe the problem in a little more detail.")

    routing = route_suggestion(report_type, is_emergency)
    report = Report(
        report_type=report_type,
        description=text,
        location_text=clean_line(location_text, max_length=255) or None,
        is_emergency=bool(is_emergency),
        contact=clean_line(contact, max_length=255) or None,
        status=ReportStatus.NEW,
        routed_to=routing["route"],
        ip_hash=actor.ip_hash,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    audit.record(
        db,
        actor,
        audit.Action.REPORT_SUBMIT,
        object_type="report",
        object_id=report.id,
        new_value={
            "type": report_type,
            "is_emergency": report.is_emergency,
            "suggested_route": routing["route"],
            "has_contact": bool(report.contact),
        },
    )
    return report, routing


def triage(
    db: DbSession,
    actor: Actor,
    report_id: int,
    *,
    status: str,
    triage_note: str = "",
    routed_to: str | None = None,
) -> Report:
    actor.require(Permission.REPORTS_MANAGE)
    if status not in ReportStatus.ALL:
        raise ValueError(f"invalid report status '{status}'")

    report = db.get(Report, report_id)
    if report is None:
        raise LookupError("report not found")
    before = {"status": report.status, "routed_to": report.routed_to}

    report.status = status
    report.triage_note = clean_text(triage_note, max_length=2000) or None
    if routed_to is not None:
        report.routed_to = clean_line(routed_to, max_length=160) or None
    report.handled_by = actor.user_id
    db.commit()
    db.refresh(report)

    audit.record(
        db,
        actor,
        audit.Action.REPORT_TRIAGE,
        object_type="report",
        object_id=report.id,
        old_value=before,
        new_value={"status": report.status, "routed_to": report.routed_to},
    )
    return report


def list_for_dashboard(
    db: DbSession, *, status: str | None = None, limit: int = 100
) -> list[Report]:
    stmt = select(Report).order_by(Report.is_emergency.desc(), Report.created_at.desc())
    if status and status in ReportStatus.ALL:
        stmt = stmt.where(Report.status == status)
    return list(db.scalars(stmt.limit(limit)).all())


def needs_attention_count(db: DbSession) -> int:
    return int(
        db.scalar(select(func.count(Report.id)).where(Report.status == ReportStatus.NEW)) or 0
    )
