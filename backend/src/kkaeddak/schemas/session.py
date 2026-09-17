"""Demo session and current-session contracts."""

from typing import Literal
from uuid import UUID

from pydantic import Field

from kkaeddak.schemas.common import APIModel, Locale, TimezoneName, UtcDatetime


class DemoSessionCreate(APIModel):
    timezone: TimezoneName
    locale: Locale
    scenario_id: str = Field(min_length=1, max_length=64, examples=["exam-morning"])


class DemoSessionResponse(APIModel):
    session_id: UUID
    expires_at: UtcDatetime
    seeded: bool


class CurrentSessionResponse(APIModel):
    session_id: UUID
    session_type: Literal["DEMO", "ACCOUNT"]
    timezone: TimezoneName
    locale: Locale
    expires_at: UtcDatetime | None = None
