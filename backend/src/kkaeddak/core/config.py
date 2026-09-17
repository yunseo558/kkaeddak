"""Validated application configuration."""

from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["local", "test", "staging", "production"]
LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="KKAEDDAK_",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = Field(default="KKAEDDAK API", min_length=1, max_length=100)
    environment: Environment = "local"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"
    log_level: LogLevel = "INFO"
    database_url: str = "postgresql+asyncpg://kkaeddak:kkaeddak@localhost:5432/kkaeddak"
    database_echo: bool = False
    database_pool_size: int = Field(default=5, ge=1, le=20)

    @field_validator("app_name")
    @classmethod
    def validate_app_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("app_name must not be blank")
        return normalized

    @field_validator("api_v1_prefix")
    @classmethod
    def validate_api_v1_prefix(cls, value: str) -> str:
        if not value.startswith("/"):
            raise ValueError("api_v1_prefix must start with '/'")
        if value != "/" and value.endswith("/"):
            raise ValueError("api_v1_prefix must not end with '/'")
        return value

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        supported_prefixes = ("postgresql+asyncpg://", "sqlite+aiosqlite://")
        if not value.startswith(supported_prefixes):
            raise ValueError("database_url must use postgresql+asyncpg or sqlite+aiosqlite")
        return value

    @model_validator(mode="after")
    def validate_production_debug(self) -> Self:
        if self.environment == "production" and self.debug:
            raise ValueError("debug must be disabled in production")
        return self


@lru_cache
def get_settings() -> Settings:
    """Load and cache validated process configuration."""
    return Settings()
