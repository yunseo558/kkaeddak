"""Wake plan, decision, and outcome contracts."""

from datetime import date
from uuid import UUID

from pydantic import Field, model_validator

from kkaeddak.domain.enums import Importance, PlanDecision, PlanStatus, WakeOutcome
from kkaeddak.schemas.common import APIModel, Code, TimezoneName, UtcDatetime


class AlarmStep(APIModel):
    order: int = Field(ge=1, le=5)
    offset_min: int = Field(ge=0, le=240)
    channel: Code


class WakePlanCreate(APIModel):
    local_date: date
    timezone: TimezoneName
    deadline_at: UtcDatetime
    first_alarm_at: UtcDatetime
    final_alarm_at: UtcDatetime
    importance: Importance
    protocol_level: int = Field(ge=0, le=4)
    steps: list[AlarmStep] = Field(min_length=1, max_length=5)
    reason_codes: list[Code] = Field(max_length=10)
    requires_approval: bool
    model_version: str = Field(min_length=1, max_length=64)

    @model_validator(mode="after")
    def validate_plan(self) -> "WakePlanCreate":
        if self.first_alarm_at > self.final_alarm_at:
            raise ValueError("first_alarm_at must not be later than final_alarm_at")
        if self.final_alarm_at > self.deadline_at:
            raise ValueError("final_alarm_at must not be later than deadline_at")
        orders = [step.order for step in self.steps]
        if orders != list(range(1, len(orders) + 1)):
            raise ValueError("step order must be sequential and start at 1")
        offsets = [step.offset_min for step in self.steps]
        if offsets != sorted(offsets):
            raise ValueError("step offsets must be nondecreasing")
        return self


class WakePlanResponse(APIModel):
    id: UUID
    status: PlanStatus
    revision: int = Field(ge=1)


class WakePlanDetail(WakePlanCreate):
    id: UUID
    status: PlanStatus
    revision: int = Field(ge=1)


class WakePlanDecisionChanges(APIModel):
    first_alarm_at: UtcDatetime | None = None
    final_alarm_at: UtcDatetime | None = None

    @model_validator(mode="after")
    def require_change(self) -> "WakePlanDecisionChanges":
        if self.first_alarm_at is None and self.final_alarm_at is None:
            raise ValueError("at least one alarm time must be changed")
        if (
            self.first_alarm_at is not None
            and self.final_alarm_at is not None
            and self.first_alarm_at > self.final_alarm_at
        ):
            raise ValueError("first_alarm_at must not be later than final_alarm_at")
        return self


class WakePlanDecisionUpdate(APIModel):
    decision: PlanDecision
    revision: int = Field(ge=1)
    changes: WakePlanDecisionChanges | None = None

    @model_validator(mode="after")
    def validate_changes_for_decision(self) -> "WakePlanDecisionUpdate":
        if self.decision is PlanDecision.EDIT and self.changes is None:
            raise ValueError("changes are required when decision is EDIT")
        if self.decision is not PlanDecision.EDIT and self.changes is not None:
            raise ValueError("changes are only allowed when decision is EDIT")
        return self


class WakePlanDecisionResponse(APIModel):
    status: PlanStatus
    revision: int = Field(ge=1)


class WakeOutcomeCreate(APIModel):
    plan_id: UUID
    outcome: WakeOutcome
    confirmed_at: UtcDatetime | None = None
    alarm_steps_used: int = Field(ge=0, le=5)
    user_correction: bool
    consent_version: str = Field(min_length=1, max_length=64)

    @model_validator(mode="after")
    def validate_confirmation_time(self) -> "WakeOutcomeCreate":
        confirmed = {
            WakeOutcome.CONFIRMED_ON_TIME,
            WakeOutcome.CONFIRMED_LATE,
        }
        if self.outcome in confirmed and self.confirmed_at is None:
            raise ValueError("confirmed_at is required for a confirmed outcome")
        return self
