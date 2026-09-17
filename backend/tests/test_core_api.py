"""Integration tests for phase-four session and normalized-data APIs."""

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
    database_path = tmp_path / "api.sqlite3"
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


async def _create_demo(
    client: AsyncClient,
    scenario_id: str = "exam-morning",
) -> dict[str, object]:
    response = await client.post(
        "/api/v1/demo-sessions",
        json={
            "timezone": "Asia/Seoul",
            "locale": "ko-KR",
            "scenarioId": scenario_id,
        },
    )
    assert response.status_code == 201
    return response.json()


def _headers(session_id: object) -> dict[str, str]:
    return {"X-Demo-Session": str(session_id)}


def _event(client_id: str, starts_at: datetime, title: str) -> dict[str, object]:
    return {
        "clientId": client_id,
        "startsAt": starts_at.isoformat().replace("+00:00", "Z"),
        "endsAt": (starts_at + timedelta(hours=1)).isoformat().replace("+00:00", "Z"),
        "category": "CLASS",
        "importance": "NORMAL",
        "locationMode": "ONSITE",
        "displayTitle": title,
    }


@pytest.mark.anyio
async def test_demo_session_seeds_profile_routine_and_exam(api_client: AsyncClient) -> None:
    created = await _create_demo(api_client)
    headers = _headers(created["sessionId"])

    expires_at = datetime.fromisoformat(str(created["expiresAt"]).replace("Z", "+00:00"))
    assert created["seeded"] is True
    assert timedelta(hours=23, minutes=59) < expires_at - datetime.now(UTC) <= timedelta(hours=24)

    current = await api_client.get("/api/v1/me", headers=headers)
    profile = await api_client.get("/api/v1/profile", headers=headers)
    routine = await api_client.get("/api/v1/routines", headers=headers)
    schedule = await api_client.get(
        "/api/v1/schedule-events",
        headers=headers,
        params={
            "from": datetime.now(UTC).isoformat(),
            "to": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
        },
    )

    assert current.status_code == profile.status_code == routine.status_code == 200
    assert current.json()["sessionType"] == "DEMO"
    assert profile.json()["automationMode"] == "RECOMMEND_ONLY"
    assert profile.json()["revision"] == 1
    assert routine.json()["wakeBufferMin"] == 15
    assert [item["code"] for item in routine.json()["routineTasks"]] == [
        "SHOWER",
        "BREAKFAST",
        "PACK_BAG",
    ]
    assert schedule.status_code == 200
    assert schedule.json()["items"][0]["category"] == "EXAM"


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("scenario_id", "category", "importance", "display_title"),
    [
        ("regular-class", "CLASS", "NORMAL", "오전 수업"),
        ("exam-morning", "EXAM", "IMPORTANT", "오전 시험"),
        ("tired-interview", "INTERVIEW", "IMPORTANT", "오전 면접"),
    ],
)
async def test_documented_demo_scenarios_seed_normalized_schedule(
    api_client: AsyncClient,
    scenario_id: str,
    category: str,
    importance: str,
    display_title: str,
) -> None:
    created = await _create_demo(api_client, scenario_id=scenario_id)
    schedule = await api_client.get(
        "/api/v1/schedule-events",
        headers=_headers(created["sessionId"]),
        params={
            "from": datetime.now(UTC).isoformat(),
            "to": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
        },
    )

    assert created["seeded"] is True
    assert schedule.status_code == 200
    item = schedule.json()["items"][0]
    assert item["clientId"] == f"seed-{scenario_id}"
    assert item["category"] == category
    assert item["importance"] == importance
    assert item["locationMode"] == "ONSITE"
    assert item["displayTitle"] == display_title


@pytest.mark.anyio
async def test_session_header_is_required_and_validated(api_client: AsyncClient) -> None:
    missing = await api_client.get("/api/v1/me")
    invalid = await api_client.get(
        "/api/v1/me",
        headers={"X-Demo-Session": "00000000-0000-0000-0000-000000000000"},
    )

    assert missing.status_code == invalid.status_code == 401
    assert missing.json()["error"]["code"] == "SESSION_INVALID"
    assert invalid.json()["error"]["code"] == "SESSION_INVALID"


@pytest.mark.anyio
async def test_profile_and_routine_updates_enforce_revision(api_client: AsyncClient) -> None:
    created = await _create_demo(api_client)
    headers = _headers(created["sessionId"])
    profile_payload = {
        "timezone": "Asia/Seoul",
        "locale": "ko-KR",
        "automationMode": "AUTO_ROUTINE_DAYS",
        "allowImportantEventDetection": True,
        "allowAggregateOutcomeSync": True,
        "revision": 1,
    }

    updated = await api_client.put("/api/v1/profile", headers=headers, json=profile_payload)
    conflict = await api_client.put("/api/v1/profile", headers=headers, json=profile_payload)
    routine = await api_client.put(
        "/api/v1/routines",
        headers=headers,
        json={
            "wakeBufferMin": 20,
            "routineTasks": [
                {
                    "code": "PACK_BAG",
                    "label": "가방 준비",
                    "minutes": 10,
                    "movableToNight": True,
                }
            ],
            "alarmPreferences": {
                "preferredFirstChannel": "PHONE_SOUND",
                "maxProtocolLevel": 3,
            },
            "revision": 1,
        },
    )

    assert updated.status_code == 200
    assert updated.json()["revision"] == 2
    assert updated.json()["automationMode"] == "AUTO_ROUTINE_DAYS"
    assert conflict.status_code == 409
    assert conflict.json()["error"]["details"] == {"currentRevision": 2}
    assert routine.status_code == 200
    assert routine.json()["revision"] == 2
    assert routine.json()["alarmPreferences"]["maxProtocolLevel"] == 3


@pytest.mark.anyio
async def test_schedule_batch_upserts_rejects_duplicates_and_paginates(
    api_client: AsyncClient,
) -> None:
    created = await _create_demo(api_client, scenario_id="empty")
    headers = _headers(created["sessionId"])
    starts_at = datetime(2026, 9, 20, 0, 0, tzinfo=UTC)
    first = _event("event-1", starts_at, "첫 일정")
    duplicate = _event("event-1", starts_at + timedelta(hours=1), "중복")
    second = _event("event-2", starts_at + timedelta(hours=2), "둘째 일정")

    stored = await api_client.post(
        "/api/v1/schedule-events:batch",
        headers=headers,
        json={"events": [first, duplicate, second]},
    )
    updated_first = _event("event-1", starts_at, "수정된 첫 일정")
    upserted = await api_client.post(
        "/api/v1/schedule-events:batch",
        headers=headers,
        json={"events": [updated_first]},
    )
    params = {
        "from": (starts_at - timedelta(hours=1)).isoformat(),
        "to": (starts_at + timedelta(days=1)).isoformat(),
        "limit": 1,
    }
    page_one = await api_client.get("/api/v1/schedule-events", headers=headers, params=params)
    page_two = await api_client.get(
        "/api/v1/schedule-events",
        headers=headers,
        params={**params, "cursor": page_one.json()["nextCursor"]},
    )

    assert created["seeded"] is False
    assert stored.status_code == 200
    assert stored.json() == {
        "accepted": 2,
        "rejected": [
            {
                "clientId": "event-1",
                "code": "DUPLICATE_CLIENT_ID",
                "message": "The clientId is duplicated in this batch.",
            }
        ],
    }
    assert upserted.json() == {"accepted": 1, "rejected": []}
    assert page_one.status_code == page_two.status_code == 200
    assert page_one.json()["items"][0]["displayTitle"] == "수정된 첫 일정"
    assert page_one.json()["nextCursor"] is not None
    assert page_two.json()["items"][0]["clientId"] == "event-2"
    assert page_two.json()["nextCursor"] is None


@pytest.mark.anyio
async def test_schedule_query_rejects_invalid_range_and_cursor(api_client: AsyncClient) -> None:
    created = await _create_demo(api_client, scenario_id="empty")
    headers = _headers(created["sessionId"])
    timestamp = datetime(2026, 9, 20, tzinfo=UTC).isoformat()

    invalid_range = await api_client.get(
        "/api/v1/schedule-events",
        headers=headers,
        params={"from": timestamp, "to": timestamp},
    )
    invalid_cursor = await api_client.get(
        "/api/v1/schedule-events",
        headers=headers,
        params={
            "from": timestamp,
            "to": datetime(2026, 9, 21, tzinfo=UTC).isoformat(),
            "cursor": "not-a-cursor",
        },
    )

    assert invalid_range.status_code == 400
    assert invalid_range.json()["error"]["code"] == "INVALID_TIME_RANGE"
    assert invalid_cursor.status_code == 400
    assert invalid_cursor.json()["error"]["code"] == "INVALID_CURSOR"
