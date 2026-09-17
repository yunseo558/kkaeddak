"""Privacy-limited server AI routes with deterministic fallback behavior."""

from fastapi import APIRouter, Request

from kkaeddak.api.dependencies import CurrentSession, DatabaseSession
from kkaeddak.schemas.ai import ExplanationCreate, ExplanationResponse
from kkaeddak.services.ai import AiProvider, AiService, ExplanationAiRequest

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
