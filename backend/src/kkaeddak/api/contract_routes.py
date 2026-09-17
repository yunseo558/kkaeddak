"""OpenAPI-first route contracts without persistence or business behavior."""

from typing import Never

from fastapi import APIRouter, Depends

from kkaeddak.api.dependencies import session_headers
from kkaeddak.core.errors import AppError
from kkaeddak.schemas.ai import ExplanationCreate, ExplanationResponse
from kkaeddak.schemas.health import HealthResponse

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
