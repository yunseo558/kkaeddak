"""Normalized schedule event contracts."""

from uuid import UUID

from pydantic import Field, model_validator

from kkaeddak.domain.enums import Importance, LocationMode
from kkaeddak.schemas.common import APIModel, Code, Cursor, UtcDatetime


class ScheduleEventInput(APIModel):
    client_id: str = Field(min_length=1, max_length=100)
    starts_at: UtcDatetime
    ends_at: UtcDatetime
    category: Code
    importance: Importance
    location_mode: LocationMode
    display_title: str | None = Field(default=None, min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_time_range(self) -> "ScheduleEventInput":
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be later than starts_at")
        return self


class ScheduleEventResponse(ScheduleEventInput):
    id: UUID


class ScheduleEventsBatchCreate(APIModel):
    events: list[ScheduleEventInput] = Field(min_length=1, max_length=100)


class RejectedScheduleEvent(APIModel):
    client_id: str
    code: Code
    message: str


class ScheduleEventsBatchResponse(APIModel):
    accepted: int = Field(ge=0)
    rejected: list[RejectedScheduleEvent]


class ScheduleEventsResponse(APIModel):
    items: list[ScheduleEventResponse]
    next_cursor: Cursor | None = None
