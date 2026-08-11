"""The rumor verification workflow — the platform's central governance rule.

    A rumor cannot become public without human approval.

These tests attack that rule from every direction available in code: skipping
review, forging a high-confidence AI verdict, publishing without a correction,
and reading unpublished rumors through the public query paths.
"""

from __future__ import annotations

import pytest

from app.models import RumorStatus
from app.models.user import Role
from app.services import rumors as rumor_service
from app.services.context import Actor


@pytest.fixture
def reviewer_actor(make_user):
    return Actor.from_user(make_user(Role.RUMOR_REVIEWER, email="reviewer@test.local"))


def _submit(db, anon_actor, claim="Bridges will be closed at midnight tonight."):
    rumor, is_new = rumor_service.submit(db, anon_actor, claim=claim)
    return rumor, is_new


def test_submission_is_never_public(db, anon_actor):
    rumor, is_new = _submit(db, anon_actor)
    assert is_new is True
    assert rumor.published is False
    assert rumor.status == RumorStatus.UNVERIFIED
    assert rumor_service.list_public(db) == []


def test_ai_analysis_cannot_publish_however_confident(db, anon_actor, reviewer_actor):
    """An AI verdict with confidence 1.0 still does not reach citizens."""
    rumor, _ = _submit(db, anon_actor)

    rumor_service.store_ai_analysis(
        db,
        reviewer_actor,
        rumor.id,
        classification="false",
        confidence=1.0,
        correction="Draft correction produced by the model.",
        rationale="The model is certain.",
        citations=[{"label": 1, "title": "Some source"}],
    )

    db.refresh(rumor)
    assert rumor.published is False
    assert rumor.status == RumorStatus.UNDER_REVIEW
    # The AI wrote only to ai_* columns.
    assert rumor.correction is None
    assert rumor.ai_correction is not None
    assert rumor_service.list_public(db) == []

    # And publishing still refuses, because no human recorded a verdict.
    with pytest.raises(ValueError):
        rumor_service.publish(db, reviewer_actor, rumor.id)


def test_publish_requires_a_concluded_verdict(db, anon_actor, reviewer_actor):
    rumor, _ = _submit(db, anon_actor)
    rumor_service.review(
        db,
        reviewer_actor,
        rumor.id,
        status=RumorStatus.UNDER_REVIEW,
        correction="Still checking with the authority.",
    )
    with pytest.raises(ValueError, match="concluded verdict"):
        rumor_service.publish(db, reviewer_actor, rumor.id)


def test_concluded_verdict_requires_correction_text(db, anon_actor, reviewer_actor):
    """The platform never says 'false' without saying what is true."""
    rumor, _ = _submit(db, anon_actor)
    with pytest.raises(ValueError, match="correction text"):
        rumor_service.review(
            db, reviewer_actor, rumor.id, status=RumorStatus.FALSE, correction=""
        )


def test_full_happy_path(db, anon_actor, reviewer_actor):
    rumor, _ = _submit(db, anon_actor)

    rumor_service.review(
        db,
        reviewer_actor,
        rumor.id,
        status=RumorStatus.FALSE,
        correction="No closure has been announced. The bridges remain open.",
        explanation="Confirmed against the roads authority bulletin.",
    )
    db.refresh(rumor)
    assert rumor.published is False, "review alone must not publish"
    assert rumor.reviewed_by is not None
    assert rumor.checked_at is not None

    rumor_service.publish(db, reviewer_actor, rumor.id)
    db.refresh(rumor)
    assert rumor.published is True
    assert rumor.published_at is not None
    assert [r.id for r in rumor_service.list_public(db)] == [rumor.id]
    assert rumor_service.get_public(db, rumor.id) is not None


def test_unpublish_removes_it_from_public_view(db, anon_actor, reviewer_actor):
    rumor, _ = _submit(db, anon_actor)
    rumor_service.review(
        db,
        reviewer_actor,
        rumor.id,
        status=RumorStatus.FALSE,
        correction="Not correct; the official position differs.",
    )
    rumor_service.publish(db, reviewer_actor, rumor.id)
    rumor_service.unpublish(db, reviewer_actor, rumor.id, reason="new information")

    assert rumor_service.list_public(db) == []
    assert rumor_service.get_public(db, rumor.id) is None


def test_duplicate_submissions_increment_spread_instead_of_creating_rows(
    db, anon_actor
):
    first, is_new = _submit(db, anon_actor, "هل صحيح أن السدود ستُفتح الليلة؟")
    assert is_new is True

    # Different spelling of the same claim: normalisation should match it.
    second, is_new_2 = _submit(db, anon_actor, "هل صحيح ان السدود ستفتح الليلة ؟")
    assert is_new_2 is False
    assert second.id == first.id
    assert second.report_count == 2
    assert second.spread_score > 0


def test_public_listing_never_includes_unreviewed_rumors(db, anon_actor, reviewer_actor):
    published, _ = _submit(db, anon_actor, "Claim one about the water supply.")
    rumor_service.review(
        db,
        reviewer_actor,
        published.id,
        status=RumorStatus.VERIFIED,
        correction="This is accurate according to the water authority.",
    )
    rumor_service.publish(db, reviewer_actor, published.id)

    for index in range(3):
        _submit(db, anon_actor, f"Unreviewed claim number {index} about the roads.")

    public_ids = {r.id for r in rumor_service.list_public(db, limit=100)}
    assert public_ids == {published.id}
    assert rumor_service.pending_review_count(db) == 3
