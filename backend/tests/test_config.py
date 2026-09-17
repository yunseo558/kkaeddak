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
