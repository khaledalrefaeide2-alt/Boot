"""Role-based access control.

A single matrix defines every permission each role holds. Route handlers and
service functions both consult it, so there is no path where a UI check is the
only thing standing between a user and a privileged action.

Least privilege is the rule: a role gets a write permission only where that
role's job requires it. Notably, no role except ``system_admin`` can both
manage users *and* publish content.
"""

from __future__ import annotations

from app.models.user import Role


class Permission:
    DASHBOARD_VIEW = "dashboard.view"

    UPDATES_VIEW = "updates.view"
    UPDATES_CREATE = "updates.create"
    UPDATES_EDIT = "updates.edit"
    UPDATES_PUBLISH = "updates.publish"
    UPDATES_ARCHIVE = "updates.archive"

    RUMORS_VIEW = "rumors.view"
    RUMORS_REVIEW = "rumors.review"
    RUMORS_PUBLISH = "rumors.publish"
    RUMORS_ARCHIVE = "rumors.archive"

    FAQS_VIEW = "faqs.view"
    FAQS_MANAGE = "faqs.manage"

    SERVICES_VIEW = "services.view"
    SERVICES_MANAGE = "services.manage"

    GUIDANCE_VIEW = "guidance.view"
    GUIDANCE_MANAGE = "guidance.manage"

    ALERTS_VIEW = "alerts.view"
    ALERTS_MANAGE = "alerts.manage"

    REPORTS_VIEW = "reports.view"
    REPORTS_MANAGE = "reports.manage"

    SOURCES_VIEW = "sources.view"
    SOURCES_MANAGE = "sources.manage"

    KNOWLEDGE_VIEW = "knowledge.view"
    KNOWLEDGE_MANAGE = "knowledge.manage"

    AI_CONFIG = "ai.config"
    AI_QUALITY_VIEW = "ai.quality.view"

    USERS_VIEW = "users.view"
    USERS_MANAGE = "users.manage"

    AUDIT_VIEW = "audit.view"

    CRISIS_MANAGE = "crisis.manage"
    EMERGENCY_TOGGLE = "emergency.toggle"


#: Every permission that exists. ``system_admin`` receives exactly this set.
ALL_PERMISSIONS: frozenset[str] = frozenset(
    value
    for name, value in vars(Permission).items()
    if not name.startswith("_") and isinstance(value, str)
)

#: Two view permissions are deliberately excluded from the read-only baseline.
#: The account directory reveals who holds which role, and the audit log records
#: every sensitive action — both are administrative surfaces, not "read-only
#: dashboard access". Roles that need them are granted them explicitly below.
_SENSITIVE_VIEWS: frozenset[str] = frozenset(
    {Permission.USERS_VIEW, Permission.AUDIT_VIEW}
)

_READ_ONLY: frozenset[str] = (
    frozenset(
        p for p in ALL_PERMISSIONS if p.endswith(".view") or p == Permission.DASHBOARD_VIEW
    )
    - _SENSITIVE_VIEWS
)

ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    Role.SYSTEM_ADMIN: ALL_PERMISSIONS,
    Role.CONTENT_EDITOR: frozenset(
        {
            Permission.DASHBOARD_VIEW,
            Permission.UPDATES_VIEW,
            Permission.UPDATES_CREATE,
            Permission.UPDATES_EDIT,
            Permission.UPDATES_PUBLISH,
            Permission.UPDATES_ARCHIVE,
            Permission.FAQS_VIEW,
            Permission.FAQS_MANAGE,
            Permission.GUIDANCE_VIEW,
            Permission.GUIDANCE_MANAGE,
            Permission.SOURCES_VIEW,
            Permission.ALERTS_VIEW,
            Permission.REPORTS_VIEW,
            Permission.RUMORS_VIEW,
            Permission.SERVICES_VIEW,
        }
    ),
    Role.RUMOR_REVIEWER: frozenset(
        {
            Permission.DASHBOARD_VIEW,
            Permission.RUMORS_VIEW,
            Permission.RUMORS_REVIEW,
            Permission.RUMORS_PUBLISH,
            Permission.RUMORS_ARCHIVE,
            Permission.UPDATES_VIEW,
            Permission.SOURCES_VIEW,
            Permission.REPORTS_VIEW,
            Permission.FAQS_VIEW,
        }
    ),
    Role.OPS_SUPERVISOR: _READ_ONLY
    | frozenset(
        {
            Permission.ALERTS_MANAGE,
            Permission.CRISIS_MANAGE,
            Permission.EMERGENCY_TOGGLE,
            Permission.REPORTS_MANAGE,
            Permission.AUDIT_VIEW,
        }
    ),
    Role.AI_ADMIN: _READ_ONLY
    | frozenset(
        {
            Permission.KNOWLEDGE_MANAGE,
            Permission.AI_CONFIG,
            Permission.AI_QUALITY_VIEW,
            Permission.SOURCES_MANAGE,
        }
    ),
    Role.VIEWER: _READ_ONLY,
}


def permissions_for(role: str) -> frozenset[str]:
    return ROLE_PERMISSIONS.get(role, frozenset())


def has_permission(role: str, permission: str) -> bool:
    return permission in permissions_for(role)


def require(role: str, permission: str) -> None:
    """Raise ``PermissionError`` unless the role holds the permission.

    Service functions call this directly so that authorisation is enforced even
    when a caller bypasses the HTTP layer (scripts, tests, future workers).
    """
    if not has_permission(role, permission):
        raise PermissionError(f"role '{role}' lacks permission '{permission}'")
