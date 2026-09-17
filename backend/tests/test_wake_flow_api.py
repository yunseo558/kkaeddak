"""Integration tests for preparation, wake plan, and aggregate outcome APIs."""

from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from kkaeddak.core.config import Settings
from kkaeddak.db.base import Base
from kkaeddak.db.session import create_database_engine
from kkaeddak.main import create_app


@pytest.fixture
async def api_client(tmp_path: Path) -> AsyncIterator[AsyncClient]:
    database_path = tmp_path / "wake-flow.sqlite3"
    settings = Settings(
        environment="test",
        database_url=f"sqlite+aiosqlite:///{database_path}",
        _env_file=None,
    )
    engine = create_database_engine(settings)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    await engine.dispose()

    app = create_app(settings)
    async with (
        app.router.lifespan_context(app),
        AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client,
    ):
        yield client


async def _create_demo(client: AsyncClient, scenario_id: str = "exam-morning") -> str:
    response = await client.post(
        "/api/v1/demo-sessions",
        json={
            "timezone": "Asia/Seoul",
            "locale": "ko-KR",
            "scenarioId": scenario_id,
        },
    )
    assert response.status_code == 201
    return response.json()["sessionId"]


def _headers(session_id: str, idempotency_key: str | None = None) -> dict[str, str]:
    headers = {"X-Demo-Session": session_id}
    if idempotency_key is not None:
        headers["Idempotency-Key"] = idempotency_key
    return headers


def _wake_plan_payload(
    *,
    local_date: str = "2026-09-20",
    protocol_level: int = 2,
) -> dict[str, object]:
    return {
        "localDate": local_date,
        "timezone": "Asia/Seoul",
        "deadlineAt": "2026-09-19T23:50:00Z",
        "firstAlarmAt": "2026-09-19T23:25:00Z",
        "finalAlarmAt": "2026-09-19T23:35:00Z",
        "importance": "IMPORTANT",
        "protocolLevel": protocol_level,
        "steps": [
            {"order": 1, "offsetMin": 0, "channel": "WATCH_HAPTIC"},
            {"order": 2, "offsetMin": 8, "channel": "PHONE_SOUND"},
        ],
        "reasonCodes": ["SHORTER_SLEEP_THAN_BASELINE"],
        "requiresApproval": True,
        "modelVersion": "local-wake-0.1",
    }


async def _create_plan(
    client: AsyncClient,
    session_id: str,
    *,
    key: str = "wake-plan-key-1",
    local_date: str = "2026-09-20",
) -> dict[str, object]:
    response = await client.post(
        "/api/v1/wake-plans",
        headers=_headers(session_id, key),
        json=_wake_plan_payload(local_date=local_date),
    )
    assert response.status_code == 201
    return response.json()


@pytest.mark.anyio
async def test_preparation_suggestions_and_revision_update(api_client: AsyncClient) -> None:
    session_id = await _create_demo(api_client)
    headers = _headers(session_id)
    now = datetime.now(UTC)
    schedules = await api_client.get(
        "/api/v1/schedule-events",
        headers=headers,
        params={
            "from": now.isoformat(),
            "to": (now + timedelta(days=2)).isoformat(),
        },
    )
    event_id = schedules.json()["items"][0]["id"]
    payload = {
        "eventId": event_id,
        "availableRoutineTasks": [
            {"code": "PACK_BAG", "minutes": 10, "movableToNight": True},
            {"code": "BREAKFAST", "minutes": 15, "movableToNight": False},
            {"code": "PACK_BAG", "minutes": 12, "movableToNight": True},
            {"code": "SHOWER", "minutes": 15, "movableToNight": True},
        ],
        "maxSuggestions": 2,
    }

    suggested = await api_client.post(
        "/api/v1/preparation-suggestions",
        headers=headers,
        json=payload,
    )
    repeated = await api_client.post(
        "/api/v1/preparation-suggestions",
        headers=headers,
        json=payload,
    )
    task_id = suggested.json()["suggestions"][0]["id"]
    updated = await api_client.patch(
        f"/api/v1/preparation-tasks/{task_id}",
        headers=headers,
        json={"status": "COMPLETED", "revision": 1},
    )
    conflict = await api_client.patch(
        f"/api/v1/preparation-tasks/{task_id}",
        headers=headers,
        json={"status": "SKIPPED", "revision": 1},
    )

    assert suggested.status_code == repeated.status_code == 200
    assert [item["code"] for item in suggested.json()["suggestions"]] == [
        "PACK_BAG",
        "SHOWER",
    ]
    assert suggested.json()["totalPotentialMinutes"] == 25
    assert [item["id"] for item in repeated.json()["suggestions"]] == [
        item["id"] for item in suggested.json()["suggestions"]
    ]
    assert updated.status_code == 200
    assert updated.json()["status"] == "COMPLETED"
    assert updated.json()["revision"] == 2
    assert conflict.status_code == 409
    assert conflict.json()["error"]["details"] == {"currentRevision": 2}


@pytest.mark.anyio
async def test_preparation_resources_are_scoped_to_session(api_client: AsyncClient) -> None:
    first_session = await _create_demo(api_client)
    second_session = await _create_demo(api_client)
    now = datetime.now(UTC)
    schedules = await api_client.get(
        "/api/v1/schedule-events",
        headers=_headers(first_session),
        params={
            "from": now.isoformat(),
            "to": (now + timedelta(days=2)).isoformat(),
        },
    )
    event_id = schedules.json()["items"][0]["id"]
    hidden_event = await api_client.post(
        "/api/v1/preparation-suggestions",
        headers=_headers(second_session),
        json={"eventId": event_id, "availableRoutineTasks": [], "maxSuggestions": 3},
    )

    assert hidden_event.status_code == 404
    assert hidden_event.json()["error"]["code"] == "SCHEDULE_EVENT_NOT_FOUND"


@pytest.mark.anyio
async def test_wake_plan_is_idempotent_and_records_decisions(api_client: AsyncClient) -> None:
    session_id = await _create_demo(api_client, scenario_id="empty")
    headers = _headers(session_id, "wake-plan-key-1")
    payload = _wake_plan_payload()

    created = await api_client.post("/api/v1/wake-plans", headers=headers, json=payload)
    replayed = await api_client.post("/api/v1/wake-plans", headers=headers, json=payload)
    conflict_payload = _wake_plan_payload(protocol_level=3)
    idempotency_conflict = await api_client.post(
        "/api/v1/wake-plans",
        headers=headers,
        json=conflict_payload,
    )
    loaded = await api_client.get("/api/v1/wake-plans/2026-09-20", headers=_headers(session_id))
    plan_id = created.json()["id"]
    edited = await api_client.patch(
        f"/api/v1/wake-plans/{plan_id}/decision",
        headers=_headers(session_id),
        json={
            "decision": "EDIT",
            "revision": 1,
            "changes": {"firstAlarmAt": "2026-09-19T23:20:00Z"},
        },
    )
    revision_conflict = await api_client.patch(
        f"/api/v1/wake-plans/{plan_id}/decision",
        headers=_headers(session_id),
        json={"decision": "APPROVE", "revision": 1},
    )
    invalid_edit = await api_client.patch(
        f"/api/v1/wake-plans/{plan_id}/decision",
        headers=_headers(session_id),
        json={
            "decision": "EDIT",
            "revision": 2,
            "changes": {"firstAlarmAt": "2026-09-19T23:40:00Z"},
        },
    )
    approved = await api_client.patch(
        f"/api/v1/wake-plans/{plan_id}/decision",
        headers=_headers(session_id),
        json={"decision": "APPROVE", "revision": 2},
    )
    newest = await _create_plan(api_client, session_id, key="wake-plan-key-newest")
    latest = await api_client.get(
        "/api/v1/wake-plans/2026-09-20",
        headers=_headers(session_id),
    )

    assert created.status_code == replayed.status_code == 201
    assert created.json() == replayed.json()
    assert created.json()["status"] == "PROPOSED"
    assert idempotency_conflict.status_code == 409
    assert idempotency_conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert loaded.status_code == 200
    assert loaded.json()["steps"][1] == {
        "order": 2,
        "offsetMin": 8,
        "channel": "PHONE_SOUND",
    }
    assert edited.json() == {"status": "EDITED", "revision": 2}
    assert revision_conflict.status_code == 409
    assert revision_conflict.json()["error"]["details"] == {"currentRevision": 2}
    assert invalid_edit.status_code == 400
    assert invalid_edit.json()["error"]["code"] == "INVALID_PLAN_UPDATE"
    assert approved.json() == {"status": "APPROVED", "revision": 3}
    assert latest.json()["id"] == newest["id"]


@pytest.mark.anyio
async def test_wake_outcome_requires_opt_in_and_builds_history(api_client: AsyncClient) -> None:
    session_id = await _create_demo(api_client, scenario_id="empty")
    plan = await _create_plan(api_client, session_id)
    outcome = {
        "planId": plan["id"],
        "outcome": "CONFIRMED_ON_TIME",
        "confirmedAt": "2026-09-19T23:31:00Z",
        "alarmStepsUsed": 1,
        "userCorrection": False,
        "consentVersion": "outcome-sync-1",
    }
    denied = await api_client.post(
        "/api/v1/wake-outcomes",
        headers=_headers(session_id, "outcome-key-1"),
        json=outcome,
    )
    opted_in = await api_client.put(
        "/api/v1/profile",
        headers=_headers(session_id),
        json={
            "timezone": "Asia/Seoul",
            "locale": "ko-KR",
            "automationMode": "RECOMMEND_ONLY",
            "allowImportantEventDetection": True,
            "allowAggregateOutcomeSync": True,
            "revision": 1,
        },
    )
    accepted = await api_client.post(
        "/api/v1/wake-outcomes",
        headers=_headers(session_id, "outcome-key-1"),
        json=outcome,
    )
    replayed = await api_client.post(
        "/api/v1/wake-outcomes",
        headers=_headers(session_id, "outcome-key-2"),
        json=outcome,
    )
    changed_outcome = {**outcome, "outcome": "CONFIRMED_LATE"}
    duplicate_conflict = await api_client.post(
        "/api/v1/wake-outcomes",
        headers=_headers(session_id, "outcome-key-3"),
        json=changed_outcome,
    )

    second_plan = await _create_plan(
        api_client,
        session_id,
        key="wake-plan-key-2",
        local_date="2026-09-21",
    )
    unconfirmed = await api_client.post(
        "/api/v1/wake-outcomes",
        headers=_headers(session_id, "outcome-key-4"),
        json={
            "planId": second_plan["id"],
            "outcome": "UNCONFIRMED",
            "alarmStepsUsed": 2,
            "userCorrection": False,
            "consentVersion": "outcome-sync-1",
        },
    )
    history = await api_client.get(
        "/api/v1/history/summary",
        headers=_headers(session_id),
        params={"from": "2026-09-20", "to": "2026-09-21"},
    )
    invalid_range = await api_client.get(
        "/api/v1/history/summary",
        headers=_headers(session_id),
        params={"from": "2026-09-21", "to": "2026-09-20"},
    )

    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "CONSENT_REQUIRED"
    assert opted_in.status_code == 200
    assert accepted.status_code == replayed.status_code == unconfirmed.status_code == 202
    assert duplicate_conflict.status_code == 409
    assert duplicate_conflict.json()["error"]["code"] == "OUTCOME_ALREADY_RECORDED"
    assert history.status_code == 200
    assert history.json() == {
        "fromDate": "2026-09-20",
        "toDate": "2026-09-21",
        "totalSessions": 2,
        "onTimeSessions": 1,
        "lateSessions": 0,
        "unconfirmedSessions": 1,
        "averageAlarmSteps": 1.5,
    }
    assert invalid_range.status_code == 400
    assert invalid_range.json()["error"]["code"] == "INVALID_DATE_RANGE"


@pytest.mark.anyio
async def test_wake_plan_is_not_visible_to_another_session(api_client: AsyncClient) -> None:
    first_session = await _create_demo(api_client, scenario_id="empty")
    second_session = await _create_demo(api_client, scenario_id="empty")
    await _create_plan(api_client, first_session)

    hidden = await api_client.get(
        "/api/v1/wake-plans/2026-09-20",
        headers=_headers(second_session),
    )

    assert hidden.status_code == 404
    assert hidden.json()["error"]["code"] == "WAKE_PLAN_NOT_FOUND"


@pytest.mark.anyio
async def test_next_phase_ai_route_remains_unimplemented(api_client: AsyncClient) -> None:
    session_id = await _create_demo(api_client, scenario_id="empty")

    response = await api_client.post(
        "/api/v1/ai/explanations",
        headers=_headers(session_id),
        json={
            "reasonCodes": ["SHORTER_SLEEP_THAN_BASELINE"],
            "planChangeSummary": "첫 알람을 5분 앞당겼습니다.",
        },
    )

    assert response.status_code == 501
    assert response.json()["error"]["code"] == "NOT_IMPLEMENTED"
