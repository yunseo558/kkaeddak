"""Privacy-limited server AI routes with deterministic fallback behavior."""

from fastapi import APIRouter, Request

from kkaeddak.api.dependencies import CurrentSession, DatabaseSession
from kkaeddak.schemas.ai import (
    ExplanationCreate,
    ExplanationResponse,
    PersonalizedWakePlanCreate,
    PersonalizedWakePlanResponse,
    ScheduleClassificationCreate,
    ScheduleClassificationResponse,
)
from kkaeddak.services.ai import (
    AiProvider,
    AiService,
    ExplanationAiRequest,
    PersonalizedWakePlanAiRequest,
    ScheduleCategoryCandidate,
    ScheduleClassificationAiRequest,
)

router = APIRouter()


@router.post(
    "/ai/explanations",
    response_model=ExplanationResponse,
    tags=["ai"],
    summary="Explain a plan using privacy-limited reason codes",
)
async def create_explanation(
    payload: ExplanationCreate,
    current: CurrentSession,
    database: DatabaseSession,
    request: Request,
) -> ExplanationResponse:
    provider: AiProvider | None = request.app.state.ai_provider
    explanation, source = await AiService(database, provider).explain(
        ExplanationAiRequest(
            reason_codes=payload.reason_codes,
            plan_change_summary=payload.plan_change_summary,
        )
    )
    return ExplanationResponse(explanation=explanation, source=source)


@router.post(
    "/ai/schedule-classifications",
    response_model=ScheduleClassificationResponse,
    tags=["ai"],
    summary="Classify a schedule title into one of the user's categories",
)
async def classify_schedule(
    payload: ScheduleClassificationCreate,
    current: CurrentSession,
    database: DatabaseSession,
    request: Request,
) -> ScheduleClassificationResponse:
    provider: AiProvider | None = request.app.state.ai_provider
    result, source = await AiService(database, provider).classify_schedule(
        ScheduleClassificationAiRequest(
            title=payload.title,
            categories=[
                ScheduleCategoryCandidate(
                    code=candidate.code,
                    label=candidate.label,
                    is_fallback=candidate.is_fallback,
                )
                for candidate in payload.categories
            ],
        )
    )
    return ScheduleClassificationResponse(
        category_code=result.category_code,
        confidence=result.confidence,
        source=source,
    )


@router.post(
    "/ai/wake-plan-recommendations",
    response_model=PersonalizedWakePlanResponse,
    tags=["ai"],
    summary="Personalize fatigue and alarm timing from aggregate behavior signals",
)
async def personalize_wake_plan(
    payload: PersonalizedWakePlanCreate,
    current: CurrentSession,
    database: DatabaseSession,
    request: Request,
) -> PersonalizedWakePlanResponse:
    provider: AiProvider | None = request.app.state.ai_provider
    result, source = await AiService(database, provider).personalize_wake_plan(
        PersonalizedWakePlanAiRequest.model_validate(payload.model_dump())
    )
    return PersonalizedWakePlanResponse(**result.model_dump(), source=source)
