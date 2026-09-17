"""Tests for the shared error response contract."""

from fastapi import FastAPI, Query
from fastapi.testclient import TestClient

from kkaeddak.core.config import Settings
from kkaeddak.core.errors import AppError
from kkaeddak.main import create_app


def _test_app() -> FastAPI:
    app = create_app(Settings(environment="test", _env_file=None))

    @app.get("/expected-error")
    async def expected_error() -> None:
        raise AppError(
            status_code=409,
            code="REVISION_CONFLICT",
            message="The resource changed after it was loaded.",
            details={"currentRevision": 4},
        )

    @app.get("/validated")
    async def validated(limit: int = Query(ge=1, le=100)) -> dict[str, int]:
        return {"limit": limit}

    @app.get("/unexpected-error")
    async def unexpected_error() -> None:
        raise RuntimeError("private failure detail")

    return app


def test_app_error_uses_standard_envelope() -> None:
    with TestClient(_test_app()) as client:
        response = client.get("/expected-error")

    assert response.status_code == 409
    assert response.json() == {
        "error": {
            "code": "REVISION_CONFLICT",
            "message": "The resource changed after it was loaded.",
            "requestId": response.headers["X-Request-Id"],
            "details": {"currentRevision": 4},
        }
    }


def test_validation_error_does_not_return_raw_input() -> None:
    with TestClient(_test_app()) as client:
        response = client.get("/validated", params={"limit": "secret-invalid-value"})

    body = response.json()
    assert response.status_code == 400
    assert body["error"]["code"] == "INVALID_REQUEST"
    assert body["error"]["requestId"] == response.headers["X-Request-Id"]
    assert "secret-invalid-value" not in response.text
    assert body["error"]["details"][0]["location"] == ["query", "limit"]


def test_missing_route_uses_standard_envelope() -> None:
    with TestClient(_test_app()) as client:
        response = client.get("/missing")

    assert response.status_code == 404
    assert response.json()["error"] == {
        "code": "RESOURCE_NOT_FOUND",
        "message": "The requested resource was not found.",
        "requestId": response.headers["X-Request-Id"],
    }


def test_unhandled_error_hides_internal_details() -> None:
    with TestClient(_test_app(), raise_server_exceptions=False) as client:
        response = client.get("/unexpected-error")

    assert response.status_code == 500
    assert response.json()["error"] == {
        "code": "INTERNAL_SERVER_ERROR",
        "message": "An unexpected error occurred.",
        "requestId": response.headers["X-Request-Id"],
    }
    assert "private failure detail" not in response.text
