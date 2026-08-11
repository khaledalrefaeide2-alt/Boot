"""Role-based access control.

The first test is the one that matters most: **an unauthorised user cannot
publish**. It is asserted at the service layer, not just the HTTP layer, so it
holds for the JSON API and for any future caller too.
"""

from __future__ import annotations

import pytest

from app.models.user import Role
from app.security.rbac import ALL_PERMISSIONS, Permission, has_permission, permissions_for
from app.services import rumors as rumor_service
from app.services import updates as update_service
from app.services.context import Actor


def test_only_admin_holds_every_permission():
    assert permissions_for(Role.SYSTEM_ADMIN) == ALL_PERMISSIONS
    for role in Role.ALL:
        if role != Role.SYSTEM_ADMIN:
            assert permissions_for(role) != ALL_PERMISSIONS


@pytest.mark.parametrize(
    "role",
    [Role.VIEWER, Role.AI_ADMIN, Role.OPS_SUPERVISOR, Role.RUMOR_REVIEWER],
)
def test_roles_without_updates_publish_cannot_publish_updates(db, make_user, role):
    """An unauthorised user cannot publish an official update."""
    author = make_user(Role.CONTENT_EDITOR, email="author@test.local")
    update = update_service.create(
        db,
        Actor.from_user(author),
        title="Draft",
        content="Body text for the draft update.",
        category="general",
        importance="normal",
    )

    other = make_user(role, email=f"{role}@publish.local")
    with pytest.raises(PermissionError):
        update_service.publish(db, Actor.from_user(other), update.id)

    db.refresh(update)
    assert update.status == "draft"
    assert update.published_at is None


@pytest.mark.parametrize(
    "role", [Role.VIEWER, Role.CONTENT_EDITOR, Role.AI_ADMIN, Role.OPS_SUPERVISOR]
)
def test_roles_without_rumors_publish_cannot_publish_rumors(
    db, make_user, anon_actor, role
):
    rumor, _ = rumor_service.submit(db, anon_actor, claim="A claim that needs review.")
    reviewer = make_user(Role.RUMOR_REVIEWER, email="rev@test.local")
    rumor_service.review(
        db,
        Actor.from_user(reviewer),
        rumor.id,
        status="false",
        correction="This claim is not correct; the official position is different.",
    )

    other = make_user(role, email=f"{role}@rumorpub.local")
    with pytest.raises(PermissionError):
        rumor_service.publish(db, Actor.from_user(other), rumor.id)

    db.refresh(rumor)
    assert rumor.published is False


def test_viewer_is_read_only():
    viewer = permissions_for(Role.VIEWER)
    writes = [
        p
        for p in viewer
        if not (p.endswith(".view") or p == Permission.DASHBOARD_VIEW)
    ]
    assert writes == []


def test_viewer_cannot_see_accounts_or_audit_trail():
    """Least privilege: read-only access is not administrative access."""
    assert not has_permission(Role.VIEWER, Permission.USERS_VIEW)
    assert not has_permission(Role.VIEWER, Permission.AUDIT_VIEW)


def test_only_admin_can_manage_users():
    for role in Role.ALL:
        expected = role == Role.SYSTEM_ADMIN
        assert has_permission(role, Permission.USERS_MANAGE) is expected


def test_content_editor_cannot_touch_rumor_verdicts():
    assert not has_permission(Role.CONTENT_EDITOR, Permission.RUMORS_REVIEW)
    assert not has_permission(Role.CONTENT_EDITOR, Permission.RUMORS_PUBLISH)


def test_rumor_reviewer_cannot_publish_official_updates():
    assert not has_permission(Role.RUMOR_REVIEWER, Permission.UPDATES_PUBLISH)


def test_emergency_mode_is_restricted_to_ops_and_admin():
    allowed = {
        role for role in Role.ALL if has_permission(role, Permission.EMERGENCY_TOGGLE)
    }
    assert allowed == {Role.SYSTEM_ADMIN, Role.OPS_SUPERVISOR}
