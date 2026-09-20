"""Aggregate and explainable wake-history contracts."""

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import Field

from kkaeddak.domain.enums import (
    AlarmEventType,
    ExplanationSource,
    PlanStatus,
    WakeOutcome,
)
from kkaeddak.schemas.common import APIModel, Code, UtcDatetime
from kkaeddak.schemas.wake import WakePlanDetail


class HistorySummaryResponse(APIModel):
    from_date: date
    to_date: date
    total_sessions: int = Field(ge=0)
    on_time_sessions: int = Field(ge=0)
    late_sessions: int = Field(ge=0)
    unconfirmed_sessions: int = Field(ge=0)
    average_alarm_steps: float | None = Field(default=None, ge=0, le=5)


class ReportScheduleSnapshot(APIModel):
    title: str = Field(min_length=1, max_length=100)
    starts_at: UtcDatetime
    category_code: Code
    category_label: str = Field(min_length=1, max_length=30)
    wake_lead_min: int = Field(ge=15, le=300)


class ReportHealthSummary(APIModel):
    """Aggregate-only health signals; raw HealthKit samples are never accepted."""

    rest_minutes: int | None = Field(default=None, ge=0, le=960)
    usual_rest_minutes: int | None = Field(default=None, ge=180, le=720)
    activity_level: Literal["low", "moderate", "high"] | None = None
    condition_level: Literal["low", "normal", "high"] | None = None


class ReportHistorySignals(APIModel):
    recent_on_time_count: int = Field(ge=0, le=14)
    recent_late_count: int = Field(ge=0, le=14)
    recent_missed_count: int = Field(ge=0, le=14)
    recent_average_alarm_steps: float = Field(ge=0, le=5)
    learning_days: int = Field(ge=0, le=365)
    recommended_advance_minutes: int = Field(ge=0, le=90)
    protocol_adjustment: int = Field(ge=0, le=4)


class ReportAlarmPreferences(APIModel):
    preferred_alarm_count: int = Field(ge=1, le=4)
    preferred_interval_min: int = Field(ge=3, le=30)
    keep_safety_alarm: bool


class ReportPersonalizationSnapshot(APIModel):
    fatigue_score: int = Field(ge=0, le=100)
    fatigue_level: Literal["LOW", "MEDIUM", "HIGH"]
    confidence: float = Field(ge=0, le=1)
    explanation: str = Field(min_length=1, max_length=500)
    source: ExplanationSource
    automatic: bool


class WakePlanReportContext(APIModel):
    schedule: ReportScheduleSnapshot
    health_summary: ReportHealthSummary | None = None
    history_signals: ReportHistorySignals
    alarm_preferences: ReportAlarmPreferences
    personalization: ReportPersonalizationSnapshot
    policy_version: str = Field(min_length=1, max_length=64)


class WakeLearningEffect(APIModel):
    previous_advance_minutes: int = Field(ge=0, le=90)
    next_advance_minutes: int = Field(ge=0, le=90)
    previous_protocol_adjustment: int = Field(ge=0, le=4)
    next_protocol_adjustment: int = Field(ge=0, le=4)
    recommendation: str = Field(min_length=1, max_length=500)
    reason_codes: list[Code] = Field(max_length=10)
    policy_version: str = Field(min_length=1, max_length=64)


class WakeAlarmEventCreate(APIModel):
    step_order: int = Field(ge=1, le=5)
    event_type: AlarmEventType
    occurred_at: UtcDatetime


class WakeAlarmEventResponse(WakeAlarmEventCreate):
    id: UUID


class WakeOutcomeReport(APIModel):
    outcome: WakeOutcome
    confirmed_at: UtcDatetime | None = None
    alarm_steps_used: int = Field(ge=0, le=5)
    on_time: bool | None = None
    user_correction: bool


class WakeAlarmTimelineStep(APIModel):
    order: int = Field(ge=1, le=5)
    scheduled_at: UtcDatetime
    channel: Code
    events: list[WakeAlarmEventResponse]


class HistoryReportListItem(APIModel):
    local_date: date
    plan_id: UUID
    status: PlanStatus
    event_title: str | None = None
    first_alarm_at: UtcDatetime
    final_alarm_at: UtcDatetime
    alarm_count: int = Field(ge=1, le=5)
    outcome: WakeOutcome | None = None
    report_ready: bool


class HistoryReportsResponse(APIModel):
    from_date: date
    to_date: date
    items: list[HistoryReportListItem]


class HistoryReportDetail(APIModel):
    local_date: date
    plan: WakePlanDetail
    decision_context: WakePlanReportContext | None = None
    alarm_timeline: list[WakeAlarmTimelineStep]
    outcome: WakeOutcomeReport | None = None
    learning_effect: WakeLearningEffect | None = None
