"""User profile contracts."""

from pydantic import Field

from kkaeddak.domain.enums import AutomationMode
from kkaeddak.schemas.common import APIModel, Locale, TimezoneName, UtcDatetime


class ProfileUpdate(APIModel):
    timezone: TimezoneName
    locale: Locale
    automation_mode: AutomationMode
    allow_important_event_detection: bool
    allow_aggregate_outcome_sync: bool
    revision: int = Field(ge=0)


class ProfileResponse(ProfileUpdate):
    revision: int = Field(ge=1)
    updated_at: UtcDatetime
