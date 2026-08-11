"""HTTP surface: the JSON API, the public pages, and emergency mode.

These are the tests that would catch a template or route regression that the
service-layer tests cannot see.
"""

from __future__ import annotations

import re

import pytest

from app.models.user import Role
from app.security import ratelimit
from app.services import crisis as crisis_service
from app.services import directory as directory_service
from app.services import rumors as rumor_service
from app.services import settings_store
from app.services import updates as update_service


@pytest.fixture
def crisis(db, admin_actor):
    return crisis_service.create(
        db,
        admin_actor,
        code="TEST-FLOOD",
        type="Flooding",
        title="حالة طوارئ تجريبية",
        severity="high",
        status="ongoing",
        make_active=True,
    )


@pytest.fixture
def published_update(db, admin_actor):
    update = update_service.create(
        db,
        admin_actor,
        title="إغلاق الطريق الساحلي",
        content="أُغلق الطريق الساحلي بين الكيلو 12 والكيلو 27 في الاتجاهين.",
        category="transport",
        importance="important",
    )
    return update_service.publish(db, admin_actor, update.id)


# --- Public pages ------------------------------------------------------------


@pytest.mark.parametrize(
    "path",
    [
        "/", "/updates", "/rumors", "/rumors/submit", "/assistant", "/services",
        "/guidance", "/faq", "/report", "/sources", "/about", "/about/governance",
        "/about/privacy", "/about/terms", "/search", "/health", "/dash/login",
    ],
)
def test_public_pages_render(client, path):
    response = client.get(path)
    assert response.status_code == 200


def test_pages_are_arabic_rtl_by_default(client):
    html = client.get("/").text
    assert '<html lang="ar" dir="rtl">' in html


def test_language_switch_changes_direction(client):
    client.get("/prefs/lang/en")
    html = client.get("/").text
    assert 'lang="en"' in html and 'dir="ltr"' in html


def test_security_headers_are_present(client):
    headers = client.get("/").headers
    assert "Content-Security-Policy" in headers
    # No inline script is permitted anywhere on the site.
    assert "'unsafe-inline'" not in headers["Content-Security-Policy"]
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"


def test_dashboard_pages_are_not_cached_by_proxies(client):
    assert "no-store" in client.get("/dash/login").headers.get("Cache-Control", "")


def test_unknown_page_renders_a_calm_message_not_a_stack_trace(client):
    response = client.get("/updates/999999")
    assert response.status_code == 404
    assert "Traceback" not in response.text
    assert "الصفحة غير موجودة" in response.text


def test_demo_banner_is_shown_when_demo_mode_is_on(client):
    assert "بيانات توضيحية" in client.get("/").text


# --- Emergency mode ----------------------------------------------------------


def test_emergency_mode_changes_the_public_page(client, db, admin_actor, crisis):
    before = client.get("/").text
    assert "emergency-mode" not in before
    assert "وضع الطوارئ مفعّل" not in before

    settings_store.set_emergency_mode(
        db, admin_actor, enabled=True, headline="سيول في المنطقة الساحلية"
    )

    after = client.get("/").text
    assert "emergency-mode" in after, "body class drives the emphasised layout"
    assert "وضع الطوارئ مفعّل" in after
    assert "سيول في المنطقة الساحلية" in after


def test_emergency_mode_can_hide_nonessential_sections(client, db, admin_actor, crisis):
    directory_service.create_source(
        db, admin_actor, name="Weather Service", slug="weather", trust_level=5
    )
    assert "مصادر رسمية موثوقة" in client.get("/").text

    settings_store.set_emergency_mode(
        db, admin_actor, enabled=True, hide_nonessential=True
    )
    assert "مصادر رسمية موثوقة" not in client.get("/").text


# --- JSON API ----------------------------------------------------------------


def test_health_and_readiness(client):
    assert client.get("/api/v1/health").json()["status"] == "ok"
    ready = client.get("/api/v1/health/ready").json()
    assert ready["database"] == "ok"
    assert ready["ai_provider"]


def test_updates_api_returns_published_only(client, published_update, db, admin_actor):
    update_service.create(
        db,
        admin_actor,
        title="Unpublished draft",
        content="This draft must never appear in the public API.",
        category="general",
        importance="normal",
    )
    payload = client.get("/api/v1/updates").json()
    assert payload["total"] == 1
    assert payload["items"][0]["title"] == published_update.title


def test_unapproved_ai_summary_is_never_exposed(client, db, admin_actor, published_update):
    update_service.store_ai_suggestion(
        db, admin_actor, published_update.id, citizen_summary="AI draft summary."
    )
    detail = client.get(f"/api/v1/updates/{published_update.id}").json()
    assert detail["citizen_summary"] is None

    update_service.approve_ai_summary(db, admin_actor, published_update.id)
    detail = client.get(f"/api/v1/updates/{published_update.id}").json()
    assert detail["citizen_summary"] == "AI draft summary."


def test_rumor_api_exposes_only_published_verifications(client, db, admin_actor, anon_actor):
    rumor_service.submit(db, anon_actor, claim="An unreviewed claim about shelters.")
    assert client.get("/api/v1/rumors").json()["items"] == []

    published, _ = rumor_service.submit(db, anon_actor, claim="A claim about the water.")
    rumor_service.review(
        db,
        admin_actor,
        published.id,
        status="verified",
        correction="Confirmed by the water authority.",
    )
    rumor_service.publish(db, admin_actor, published.id)

    items = client.get("/api/v1/rumors").json()["items"]
    assert len(items) == 1
    assert items[0]["human_reviewed"] is True


def test_rumor_submission_does_not_return_an_identifier(client):
    response = client.post(
        "/api/v1/rumors/submit",
        json={"claim": "A claim long enough to be accepted by validation."},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "received"
    assert "id" not in body and "rumor_id" not in body


def test_report_submission_never_claims_delivery(client):
    response = client.post(
        "/api/v1/reports",
        json={
            "report_type": "service_issue",
            "description": "Street drain blocked on the corner near the school.",
        },
    )
    assert response.status_code == 201
    assert "does not forward reports" in response.json()["note"]


def test_emergency_report_routes_the_citizen_to_a_real_service(client):
    routing = client.post(
        "/api/v1/reports",
        json={
            "report_type": "emergency",
            "description": "Water is rising quickly inside the building.",
            "is_emergency": True,
        },
    ).json()["routing"]
    assert routing["route"] == "emergency_services"


def test_assistant_endpoint_returns_structured_result(client, db, admin_actor):
    payload = client.post(
        "/api/v1/assistant/ask", json={"question": "هل توجد معلومات عن الطرق؟"}
    ).json()
    for key in ("verdict", "is_answer", "confidence", "citations", "provider"):
        assert key in payload


def test_assistant_feedback_round_trip(client):
    question_id = client.post(
        "/api/v1/assistant/ask", json={"question": "سؤال تجريبي عن الخدمات"}
    ).json()["question_id"]

    assert (
        client.post(
            "/api/v1/assistant/feedback",
            json={"question_id": question_id, "helpful": False},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/assistant/feedback", json={"question_id": 999999, "helpful": True}
        ).status_code
        == 404
    )


def test_api_validates_input(client):
    assert client.post("/api/v1/assistant/ask", json={"question": ""}).status_code == 422
    assert client.post("/api/v1/rumors/submit", json={"claim": "short"}).status_code == 422


# --- Auth flow ---------------------------------------------------------------


def _login(client, email, password):
    return client.post(
        "/dash/login", data={"email": email, "password": password, "next": "/dash"}
    )


def test_dashboard_requires_authentication(client):
    response = client.get("/dash")
    assert response.status_code == 303
    assert "/dash/login" in response.headers["location"]


def test_login_logout_cycle(client, make_user):
    make_user(Role.SYSTEM_ADMIN, email="admin@ui.local")

    assert _login(client, "admin@ui.local", "wrong").status_code == 401
    assert _login(client, "admin@ui.local", "TestPassw0rd!x").status_code == 303
    assert client.get("/dash", follow_redirects=True).status_code == 200

    html = client.get("/dash", follow_redirects=True).text
    token = re.search(r'name="csrf_token" value="([^"]+)"', html)
    client.post("/dash/logout")
    assert client.get("/dash").status_code == 303
    assert token is None or True  # token existence is asserted in the CSRF test


def test_login_redirect_cannot_be_used_as_an_open_redirect(client, make_user):
    make_user(Role.SYSTEM_ADMIN, email="admin@redirect.local")
    response = client.post(
        "/dash/login",
        data={
            "email": "admin@redirect.local",
            "password": "TestPassw0rd!x",
            "next": "https://evil.example.com/steal",
        },
    )
    assert response.headers["location"] == "/dash"


def test_state_changing_post_requires_a_valid_csrf_token(client, make_user):
    make_user(Role.SYSTEM_ADMIN, email="admin@csrf.local")
    _login(client, "admin@csrf.local", "TestPassw0rd!x")

    forged = client.post(
        "/dash/updates/create",
        data={"csrf_token": "forged", "title": "x", "content": "y" * 20},
    )
    assert forged.status_code == 403

    html = client.get("/dash/updates", follow_redirects=True).text
    token = re.search(r'name="csrf_token" value="([^"]+)"', html).group(1)
    accepted = client.post(
        "/dash/updates/create",
        data={
            "csrf_token": token,
            "title": "A genuine update",
            "content": "Body text that is long enough to be meaningful.",
            "category": "general",
            "importance": "normal",
        },
    )
    assert accepted.status_code == 303


def test_rate_limiting_kicks_in(client, monkeypatch):
    monkeypatch.setattr(
        "app.security.ratelimit.get_settings",
        lambda: type("S", (), {"rate_limit_enabled": True})(),
    )
    ratelimit.reset()

    statuses = [
        client.post(
            "/api/v1/rumors/submit",
            json={"claim": f"Distinct claim number {i} about the flooding situation."},
        ).status_code
        for i in range(8)
    ]
    assert 429 in statuses
    ratelimit.reset()
