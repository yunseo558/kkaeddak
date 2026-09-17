"""Tests for request ID generation and propagation."""

import re

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from kkaeddak.core.config import Settings
from kkaeddak.main import create_app


def _test_app() -> FastAPI:
    app = create_app(Settings(environment="test", _env_file=None))

    @app.get("/request-id")
    async def request_id(request: Request) -> dict[str, str]:
        return {"requestId": request.state.request_id}

    return app


def test_request_id_is_generated() -> None:
    with TestClient(_test_app()) as client:
        response = client.get("/request-id")

    request_id = response.headers["X-Request-Id"]
    assert re.fullmatch(r"req_[0-9a-f]{32}", request_id)
    assert response.json() == {"requestId": request_id}


def test_safe_request_id_is_preserved() -> None:
    with TestClient(_test_app()) as client:
        response = client.get("/request-id", headers={"X-Request-Id": "req_client-123"})

    assert response.headers["X-Request-Id"] == "req_client-123"
    assert response.json() == {"requestId": "req_client-123"}


def test_unsafe_request_id_is_replaced() -> None:
    with TestClient(_test_app()) as client:
        response = client.get("/request-id", headers={"X-Request-Id": "invalid value"})

    request_id = response.headers["X-Request-Id"]
    assert request_id != "invalid value"
    assert response.json() == {"requestId": request_id}
