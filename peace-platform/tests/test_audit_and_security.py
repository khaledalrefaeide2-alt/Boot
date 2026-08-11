"""Audit trail, authentication, sessions and input handling."""

from __future__ import annotations

from datetime import timedelta

import pytest

from app.models import AuditLog, UserStatus, utcnow
from app.models.user import Role
from app.security import sessions
from app.security.passwords import PasswordError, hash_password, verify_password
from app.security.sanitize import clean_line, clean_text, normalize_question, safe_url
from app.security.uploads import UploadError, validate
from app.services import audit
from app.services import directory as directory_service
from app.services import rumors as rumor_service
from app.services import settings_store
from app.services import updates as update_service
from app.services import users as user_service
from app.services.context import Actor


def _actions(db) -> list[str]:
    return [row.action for row in db.query(AuditLog).all()]


# --- Audit -------------------------------------------------------------------


def test_publishing_an_update_is_audited_with_before_and_after(db, admin_actor):
    update = update_service.create(
        db,
        admin_actor,
        title="Road closure",
        content="The coastal road is closed between kilometre 12 and 27.",
        category="transport",
        importance="important",
    )
    update_service.publish(db, admin_actor, update.id)

    entries = [
        row
        for row in db.query(AuditLog).all()
        if row.action == audit.Action.UPDATE_PUBLISH
    ]
    assert len(entries) == 1
    entry = entries[0]
    assert entry.object_type == "official_update"
    assert entry.object_id == str(update.id)
    assert entry.old_value["status"] == "draft"
    assert entry.new_value["status"] == "published"
    assert entry.user_email == admin_actor.email
    assert entry.role == Role.SYSTEM_ADMIN


def test_changing_an_emergency_number_records_the_previous_value(db, admin_actor):
    service = directory_service.create_service(
        db,
        admin_actor,
        organization="Civil Defense",
        phone="555 0998",
        service_type="civil_defense",
    )
    directory_service.edit_service(db, admin_actor, service.id, phone="555 0997")

    entry = [
        row for row in db.query(AuditLog).all() if row.action == audit.Action.SERVICE_EDIT
    ][-1]
    assert entry.old_value["phone"] == "555 0998"
    assert entry.new_value["phone"] == "555 0997"


def test_rumor_publication_is_audited(db, admin_actor, anon_actor):
    rumor, _ = rumor_service.submit(db, anon_actor, claim="A claim requiring review.")
    rumor_service.review(
        db,
        admin_actor,
        rumor.id,
        status="false",
        correction="The official position is different from this claim.",
    )
    rumor_service.publish(db, admin_actor, rumor.id)

    actions = _actions(db)
    for expected in (
        audit.Action.RUMOR_SUBMIT,
        audit.Action.RUMOR_REVIEW,
        audit.Action.RUMOR_PUBLISH,
    ):
        assert expected in actions


def test_emergency_mode_toggle_is_audited(db, admin_actor):
    settings_store.set_emergency_mode(
        db, admin_actor, enabled=True, headline="Flooding in the coastal region"
    )
    entry = [
        row for row in db.query(AuditLog).all() if row.action == audit.Action.EMERGENCY_MODE
    ][-1]
    assert entry.old_value["enabled"] is False
    assert entry.new_value["enabled"] is True


def test_ai_configuration_change_is_audited(db, admin_actor):
    settings_store.set_ai_config(db, admin_actor, {"min_confidence": 0.8})
    entry = [
        row
        for row in db.query(AuditLog).all()
        if row.action == audit.Action.AI_CONFIG_CHANGE
    ][-1]
    assert entry.new_value["min_confidence"] == 0.8


def test_human_review_requirement_cannot_be_disabled(db, admin_actor):
    with pytest.raises(ValueError, match="platform guarantee"):
        settings_store.set_ai_config(db, admin_actor, {"require_human_review": False})


def test_failed_login_is_audited_without_leaking_which_part_was_wrong(db, make_user):
    make_user(Role.VIEWER, email="known@test.local")
    anon = Actor.anonymous(ip_hash="hash")

    with pytest.raises(user_service.AuthError) as unknown:
        user_service.authenticate(db, "nobody@test.local", "whatever", anon)
    with pytest.raises(user_service.AuthError) as wrong_password:
        user_service.authenticate(db, "known@test.local", "wrong-password", anon)

    assert str(unknown.value) == str(wrong_password.value)
    assert _actions(db).count(audit.Action.LOGIN_FAILURE) == 2


# --- Authentication and sessions ---------------------------------------------


def test_repeated_failures_lock_the_account(db, make_user):
    user = make_user(Role.VIEWER, email="lockme@test.local")
    anon = Actor.anonymous()

    for _ in range(5):
        with pytest.raises(user_service.AuthError):
            user_service.authenticate(db, user.email, "wrong", anon)

    db.refresh(user)
    assert user.locked_until is not None

    # Even the correct password is refused while the lock stands.
    with pytest.raises(user_service.AuthError):
        user_service.authenticate(db, user.email, "TestPassw0rd!x", anon)


def test_session_token_is_stored_only_as_a_hash(db, admin):
    raw, record = sessions.create_session(db, admin)
    assert record.token_hash != raw
    assert len(record.token_hash) == 64
    assert sessions.resolve_session(db, raw) is not None
    assert sessions.resolve_session(db, "not-the-token") is None


def test_revoked_session_stops_working(db, admin):
    raw, record = sessions.create_session(db, admin)
    sessions.revoke_session(db, record)
    assert sessions.resolve_session(db, raw) is None


def test_expired_session_stops_working(db, admin):
    raw, record = sessions.create_session(db, admin)
    record.absolute_expires_at = utcnow() - timedelta(minutes=1)
    db.commit()
    assert sessions.resolve_session(db, raw) is None


def test_suspending_a_user_revokes_their_sessions(db, admin, make_user):
    victim = make_user(Role.CONTENT_EDITOR, email="victim@test.local")
    raw, _ = sessions.create_session(db, victim)
    assert sessions.resolve_session(db, raw) is not None

    user_service.set_status(db, Actor.from_user(admin), victim.id, UserStatus.SUSPENDED)
    assert sessions.resolve_session(db, raw) is None


def test_role_change_revokes_sessions_so_permissions_cannot_linger(
    db, admin, make_user
):
    user = make_user(Role.SYSTEM_ADMIN, email="demoted@test.local")
    raw, _ = sessions.create_session(db, user)

    user_service.change_role(db, Actor.from_user(admin), user.id, Role.VIEWER)
    assert sessions.resolve_session(db, raw) is None


# --- Passwords ---------------------------------------------------------------


@pytest.mark.parametrize(
    "password", ["short", "alllowercase123", "NoDigitsOrSymbols", "12345678901234"]
)
def test_weak_passwords_are_rejected(password):
    with pytest.raises(PasswordError):
        hash_password(password)


def test_password_round_trip():
    digest = hash_password("Str0ng-Passphrase!")
    assert digest != "Str0ng-Passphrase!"
    assert verify_password("Str0ng-Passphrase!", digest)
    assert not verify_password("wrong", digest)


def test_verify_against_a_malformed_hash_fails_closed():
    assert verify_password("anything", "not-a-bcrypt-hash") is False


# --- Input handling ----------------------------------------------------------


def test_clean_text_strips_control_characters_and_collapses_blank_lines():
    assert clean_text("a\x00b") == "ab"
    assert clean_text("one\n\n\n\n\ntwo") == "one\n\ntwo"
    assert clean_line("a\nb") == "a b"
    assert len(clean_text("x" * 500, max_length=100)) == 100


def test_normalize_question_clusters_arabic_spelling_variants():
    assert normalize_question("هل صحيح أن السدود ستُفتح؟") == normalize_question(
        "هل صحيح ان السدود ستفتح ؟"
    )
    assert normalize_question("Are the roads open?") != normalize_question(
        "Are the schools open?"
    )


@pytest.mark.parametrize(
    "url", ["javascript:alert(1)", "data:text/html,<script>", "file:///etc/passwd", ""]
)
def test_dangerous_urls_are_rejected(url):
    assert safe_url(url) is None


def test_https_urls_are_accepted():
    assert safe_url("https://example.gov/notice") == "https://example.gov/notice"


# --- Uploads -----------------------------------------------------------------


def test_upload_rejects_a_disguised_executable():
    with pytest.raises(UploadError):
        validate("payload.pdf.exe", "application/pdf", b"MZ\x90\x00")


def test_upload_rejects_content_that_does_not_match_its_extension():
    with pytest.raises(UploadError, match="does not match"):
        validate("notes.pdf", "application/pdf", b"this is not a pdf")


def test_upload_rejects_oversized_files():
    from app.config import get_settings

    oversized = b"%PDF-" + b"0" * (get_settings().max_upload_mb * 1024 * 1024 + 10)
    with pytest.raises(UploadError, match="limit"):
        validate("big.pdf", "application/pdf", oversized)


def test_upload_accepts_a_well_formed_pdf_and_text_file():
    assert validate("doc.pdf", "application/pdf", b"%PDF-1.7\nbody") == ".pdf"
    assert validate("notes.txt", "text/plain", "نص عربي".encode("utf-8")) == ".txt"
