"""Operational routes."""

from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from kkaeddak.schemas.health import HealthResponse

router = APIRouter()
EXPECTED_MIGRATION_HEAD = "0001"


@router.get(
    "/health",
    response_model=HealthResponse,
    tags=["operations"],
    summary="Check API, database, and migration health",
)
async def get_health(request: Request) -> HealthResponse | JSONResponse:
    engine = request.app.state.database_engine
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
            try:
                migration_version = await connection.scalar(
                    text("SELECT version_num FROM alembic_version LIMIT 1")
                )
            except SQLAlchemyError:
                return _degraded_response(
                    HealthResponse(
                        status="degraded",
                        api="ok",
                        database="ok",
                        migration_version=None,
                    )
                )
    except SQLAlchemyError:
        return _degraded_response(
            HealthResponse(
                status="degraded",
                api="ok",
                database="unavailable",
                migration_version=None,
            )
        )

    response = HealthResponse(
        status="ok" if migration_version == EXPECTED_MIGRATION_HEAD else "degraded",
        api="ok",
        database="ok",
        migration_version=str(migration_version),
    )
    if response.status == "degraded":
        return _degraded_response(response)
    return response


def _degraded_response(response: HealthResponse) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content=response.model_dump(by_alias=True, mode="json"),
    )
