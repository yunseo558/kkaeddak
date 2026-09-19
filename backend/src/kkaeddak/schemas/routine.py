"""Wake preference contracts."""

from pydantic import Field

from kkaeddak.schemas.common import APIModel, Code, UtcDatetime


class RoutineTask(APIModel):
    code: Code
    label: str = Field(min_length=1, max_length=80)
    minutes: int = Field(ge=1, le=180)
    movable_to_night: bool


class ScheduleTypeRule(APIModel):
    code: Code
    label: str = Field(min_length=1, max_length=30)
    wake_lead_min: int = Field(ge=15, le=300)
    is_fallback: bool = False


class AlarmPreferences(APIModel):
    preferred_first_channel: Code
    max_protocol_level: int = Field(ge=0, le=4)
    preferred_alarm_count: int = Field(default=2, ge=1, le=3)
    alarm_interval_min: int = Field(default=10, ge=3, le=30)
    keep_safety_alarm: bool = True
    automation_time: str = Field(default="21:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    schedule_types: list[ScheduleTypeRule] = Field(default_factory=list, max_length=20)


class RoutineProfileUpdate(APIModel):
    wake_buffer_min: int = Field(ge=0, le=180)
    routine_tasks: list[RoutineTask] = Field(max_length=30)
    alarm_preferences: AlarmPreferences
    revision: int = Field(ge=0)


class RoutineProfileResponse(RoutineProfileUpdate):
    revision: int = Field(ge=1)
    updated_at: UtcDatetime
