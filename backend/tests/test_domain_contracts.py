"""Tests for domain vocabulary and strict API schemas."""

from datetime import UTC, date, datetime
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from pydantic import ValidationError

from kkaeddak.domain.enums import (
    AutomationMode,
    Importance,
    LocationMode,
    PlanDecision,
    PlanStatus,
    PrepStatus,
    WakeOutcome,
    WakeState,
)
from kkaeddak.schemas.profile import ProfileUpdate
from kkaeddak.schemas.schedule import ScheduleEventInput
from kkaeddak.schemas.session import DemoSessionCreate
from kkaeddak.schemas.wake import (
    AlarmStep,
    WakeOutcomeCreate,
    WakePlanCreate,
    WakePlanDecisionChanges,
    WakePlanDecisionUpdate,
)


def test_documented_enum_values_are_fixed() -> None:
    assert set(AutomationMode) == {
        AutomationMode.RECOMMEND_ONLY,
        AutomationMode.AUTO_ROUTINE_DAYS,
        AutomationMode.AUTO_EXCEPT_IMPORTANT,
    }
    assert set(Importance) == {Importance.NORMAL, Importance.IMPORTANT, Importance.CRITICAL}
    assert set(LocationMode) == {
        LocationMode.REMOTE,
        LocationMode.ONSITE,
        LocationMode.UNKNOWN,
    }
    assert len(PlanStatus) == 8
    assert len(PrepStatus) == 4
    assert len(WakeOutcome) == 4
    assert len(WakeState) == 7


def test_api_models_use_camel_case_and_reject_unknown_fields() -> None:
    profile = ProfileUpdate.model_validate(
        {
            "timezone": "Asia/Seoul",
            "locale": "ko-KR",
            "automationMode": "RECOMMEND_ONLY",
            "allowImportantEventDetection": True,
            "allowAggregateOutcomeSync": False,
            "revision": 3,
        }
    )

    assert profile.model_dump(by_alias=True)["automationMode"] == "RECOMMEND_ONLY"
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        DemoSessionCreate.model_validate(
            {
                "timezone": "Asia/Seoul",
                "locale": "ko-KR",
                "scenarioId": "exam-morning",
                "sleepStages": [],
            }
        )


def test_timezone_and_utc_are_validated() -> None:
    with pytest.raises(ValidationError, match="valid IANA timezone"):
        DemoSessionCreate(timezone="Mars/Olympus", locale="ko-KR", scenario_id="exam")

    with pytest.raises(ValidationError, match="must use UTC"):
        ScheduleEventInput(
            client_id="evt-1",
            starts_at=datetime(2026, 9, 18, 9, tzinfo=ZoneInfo("Asia/Seoul")),
            ends_at=datetime(2026, 9, 18, 10, tzinfo=ZoneInfo("Asia/Seoul")),
            category="EXAM",
            importance=Importance.IMPORTANT,
            location_mode=LocationMode.ONSITE,
        )

    with pytest.raises(ValidationError, match="must include a timezone offset"):
        ScheduleEventInput(
            client_id="evt-1",
            starts_at=datetime(2026, 9, 18, 9),
            ends_at=datetime(2026, 9, 18, 10),
            category="EXAM",
            importance=Importance.IMPORTANT,
            location_mode=LocationMode.ONSITE,
        )


def test_schedule_event_end_must_follow_start() -> None:
    instant = datetime(2026, 9, 18, 0, tzinfo=UTC)
    with pytest.raises(ValidationError, match="ends_at must be later"):
        ScheduleEventInput(
            client_id="evt-1",
            starts_at=instant,
            ends_at=instant,
            category="EXAM",
            importance=Importance.IMPORTANT,
            location_mode=LocationMode.ONSITE,
        )


def _wake_plan(**overrides: object) -> WakePlanCreate:
    values: dict[str, object] = {
        "local_date": date(2026, 9, 18),
        "timezone": "Asia/Seoul",
        "deadline_at": datetime(2026, 9, 17, 22, 50, tzinfo=UTC),
        "first_alarm_at": datetime(2026, 9, 17, 22, 25, tzinfo=UTC),
        "final_alarm_at": datetime(2026, 9, 17, 22, 35, tzinfo=UTC),
        "importance": Importance.IMPORTANT,
        "protocol_level": 2,
        "steps": [
            AlarmStep(order=1, offset_min=0, channel="WATCH_HAPTIC"),
            AlarmStep(order=2, offset_min=8, channel="PHONE_SOUND"),
        ],
        "reason_codes": ["SHORTER_SLEEP_THAN_BASELINE"],
        "requires_approval": True,
        "model_version": "local-wake-0.1",
    }
    values.update(overrides)
    return WakePlanCreate.model_validate(values)


def test_wake_plan_enforces_alarm_and_step_order() -> None:
    plan = _wake_plan()
    assert plan.protocol_level == 2

    with pytest.raises(ValidationError, match="step order must be sequential"):
        _wake_plan(steps=[AlarmStep(order=2, offset_min=0, channel="PHONE_SOUND")])

    with pytest.raises(ValidationError, match="final_alarm_at must not be later"):
        _wake_plan(final_alarm_at=datetime(2026, 9, 17, 23, 0, tzinfo=UTC))

    with pytest.raises(ValidationError, match="first_alarm_at must not be later"):
        _wake_plan(first_alarm_at=datetime(2026, 9, 17, 22, 40, tzinfo=UTC))

    with pytest.raises(ValidationError, match="step offsets must be nondecreasing"):
        _wake_plan(
            steps=[
                AlarmStep(order=1, offset_min=8, channel="WATCH_HAPTIC"),
                AlarmStep(order=2, offset_min=0, channel="PHONE_SOUND"),
            ]
        )


def test_wake_plan_edit_requires_changes() -> None:
    with pytest.raises(ValidationError, match="at least one alarm time"):
        WakePlanDecisionChanges()

    with pytest.raises(ValidationError, match="first_alarm_at must not be later"):
        WakePlanDecisionChanges(
            first_alarm_at=datetime(2026, 9, 17, 22, 40, tzinfo=UTC),
            final_alarm_at=datetime(2026, 9, 17, 22, 30, tzinfo=UTC),
        )

    with pytest.raises(ValidationError, match="changes are required"):
        WakePlanDecisionUpdate(decision=PlanDecision.EDIT, revision=1)

    with pytest.raises(ValidationError, match="changes are only allowed"):
        WakePlanDecisionUpdate(
            decision=PlanDecision.APPROVE,
            revision=1,
            changes=WakePlanDecisionChanges(
                first_alarm_at=datetime(2026, 9, 17, 22, 20, tzinfo=UTC)
            ),
        )

    update = WakePlanDecisionUpdate(
        decision=PlanDecision.EDIT,
        revision=1,
        changes=WakePlanDecisionChanges(first_alarm_at=datetime(2026, 9, 17, 22, 20, tzinfo=UTC)),
    )
    assert update.decision is PlanDecision.EDIT


def test_confirmed_outcome_requires_confirmation_time() -> None:
    with pytest.raises(ValidationError, match="confirmed_at is required"):
        WakeOutcomeCreate(
            plan_id=uuid4(),
            outcome=WakeOutcome.CONFIRMED_ON_TIME,
            alarm_steps_used=1,
            user_correction=False,
            consent_version="outcome-sync-1",
        )

    outcome = WakeOutcomeCreate(
        plan_id=uuid4(),
        outcome=WakeOutcome.UNCONFIRMED,
        alarm_steps_used=2,
        user_correction=False,
        consent_version="outcome-sync-1",
    )
    assert outcome.confirmed_at is None
