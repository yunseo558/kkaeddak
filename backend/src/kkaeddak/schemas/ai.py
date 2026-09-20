"""Server-side explanation contracts with privacy-limited inputs."""

from typing import Literal

from pydantic import Field

from kkaeddak.domain.enums import ExplanationSource, Importance
from kkaeddak.schemas.common import APIModel, Code


class ExplanationCreate(APIModel):
    reason_codes: list[Code] = Field(min_length=1, max_length=10)
    plan_change_summary: str = Field(min_length=1, max_length=300)


class ExplanationResponse(APIModel):
    explanation: str = Field(min_length=1, max_length=500)
    source: ExplanationSource


class ScheduleCategoryCandidate(APIModel):
    code: Code
    label: str = Field(min_length=1, max_length=30)
    is_fallback: bool = False


class ScheduleClassificationCreate(APIModel):
    title: str = Field(min_length=1, max_length=100)
    categories: list[ScheduleCategoryCandidate] = Field(min_length=1, max_length=20)


class ScheduleClassificationResponse(APIModel):
    category_code: Code
    confidence: float = Field(ge=0, le=1)
    source: ExplanationSource


class ScheduleClassificationBatchCreate(APIModel):
    titles: list[str] = Field(min_length=1, max_length=50)
    categories: list[ScheduleCategoryCandidate] = Field(min_length=1, max_length=20)


class ScheduleClassificationBatchItem(APIModel):
    title: str = Field(min_length=1, max_length=100)
    category_code: Code
    confidence: float = Field(ge=0, le=1)
    source: ExplanationSource


class ScheduleClassificationBatchResponse(APIModel):
    items: list[ScheduleClassificationBatchItem] = Field(min_length=1, max_length=50)


class PersonalizedWakePlanCreate(APIModel):
    category: Code
    importance: Importance
    event_hour: int = Field(ge=0, le=23)
    base_wake_lead_min: int = Field(ge=15, le=300)
    rest_minutes: int | None = Field(default=None, ge=0, le=960)
    usual_rest_minutes: int | None = Field(default=None, ge=180, le=720)
    activity_level: Literal["low", "moderate", "high"] | None = None
    condition_level: Literal["low", "normal", "high"] | None = None
    recent_on_time_count: int = Field(ge=0, le=14)
    recent_late_count: int = Field(ge=0, le=14)
    recent_missed_count: int = Field(ge=0, le=14)
    recent_average_alarm_steps: float = Field(ge=0, le=5)
    learning_days: int = Field(ge=0, le=365)
    preferred_alarm_count: int = Field(ge=1, le=5)
    preferred_interval_min: int = Field(ge=3, le=30)
    keep_safety_alarm: bool


class PersonalizedWakePlanResponse(APIModel):
    fatigue_score: int = Field(ge=0, le=100)
    fatigue_level: Literal["LOW", "MEDIUM", "HIGH"]
    alarm_offsets_min: list[int] = Field(min_length=1, max_length=4)
    reason_codes: list[Code] = Field(min_length=1, max_length=8)
    explanation: str = Field(min_length=1, max_length=500)
    confidence: float = Field(ge=0, le=1)
    requires_review: bool
    source: ExplanationSource
