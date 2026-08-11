"""Test fixtures.

The environment is configured *before* anything from ``app`` is imported, so
the application builds its engine against a throwaway database file rather than
the developer's. Tests then exercise the real wiring — same engine, same
session factory, same routers — instead of a parallel test-only assembly.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

_TMP = Path(tempfile.mkdtemp(prefix="peace-tests-"))

os.environ.update(
    {
        "APP_ENV": "test",
        "DEBUG": "false",
        "DATABASE_URL": f"sqlite:///{_TMP / 'test.db'}",
        "SECRET_KEY": "test-secret-key-not-used-anywhere-real-000000",
        "IP_HASH_SALT": "test-ip-salt-000000",
        "DEMO_MODE": "true",
        "COOKIE_SECURE": "false",
        # Force the offline provider: the suite must be deterministic and must
        # never make a network call, whatever is in the developer's shell.
        "ANTHROPIC_API_KEY": "",
        "EMBEDDING_PROVIDER": "hashing",
        "UPLOAD_DIR": str(_TMP / "uploads"),
        "RATE_LIMIT_ENABLED": "false",
    }
)

from app.db import Base, engine, session_scope  # noqa: E402
from app.models import User  # noqa: E402
from app.security.passwords import hash_password  # noqa: E402
from app.services.context import Actor  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _schema():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _clean_tables(_schema):
    """Truncate between tests so each one starts from a known state."""
    yield
    with engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            connection.exec_driver_sql(f'DELETE FROM "{table.name}"')


@pytest.fixture
def db():
    with session_scope() as session:
        yield session


def _make_user(session, *, email: str, role: str, name: str = "Test User") -> User:
    user = User(
        name=name,
        email=email,
        password_hash=hash_password("TestPassw0rd!x"),
        role=role,
        status="active",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@pytest.fixture
def make_user(db):
    def factory(role: str, email: str | None = None) -> User:
        return _make_user(db, email=email or f"{role}@test.local", role=role)

    return factory


@pytest.fixture
def admin(make_user):
    return make_user("system_admin")


@pytest.fixture
def admin_actor(admin):
    return Actor.from_user(admin)


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app, follow_redirects=False)


@pytest.fixture
def anon_actor():
    return Actor.anonymous(ip_hash="test-ip-hash")
