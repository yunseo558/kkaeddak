"""Preparation, wake-plan decision, and aggregate outcome routes."""

from datetime import UTC, date, datetime, timedelta
from statistics import fmean
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Query, Request, status

from kkaeddak.api.dependencies import CurrentSession, DatabaseSession, IdempotencyKey
from kkaeddak.core.errors import AppError
from kkaeddak.db.models import (
    PreparationTask,
    WakeAlarmEvent,
    WakeOutcomeSummary,
    WakePlan,
    WakePlanReport,
    WakePlanStep,
)
from kkaeddak.db.repositories import (
    PreparationTaskRepository,
    ScheduleEventRepository,
    UserProfileRepository,
    WakeAlarmEventRepository,
    WakeOutcomeRepository,
    WakePlanReportRepository,
    WakePlanRepository,
)
from kkaeddak.domain.enums import PlanDecision, PlanStatus, PrepStatus, WakeOutcome
from kkaeddak.schemas.history import (
    HistoryReportDetail,
    HistoryReportListItem,
    HistoryReportsResponse,
    HistorySummaryResponse,
    WakeAlarmEventCreate,
    WakeAlarmEventResponse,
    WakeAlarmTimelineStep,
    WakeLearningEffect,
    WakeOutcomeReport,
    WakePlanReportContext,
)
from kkaeddak.schemas.preparation import (
    PreparationSuggestion,
    PreparationSuggestionCreate,
    PreparationSuggestionsResponse,
    PreparationTaskResponse,
    PreparationTaskUpdate,
)
from kkaeddak.schemas.wake import (
    WakeOutcomeCreate,
    WakePlanCreate,
    WakePlanDecisionResponse,
    WakePlanDecisionUpdate,
    WakePlanDetail,
    WakePlanResponse,
)
from kkaeddak.services.ai import AiProvider, AiService, PreparationAiRequest, PreparationCandidate

router = APIRouter()


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _task_response(task: PreparationTask) -> PreparationTaskResponse:
    return PreparationTaskResponse(
        id=task.id,
        status=task.status,
        revision=task.revision,
        updated_at=_as_utc(task.updated_at),
    )


def _plan_response(plan: WakePlan) -> WakePlanResponse:
    return WakePlanResponse(id=plan.id, status=plan.status, revision=plan.revision)


def _plan_detail(plan: WakePlan) -> WakePlanDetail:
    return WakePlanDetail(
        id=plan.id,
        local_date=plan.local_date,
        timezone=plan.timezone,
        deadline_at=_as_utc(plan.deadline_at),
        first_alarm_at=_as_utc(plan.first_alarm_at),
        final_alarm_at=_as_utc(plan.final_alarm_at),
        importance=plan.importance,
        protocol_level=plan.protocol_level,
        steps=[
            {
                "order": step.step_order,
                "offset_min": step.offset_min,
                "channel": step.channel,
            }
            for step in plan.steps
        ],
        reason_codes=plan.reason_codes,
        requires_approval=plan.requires_approval,
        model_version=plan.model_version,
        status=plan.status,
        revision=plan.revision,
    )


def _alarm_event_response(event: WakeAlarmEvent) -> WakeAlarmEventResponse:
    return WakeAlarmEventResponse(
        id=event.id,
        step_order=event.step_order,
        event_type=event.event_type,
        occurred_at=_as_utc(event.occurred_at),
    )


def _stored_report_context(plan: WakePlan) -> WakePlanReportContext | None:
    if plan.report is None or plan.report.decision_context is None:
        return None
    return WakePlanReportContext.model_validate(plan.report.decision_context)


def _stored_learning_effect(plan: WakePlan) -> WakeLearningEffect | None:
    if plan.report is None or plan.report.learning_effect is None:
        return None
    return WakeLearningEffect.model_validate(plan.report.learning_effect)


def _history_detail(plan: WakePlan) -> HistoryReportDetail:
    events_by_step: dict[int, list[WakeAlarmEventResponse]] = {}
    for event in sorted(plan.alarm_events, key=lambda item: _as_utc(item.occurred_at)):
        events_by_step.setdefault(event.step_order, []).append(_alarm_event_response(event))

    timeline = [
        WakeAlarmTimelineStep(
            order=step.step_order,
            scheduled_at=_as_utc(plan.first_alarm_at) + timedelta(minutes=step.offset_min),
            channel=step.channel,
            events=events_by_step.get(step.step_order, []),
        )
        for step in sorted(plan.steps, key=lambda item: item.step_order)
    ]
    outcome = None
    if plan.outcome is not None:
        outcome = WakeOutcomeReport(
            outcome=plan.outcome.outcome,
            confirmed_at=(
                _as_utc(plan.outcome.confirmed_at)
                if plan.outcome.confirmed_at is not None
                else None
            ),
            alarm_steps_used=plan.outcome.alarm_steps_used,
            on_time=plan.outcome.on_time,
            user_correction=plan.outcome.user_correction,
        )
    return HistoryReportDetail(
        local_date=plan.local_date,
        plan=_plan_detail(plan),
        decision_context=_stored_report_context(plan),
        alarm_timeline=timeline,
        outcome=outcome,
        learning_effect=_stored_learning_effect(plan),
    )


def _validate_history_range(from_date: date, to_date: date) -> None:
    if from_date > to_date:
        raise AppError(
            status_code=400,
            code="INVALID_DATE_RANGE",
            message="The 'from' date must not be later than 'to'.",
        )


def _plan_matches_payload(plan: WakePlan, payload: WakePlanCreate) -> bool:
    stored_steps = [
        (step.step_order, step.offset_min, step.channel)
        for step in sorted(plan.steps, key=lambda item: item.step_order)
    ]
    requested_steps = [(step.order, step.offset_min, step.channel) for step in payload.steps]
    return (
        plan.local_date == payload.local_date
        and plan.timezone == payload.timezone
        and _as_utc(plan.deadline_at) == payload.deadline_at
        and _as_utc(plan.first_alarm_at) == payload.first_alarm_at
        and _as_utc(plan.final_alarm_at) == payload.final_alarm_at
        and plan.importance == payload.importance
        and plan.protocol_level == payload.protocol_level
        and stored_steps == requested_steps
        and plan.reason_codes == payload.reason_codes
        and plan.requires_approval == payload.requires_approval
        and plan.model_version == payload.model_version
    )


@router.post(
    "/preparation-suggestions",
    response_model=PreparationSuggestionsResponse,
    tags=["preparation"],
    summary="Suggest tasks that can be completed the night before",
)
async def create_preparation_suggestions(
    payload: PreparationSuggestionCreate,
    current: CurrentSession,
    database: DatabaseSession,
    request: Request,
) -> PreparationSuggestionsResponse:
    event = await ScheduleEventRepository(database).get(payload.event_id)
    if event is None or event.owner_id != current.owner_id:
        raise AppError(
            status_code=404,
            code="SCHEDULE_EVENT_NOT_FOUND",
            message="The schedule event was not found.",
        )

    candidates: list[PreparationCandidate] = []
    seen_codes: set[str] = set()
    for candidate in payload.available_routine_tasks:
        if not candidate.movable_to_night or candidate.code in seen_codes:
            continue
        seen_codes.add(candidate.code)
        candidates.append(PreparationCandidate(code=candidate.code, minutes=candidate.minutes))

    if not candidates:
        return PreparationSuggestionsResponse(suggestions=[], total_potential_minutes=0)

    provider: AiProvider | None = request.app.state.ai_provider
    choices, source = await AiService(database, provider).suggest_preparation(
        PreparationAiRequest(
            category=event.category,
            location_mode=event.location_mode,
            candidates=candidates,
            max_suggestions=payload.max_suggestions,
        )
    )
    candidate_minutes = {candidate.code: candidate.minutes for candidate in candidates}
    repository = PreparationTaskRepository(database)
    suggestions: list[PreparationSuggestion] = []
    for choice in choices:
        task = await repository.get_by_event_and_code(event.id, choice.code)
        if task is None:
            task = await repository.add(
                PreparationTask(
                    event_id=event.id,
                    code=choice.code,
                    label=choice.label,
                    minutes_saved=candidate_minutes[choice.code],
                    status=PrepStatus.SUGGESTED,
                    source=source.value,
                    revision=1,
                )
            )
        else:
            task.label = choice.label
            task.minutes_saved = candidate_minutes[choice.code]
            task.source = source.value
        suggestions.append(
            PreparationSuggestion(
                id=task.id,
                code=task.code,
                label=task.label,
                minutes_saved=task.minutes_saved,
                source=task.source,
                status=task.status,
                revision=task.revision,
            )
        )

    await database.flush()
    return PreparationSuggestionsResponse(
        suggestions=suggestions,
        total_potential_minutes=sum(item.minutes_saved for item in suggestions),
    )


@router.patch(
    "/preparation-tasks/{task_id}",
    response_model=PreparationTaskResponse,
    tags=["preparation"],
    summary="Update a preparation task status",
)
async def update_preparation_task(
    task_id: Annotated[UUID, Path()],
    payload: PreparationTaskUpdate,
    current: CurrentSession,
    database: DatabaseSession,
) -> PreparationTaskResponse:
    task = await PreparationTaskRepository(database).get_for_owner(task_id, current.owner_id)
    if task is None:
        raise AppError(
            status_code=404,
            code="PREPARATION_TASK_NOT_FOUND",
            message="The preparation task was not found.",
        )
    if task.revision != payload.revision:
        raise AppError(
            status_code=409,
            code="REVISION_CONFLICT",
            message="The preparation task changed after it was loaded.",
            details={"currentRevision": task.revision},
        )

    task.status = payload.status
    task.revision += 1
    task.updated_at = datetime.now(UTC)
    await database.flush()
    return _task_response(task)


@router.post(
    "/wake-plans",
    response_model=WakePlanResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["wake-plan"],
    summary="Synchronize a locally generated wake plan",
)
async def create_wake_plan(
    payload: WakePlanCreate,
    idempotency_key: IdempotencyKey,
    current: CurrentSession,
    database: DatabaseSession,
) -> WakePlanResponse:
    repository = WakePlanRepository(database)
    existing = await repository.get_by_idempotency_key(current.owner_id, idempotency_key)
    if existing is not None:
        if not _plan_matches_payload(existing, payload):
            raise AppError(
                status_code=409,
                code="IDEMPOTENCY_CONFLICT",
                message="The Idempotency-Key was already used with a different request.",
            )
        return _plan_response(existing)

    latest = await repository.get_latest(current.owner_id, payload.local_date)
    plan = await repository.add(
        WakePlan(
            owner_id=current.owner_id,
            local_date=payload.local_date,
            timezone=payload.timezone,
            deadline_at=payload.deadline_at,
            first_alarm_at=payload.first_alarm_at,
            final_alarm_at=payload.final_alarm_at,
            importance=payload.importance,
            protocol_level=payload.protocol_level,
            status=PlanStatus.PROPOSED,
            revision=latest.revision + 1 if latest is not None else 1,
            idempotency_key=idempotency_key,
            reason_codes=payload.reason_codes,
            requires_approval=payload.requires_approval,
            model_version=payload.model_version,
            created_at=datetime.now(UTC),
            steps=[
                WakePlanStep(
                    step_order=step.order,
                    offset_min=step.offset_min,
                    channel=step.channel,
                )
                for step in payload.steps
            ],
        )
    )
    return _plan_response(plan)


@router.get(
    "/wake-plans/{localDate}",
    response_model=WakePlanDetail,
    tags=["wake-plan"],
    summary="Get the latest wake plan for a local date",
)
async def get_wake_plan(
    local_date: Annotated[date, Path(alias="localDate")],
    current: CurrentSession,
    database: DatabaseSession,
) -> WakePlanDetail:
    plan = await WakePlanRepository(database).get_latest(current.owner_id, local_date)
    if plan is None:
        raise AppError(
            status_code=404,
            code="WAKE_PLAN_NOT_FOUND",
            message="The wake plan was not found.",
        )
    return _plan_detail(plan)


@router.patch(
    "/wake-plans/{plan_id}/decision",
    response_model=WakePlanDecisionResponse,
    tags=["wake-plan"],
    summary="Record a wake plan decision",
)
async def update_wake_plan_decision(
    plan_id: Annotated[UUID, Path()],
    payload: WakePlanDecisionUpdate,
    current: CurrentSession,
    database: DatabaseSession,
) -> WakePlanDecisionResponse:
    plan = await WakePlanRepository(database).get_for_owner(plan_id, current.owner_id)
    if plan is None:
        raise AppError(
            status_code=404,
            code="WAKE_PLAN_NOT_FOUND",
            message="The wake plan was not found.",
        )
    if plan.revision != payload.revision:
        raise AppError(
            status_code=409,
            code="REVISION_CONFLICT",
            message="The wake plan changed after it was loaded.",
            details={"currentRevision": plan.revision},
        )

    if payload.decision is PlanDecision.EDIT:
        assert payload.changes is not None
        first_alarm_at = payload.changes.first_alarm_at or _as_utc(plan.first_alarm_at)
        final_alarm_at = payload.changes.final_alarm_at or _as_utc(plan.final_alarm_at)
        if first_alarm_at > final_alarm_at or final_alarm_at > _as_utc(plan.deadline_at):
            raise AppError(
                status_code=400,
                code="INVALID_PLAN_UPDATE",
                message="The edited alarm times violate the wake plan deadline.",
            )
        plan.first_alarm_at = first_alarm_at
        plan.final_alarm_at = final_alarm_at

    statuses = {
        PlanDecision.APPROVE: PlanStatus.APPROVED,
        PlanDecision.EDIT: PlanStatus.EDITED,
        PlanDecision.DECLINE: PlanStatus.DECLINED,
    }
    plan.status = statuses[payload.decision]
    plan.revision += 1
    plan.updated_at = datetime.now(UTC)
    await database.flush()
    return WakePlanDecisionResponse(status=plan.status, revision=plan.revision)


@router.put(
    "/wake-plans/{plan_id}/report-context",
    response_model=WakePlanReportContext,
    tags=["history"],
    summary="Store the privacy-limited decision context for a wake plan",
)
async def upsert_wake_plan_report_context(
    plan_id: Annotated[UUID, Path()],
    payload: WakePlanReportContext,
    current: CurrentSession,
    database: DatabaseSession,
) -> WakePlanReportContext:
    plan = await WakePlanRepository(database).get_for_owner(plan_id, current.owner_id)
    if plan is None:
        raise AppError(
            status_code=404,
            code="WAKE_PLAN_NOT_FOUND",
            message="The wake plan was not found.",
        )

    repository = WakePlanReportRepository(database)
    report = await repository.get_by_plan_id(plan.id)
    decision_context = payload.model_dump(mode="json", by_alias=True)
    if report is None:
        await repository.add(
            WakePlanReport(
                plan_id=plan.id,
                decision_context=decision_context,
                learning_effect=None,
            )
        )
    else:
        report.decision_context = decision_context
        report.updated_at = datetime.now(UTC)
        await database.flush()
    return payload


@router.put(
    "/wake-plans/{plan_id}/learning-effect",
    response_model=WakeLearningEffect,
    tags=["history"],
    summary="Store how a wake result changes the next recommendation",
)
async def upsert_wake_learning_effect(
    plan_id: Annotated[UUID, Path()],
    payload: WakeLearningEffect,
    current: CurrentSession,
    database: DatabaseSession,
) -> WakeLearningEffect:
    plan = await WakePlanRepository(database).get_for_owner(plan_id, current.owner_id)
    if plan is None:
        raise AppError(
            status_code=404,
            code="WAKE_PLAN_NOT_FOUND",
            message="The wake plan was not found.",
        )

    repository = WakePlanReportRepository(database)
    report = await repository.get_by_plan_id(plan.id)
    learning_effect = payload.model_dump(mode="json", by_alias=True)
    if report is None:
        await repository.add(
            WakePlanReport(
                plan_id=plan.id,
                decision_context=None,
                learning_effect=learning_effect,
            )
        )
    else:
        report.learning_effect = learning_effect
        report.updated_at = datetime.now(UTC)
        await database.flush()
    return payload


@router.post(
    "/wake-plans/{plan_id}/alarm-events",
    response_model=WakeAlarmEventResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["wake-plan"],
    summary="Record one idempotent alarm-step lifecycle event",
)
async def create_wake_alarm_event(
    plan_id: Annotated[UUID, Path()],
    payload: WakeAlarmEventCreate,
    current: CurrentSession,
    database: DatabaseSession,
) -> WakeAlarmEventResponse:
    plan = await WakePlanRepository(database).get_for_owner(plan_id, current.owner_id)
    if plan is None:
        raise AppError(
            status_code=404,
            code="WAKE_PLAN_NOT_FOUND",
            message="The wake plan was not found.",
        )
    if not any(step.step_order == payload.step_order for step in plan.steps):
        raise AppError(
            status_code=400,
            code="ALARM_STEP_NOT_FOUND",
            message="The alarm step does not belong to this wake plan.",
        )

    repository = WakeAlarmEventRepository(database)
    existing = await repository.get_by_natural_key(
        plan.id,
        payload.step_order,
        payload.event_type,
    )
    if existing is not None:
        if _as_utc(existing.occurred_at) != payload.occurred_at:
            raise AppError(
                status_code=409,
                code="ALARM_EVENT_CONFLICT",
                message="The alarm event was already recorded at another time.",
            )
        return _alarm_event_response(existing)

    event = await repository.add(
        WakeAlarmEvent(
            plan_id=plan.id,
            step_order=payload.step_order,
            event_type=payload.event_type,
            occurred_at=payload.occurred_at,
        )
    )
    return _alarm_event_response(event)


def _outcome_matches(existing: WakeOutcomeSummary, payload: WakeOutcomeCreate) -> bool:
    confirmed_at = _as_utc(existing.confirmed_at) if existing.confirmed_at is not None else None
    return (
        existing.outcome == payload.outcome
        and confirmed_at == payload.confirmed_at
        and existing.alarm_steps_used == payload.alarm_steps_used
        and existing.user_correction == payload.user_correction
        and existing.consent_version == payload.consent_version
    )


@router.post(
    "/wake-outcomes",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=None,
    tags=["wake-outcome"],
    summary="Store an opted-in aggregate wake outcome",
)
async def create_wake_outcome(
    payload: WakeOutcomeCreate,
    idempotency_key: IdempotencyKey,
    current: CurrentSession,
    database: DatabaseSession,
) -> None:
    profile = await UserProfileRepository(database).get_by_user_id(current.owner_id)
    if profile is None or not profile.allow_aggregate_outcome_sync:
        raise AppError(
            status_code=403,
            code="CONSENT_REQUIRED",
            message="Aggregate wake outcome sync requires explicit consent.",
        )

    plan = await WakePlanRepository(database).get_for_owner(payload.plan_id, current.owner_id)
    if plan is None:
        raise AppError(
            status_code=404,
            code="WAKE_PLAN_NOT_FOUND",
            message="The wake plan was not found.",
        )

    repository = WakeOutcomeRepository(database)
    existing = await repository.get_by_plan_id(plan.id)
    if existing is not None:
        if not _outcome_matches(existing, payload):
            raise AppError(
                status_code=409,
                code="OUTCOME_ALREADY_RECORDED",
                message="A different aggregate outcome is already recorded for this plan.",
            )
        return

    on_time = None
    if payload.outcome is WakeOutcome.CONFIRMED_ON_TIME:
        on_time = True
    elif payload.outcome is WakeOutcome.CONFIRMED_LATE:
        on_time = False
    await repository.add(
        WakeOutcomeSummary(
            plan_id=plan.id,
            confirmed_at=payload.confirmed_at,
            outcome=payload.outcome,
            alarm_steps_used=payload.alarm_steps_used,
            on_time=on_time,
            user_correction=payload.user_correction,
            consent_version=payload.consent_version,
        )
    )


@router.get(
    "/history/summary",
    response_model=HistorySummaryResponse,
    tags=["history"],
    summary="Get aggregate wake outcome history",
)
async def get_history_summary(
    from_date: Annotated[date, Query(alias="from")],
    to_date: Annotated[date, Query(alias="to")],
    current: CurrentSession,
    database: DatabaseSession,
) -> HistorySummaryResponse:
    _validate_history_range(from_date, to_date)
    outcomes = await WakeOutcomeRepository(database).list_between(
        current.owner_id,
        from_date,
        to_date,
    )
    on_time_sessions = sum(item.outcome is WakeOutcome.CONFIRMED_ON_TIME for item in outcomes)
    late_sessions = sum(item.outcome is WakeOutcome.CONFIRMED_LATE for item in outcomes)
    return HistorySummaryResponse(
        from_date=from_date,
        to_date=to_date,
        total_sessions=len(outcomes),
        on_time_sessions=on_time_sessions,
        late_sessions=late_sessions,
        unconfirmed_sessions=len(outcomes) - on_time_sessions - late_sessions,
        average_alarm_steps=(
            fmean(item.alarm_steps_used for item in outcomes) if outcomes else None
        ),
    )


@router.get(
    "/history/reports",
    response_model=HistoryReportsResponse,
    tags=["history"],
    summary="List the latest explainable wake report for each date",
)
async def list_history_reports(
    from_date: Annotated[date, Query(alias="from")],
    to_date: Annotated[date, Query(alias="to")],
    current: CurrentSession,
    database: DatabaseSession,
) -> HistoryReportsResponse:
    _validate_history_range(from_date, to_date)
    plans = await WakePlanRepository(database).list_latest_between(
        current.owner_id,
        from_date,
        to_date,
    )
    items: list[HistoryReportListItem] = []
    for plan in plans:
        context = _stored_report_context(plan)
        items.append(
            HistoryReportListItem(
                local_date=plan.local_date,
                plan_id=plan.id,
                status=plan.status,
                event_title=context.schedule.title if context is not None else None,
                first_alarm_at=_as_utc(plan.first_alarm_at),
                final_alarm_at=_as_utc(plan.final_alarm_at),
                alarm_count=len(plan.steps),
                outcome=plan.outcome.outcome if plan.outcome is not None else None,
                report_ready=context is not None,
            )
        )
    return HistoryReportsResponse(from_date=from_date, to_date=to_date, items=items)


@router.get(
    "/history/reports/{localDate}",
    response_model=HistoryReportDetail,
    tags=["history"],
    summary="Get the detailed decision, alarm timeline, outcome, and learning report",
)
async def get_history_report(
    local_date: Annotated[date, Path(alias="localDate")],
    current: CurrentSession,
    database: DatabaseSession,
) -> HistoryReportDetail:
    plan = await WakePlanRepository(database).get_latest(current.owner_id, local_date)
    if plan is None:
        raise AppError(
            status_code=404,
            code="HISTORY_REPORT_NOT_FOUND",
            message="The wake history report was not found.",
        )
    return _history_detail(plan)
