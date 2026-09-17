"""OpenAPI-first route contracts without persistence or business behavior."""

from datetime import date
from typing import Annotated, Never
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, status

from kkaeddak.api.dependencies import IdempotencyKey, session_headers
from kkaeddak.core.errors import AppError
from kkaeddak.schemas.ai import ExplanationCreate, ExplanationResponse
from kkaeddak.schemas.common import UtcDatetime
from kkaeddak.schemas.health import HealthResponse
from kkaeddak.schemas.history import HistorySummaryResponse
from kkaeddak.schemas.preparation import (
    PreparationSuggestionCreate,
    PreparationSuggestionsResponse,
    PreparationTaskResponse,
    PreparationTaskUpdate,
)
from kkaeddak.schemas.profile import ProfileResponse, ProfileUpdate
from kkaeddak.schemas.routine import RoutineProfileResponse, RoutineProfileUpdate
from kkaeddak.schemas.schedule import (
    ScheduleEventsBatchCreate,
    ScheduleEventsBatchResponse,
    ScheduleEventsResponse,
)
from kkaeddak.schemas.session import (
    CurrentSessionResponse,
    DemoSessionCreate,
    DemoSessionResponse,
)
from kkaeddak.schemas.wake import (
    WakeOutcomeCreate,
    WakePlanCreate,
    WakePlanDecisionResponse,
    WakePlanDecisionUpdate,
    WakePlanDetail,
    WakePlanResponse,
)

router = APIRouter()
session_dependency = Depends(session_headers)


def contract_only() -> Never:
    """Prevent contract routes from pretending to implement later phases."""
    raise AppError(
        status_code=501,
        code="NOT_IMPLEMENTED",
        message="This API contract is not implemented yet.",
    )


@router.post(
    "/demo-sessions",
    response_model=DemoSessionResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["session"],
    summary="Create a seeded anonymous demo session",
)
async def create_demo_session(payload: DemoSessionCreate) -> Never:
    contract_only()


@router.get(
    "/me",
    response_model=CurrentSessionResponse,
    dependencies=[session_dependency],
    tags=["session"],
    summary="Get the current session",
)
async def get_current_session() -> Never:
    contract_only()


@router.get(
    "/profile",
    response_model=ProfileResponse,
    dependencies=[session_dependency],
    tags=["profile"],
    summary="Get profile settings",
)
async def get_profile() -> Never:
    contract_only()


@router.put(
    "/profile",
    response_model=ProfileResponse,
    dependencies=[session_dependency],
    tags=["profile"],
    summary="Replace profile settings",
)
async def replace_profile(payload: ProfileUpdate) -> Never:
    contract_only()


@router.get(
    "/routines",
    response_model=RoutineProfileResponse,
    dependencies=[session_dependency],
    tags=["routine"],
    summary="Get the morning routine profile",
)
async def get_routines() -> Never:
    contract_only()


@router.put(
    "/routines",
    response_model=RoutineProfileResponse,
    dependencies=[session_dependency],
    tags=["routine"],
    summary="Replace the morning routine profile",
)
async def replace_routines(payload: RoutineProfileUpdate) -> Never:
    contract_only()


@router.post(
    "/schedule-events:batch",
    response_model=ScheduleEventsBatchResponse,
    dependencies=[session_dependency],
    tags=["schedule"],
    summary="Store a batch of normalized schedule events",
)
async def create_schedule_events(payload: ScheduleEventsBatchCreate) -> Never:
    contract_only()


@router.get(
    "/schedule-events",
    response_model=ScheduleEventsResponse,
    dependencies=[session_dependency],
    tags=["schedule"],
    summary="List normalized schedule events",
)
async def list_schedule_events(
    from_at: Annotated[UtcDatetime, Query(alias="from")],
    to_at: Annotated[UtcDatetime, Query(alias="to")],
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Never:
    contract_only()


@router.post(
    "/preparation-suggestions",
    response_model=PreparationSuggestionsResponse,
    dependencies=[session_dependency],
    tags=["preparation"],
    summary="Suggest tasks that can be completed the night before",
)
async def create_preparation_suggestions(payload: PreparationSuggestionCreate) -> Never:
    contract_only()


@router.patch(
    "/preparation-tasks/{task_id}",
    response_model=PreparationTaskResponse,
    dependencies=[session_dependency],
    tags=["preparation"],
    summary="Update a preparation task status",
)
async def update_preparation_task(
    task_id: Annotated[UUID, Path()], payload: PreparationTaskUpdate
) -> Never:
    contract_only()


@router.post(
    "/wake-plans",
    response_model=WakePlanResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[session_dependency],
    tags=["wake-plan"],
    summary="Synchronize a locally generated wake plan",
)
async def create_wake_plan(payload: WakePlanCreate, idempotency_key: IdempotencyKey) -> Never:
    contract_only()


@router.get(
    "/wake-plans/{localDate}",
    response_model=WakePlanDetail,
    dependencies=[session_dependency],
    tags=["wake-plan"],
    summary="Get the latest wake plan for a local date",
)
async def get_wake_plan(
    local_date: Annotated[date, Path(alias="localDate")],
) -> Never:
    contract_only()


@router.patch(
    "/wake-plans/{plan_id}/decision",
    response_model=WakePlanDecisionResponse,
    dependencies=[session_dependency],
    tags=["wake-plan"],
    summary="Record a wake plan decision",
)
async def update_wake_plan_decision(
    plan_id: Annotated[UUID, Path()], payload: WakePlanDecisionUpdate
) -> Never:
    contract_only()


@router.post(
    "/wake-outcomes",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=None,
    dependencies=[session_dependency],
    tags=["wake-outcome"],
    summary="Store an opted-in aggregate wake outcome",
)
async def create_wake_outcome(payload: WakeOutcomeCreate, idempotency_key: IdempotencyKey) -> Never:
    contract_only()


@router.get(
    "/history/summary",
    response_model=HistorySummaryResponse,
    dependencies=[session_dependency],
    tags=["history"],
    summary="Get aggregate wake outcome history",
)
async def get_history_summary(
    from_date: Annotated[date, Query(alias="from")],
    to_date: Annotated[date, Query(alias="to")],
) -> Never:
    contract_only()


@router.post(
    "/ai/explanations",
    response_model=ExplanationResponse,
    dependencies=[session_dependency],
    tags=["ai"],
    summary="Explain a plan using privacy-limited reason codes",
)
async def create_explanation(payload: ExplanationCreate) -> Never:
    contract_only()


@router.get(
    "/health",
    response_model=HealthResponse,
    tags=["operations"],
    summary="Check API, database, and migration health",
)
async def get_health() -> Never:
    contract_only()
