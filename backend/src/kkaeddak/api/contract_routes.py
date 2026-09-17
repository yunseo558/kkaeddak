"""OpenAPI-first route contracts without persistence or business behavior."""

from typing import Never

from fastapi import APIRouter, Depends

from kkaeddak.api.dependencies import session_headers
from kkaeddak.core.errors import AppError
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


@router.get(
    "/health",
    response_model=HealthResponse,
    tags=["operations"],
    summary="Check API, database, and migration health",
)
async def get_health() -> Never:
    contract_only()
