"""Application configuration.

Every value is sourced from the environment (or a local ``.env`` file).
No secret is ever hard-coded, and no secret is exposed to the frontend:
templates receive only the fields listed in ``public_settings()``.
"""

from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore", case_sensitive=False
    )

    # --- Core ---
    app_env: str = "development"
    debug: bool = True
    secret_key: str = ""
    ip_hash_salt: str = ""

    # --- Database ---
    database_url: str = "sqlite:///./peace_platform.db"

    # --- Server ---
    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: str = ""

    # --- Security ---
    session_idle_minutes: int = 60
    session_absolute_hours: int = 12
    cookie_secure: bool = False
    login_max_attempts: int = 5
    login_lockout_minutes: int = 15
    rate_limit_enabled: bool = True

    # --- AI ---
    anthropic_api_key: str = ""
    llm_model: str = "claude-opus-5"
    llm_effort: str = "medium"
    llm_max_tokens: int = 4096
    llm_timeout_seconds: int = 60

    embedding_provider: str = "hashing"
    embedding_dim: int = 512
    voyage_api_key: str = ""
    voyage_model: str = "voyage-3"

    # --- Uploads ---
    upload_dir: str = "./var/uploads"
    max_upload_mb: int = 25

    # --- Demo ---
    demo_mode: bool = True

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def upload_path(self) -> Path:
        path = Path(self.upload_dir)
        if not path.is_absolute():
            path = BASE_DIR / path
        return path

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def llm_configured(self) -> bool:
        return bool(self.anthropic_api_key.strip())

    def public_settings(self) -> dict:
        """The only configuration ever handed to a template or the browser."""
        return {"demo_mode": self.demo_mode, "app_env": self.app_env}


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if not settings.secret_key:
        if settings.is_production:
            raise RuntimeError(
                "SECRET_KEY must be set in production. Generate one with: "
                'python3 -c "import secrets;print(secrets.token_urlsafe(48))"'
            )
        # Development convenience only: an ephemeral key means sessions do not
        # survive a restart, which is the safe failure mode.
        settings.secret_key = secrets.token_urlsafe(48)
    if not settings.ip_hash_salt:
        if settings.is_production:
            raise RuntimeError("IP_HASH_SALT must be set in production.")
        settings.ip_hash_salt = secrets.token_urlsafe(32)
    if settings.is_production and not settings.cookie_secure:
        raise RuntimeError("COOKIE_SECURE must be true in production (HTTPS only).")
    return settings
