"""Preparation, wake-plan decision, and aggregate outcome routes."""

from datetime import UTC, date, datetime
from statistics import fmean
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Query, Request, status

from kkaeddak.api.dependencies import CurrentSession, DatabaseSession, IdempotencyKey
from kkaeddak.core.errors import AppError
from kkaeddak.db.models import PreparationTask, WakeOutcomeSummary, WakePlan, WakePlanStep
from kkaeddak.db.repositories import (
    PreparationTaskRepository,
    ScheduleEventRepository,
    UserProfileRepository,
    WakeOutcomeRepository,
    WakePlanRepository,
)
from kkaeddak.domain.enums import PlanDecision, PlanStatus, PrepStatus, WakeOutcome
from kkaeddak.schemas.history import HistorySummaryResponse
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
    if from_date > to_date:
        raise AppError(
            status_code=400,
            code="INVALID_DATE_RANGE",
            message="The 'from' date must not be later than 'to'.",
        )
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
