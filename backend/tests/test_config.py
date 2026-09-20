"""Tests for validated environment configuration."""

import pytest
from pydantic import ValidationError

from kkaeddak.core.config import Settings


def test_settings_have_safe_defaults() -> None:
    settings = Settings(_env_file=None)

    assert settings.app_name == "KKAEDDAK API"
    assert settings.environment == "local"
    assert settings.debug is False
    assert settings.api_v1_prefix == "/api/v1"
    assert settings.log_level == "INFO"
    assert settings.cors_allowed_origins == []
    assert settings.openai_api_key is None
    assert settings.openai_model is None


@pytest.mark.parametrize("prefix", ["api/v1", "/api/v1/"])
def test_api_prefix_must_be_normalized(prefix: str) -> None:
    with pytest.raises(ValidationError):
        Settings(api_v1_prefix=prefix, _env_file=None)


def test_app_name_is_stripped() -> None:
    settings = Settings(app_name="  KKAEDDAK Test API  ", _env_file=None)

    assert settings.app_name == "KKAEDDAK Test API"


def test_production_rejects_debug_mode() -> None:
    with pytest.raises(ValidationError, match="debug must be disabled in production"):
        Settings(environment="production", debug=True, _env_file=None)


def test_environment_variables_use_project_prefix(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KKAEDDAK_ENVIRONMENT", "test")
    monkeypatch.setenv("KKAEDDAK_LOG_LEVEL", "WARNING")

    settings = Settings(_env_file=None)

    assert settings.environment == "test"
    assert settings.log_level == "WARNING"


def test_openai_settings_require_key_and_model_together() -> None:
    with pytest.raises(ValidationError, match="must be configured together"):
        Settings(openai_api_key="test-secret", _env_file=None)
    with pytest.raises(ValidationError, match="must be configured together"):
        Settings(openai_model="test-model", _env_file=None)

    settings = Settings(
        openai_api_key="test-secret",
        openai_model="test-model",
        _env_file=None,
    )
    assert settings.openai_api_key is not None
    assert settings.openai_api_key.get_secret_value() == "test-secret"
    assert "test-secret" not in repr(settings)


@pytest.mark.parametrize(
    ("database_url", "expected"),
    [
        (
            "postgres://user:pass@db.example/kkaeddak",
            "postgresql+asyncpg://user:pass@db.example/kkaeddak",
        ),
        (
            "postgresql://user:pass@db.example/kkaeddak",
            "postgresql+asyncpg://user:pass@db.example/kkaeddak",
        ),
    ],
)
def test_database_url_normalizes_managed_postgres_urls(
    database_url: str,
    expected: str,
) -> None:
    settings = Settings(database_url=database_url, _env_file=None)

    assert settings.database_url == expected


def test_database_url_rejects_unsupported_driver() -> None:
    with pytest.raises(ValidationError, match=r"postgresql\+asyncpg or sqlite\+aiosqlite"):
        Settings(database_url="mysql://localhost/kkaeddak", _env_file=None)


def test_cors_origins_are_explicit_normalized_origins() -> None:
    settings = Settings(
        cors_allowed_origins=["https://kkaeddak.vercel.app/", "https://kkaeddak.vercel.app"],
        _env_file=None,
    )

    assert settings.cors_allowed_origins == ["https://kkaeddak.vercel.app"]

    with pytest.raises(ValidationError, match="explicit http"):
        Settings(cors_allowed_origins=["*"], _env_file=None)


def test_production_requires_https_cors_origin() -> None:
    with pytest.raises(ValidationError, match="at least one explicit CORS origin"):
        Settings(environment="production", _env_file=None)

    with pytest.raises(ValidationError, match="must use https"):
        Settings(
            environment="production",
            cors_allowed_origins=["http://localhost:3000"],
            _env_file=None,
        )
