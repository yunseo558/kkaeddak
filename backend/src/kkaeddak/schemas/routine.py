"""Morning routine profile contracts."""

from pydantic import Field

from kkaeddak.schemas.common import APIModel, Code, UtcDatetime


class RoutineTask(APIModel):
    code: Code
    label: str = Field(min_length=1, max_length=80)
    minutes: int = Field(ge=1, le=180)
    movable_to_night: bool


class AlarmPreferences(APIModel):
    preferred_first_channel: Code
    max_protocol_level: int = Field(ge=0, le=4)


class RoutineProfileUpdate(APIModel):
    wake_buffer_min: int = Field(ge=0, le=180)
    routine_tasks: list[RoutineTask] = Field(max_length=30)
    alarm_preferences: AlarmPreferences
    revision: int = Field(ge=0)


class RoutineProfileResponse(RoutineProfileUpdate):
    revision: int = Field(ge=1)
    updated_at: UtcDatetime
