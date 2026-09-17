"""Operational health response contract."""

from typing import Literal

from kkaeddak.schemas.common import APIModel


class HealthResponse(APIModel):
    status: Literal["ok", "degraded"]
    api: Literal["ok"]
    database: Literal["ok", "unavailable"]
    migration_version: str | None = None
