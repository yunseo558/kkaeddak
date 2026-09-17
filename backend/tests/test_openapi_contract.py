"""Tests that freeze the documented HTTP API surface."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from kkaeddak.main import app

BACKEND_ROOT = Path(__file__).resolve().parents[1]

EXPECTED_OPERATIONS = {
    "/api/v1/demo-sessions": {"post"},
    "/api/v1/me": {"get"},
    "/api/v1/profile": {"get", "put"},
    "/api/v1/routines": {"get", "put"},
    "/api/v1/schedule-events:batch": {"post"},
    "/api/v1/schedule-events": {"get"},
    "/api/v1/preparation-suggestions": {"post"},
    "/api/v1/preparation-tasks/{task_id}": {"patch"},
    "/api/v1/wake-plans": {"post"},
    "/api/v1/wake-plans/{localDate}": {"get"},
    "/api/v1/wake-plans/{plan_id}/decision": {"patch"},
    "/api/v1/wake-outcomes": {"post"},
    "/api/v1/history/summary": {"get"},
    "/api/v1/ai/explanations": {"post"},
    "/api/v1/health": {"get"},
}


def test_openapi_paths_match_the_documented_api_list() -> None:
    schema = app.openapi()

    assert schema["openapi"] == "3.1.0"
    assert set(schema["paths"]) == set(EXPECTED_OPERATIONS)
    for path, methods in EXPECTED_OPERATIONS.items():
        assert set(schema["paths"][path]) == methods


def test_openapi_uses_standard_errors_and_required_idempotency_key() -> None:
    operation = app.openapi()["paths"]["/api/v1/wake-plans"]["post"]

    assert set(operation["responses"]) >= {
        "201",
        "400",
        "401",
        "403",
        "404",
        "409",
        "422",
        "429",
        "500",
        "503",
    }
    idempotency_parameter = next(
        parameter for parameter in operation["parameters"] if parameter["name"] == "Idempotency-Key"
    )
    assert idempotency_parameter["in"] == "header"
    assert idempotency_parameter["required"] is True
    assert (
        operation["responses"]["409"]["content"]["application/json"]["schema"]["$ref"]
        == "#/components/schemas/ErrorResponse"
    )


def test_contract_route_is_explicitly_not_implemented() -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 501
    assert response.json()["error"] == {
        "code": "NOT_IMPLEMENTED",
        "message": "This API contract is not implemented yet.",
        "requestId": response.headers["X-Request-Id"],
    }


def test_openapi_snapshot_is_current() -> None:
    expected = json.loads((BACKEND_ROOT / "openapi.json").read_text(encoding="utf-8"))

    assert app.openapi() == expected
