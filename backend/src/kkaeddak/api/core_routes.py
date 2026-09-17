"""Implemented session, profile, routine, and normalized schedule routes."""

import base64
import json
from datetime import UTC, datetime, time, timedelta
from typing import Annotated
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query, status

from kkaeddak.api.dependencies import CurrentSession, DatabaseSession
from kkaeddak.core.errors import AppError
from kkaeddak.db.models import DemoSession, RoutineProfile, ScheduleEvent, UserProfile
from kkaeddak.db.repositories import (
    DemoSessionRepository,
    RoutineProfileRepository,
    ScheduleEventRepository,
    UserProfileRepository,
)
from kkaeddak.domain.enums import AutomationMode, Importance, LocationMode
from kkaeddak.schemas.common import UtcDatetime
from kkaeddak.schemas.profile import ProfileResponse, ProfileUpdate
from kkaeddak.schemas.routine import RoutineProfileResponse, RoutineProfileUpdate
from kkaeddak.schemas.schedule import (
    RejectedScheduleEvent,
    ScheduleEventResponse,
    ScheduleEventsBatchCreate,
    ScheduleEventsBatchResponse,
    ScheduleEventsResponse,
)
from kkaeddak.schemas.session import (
    CurrentSessionResponse,
    DemoSessionCreate,
    DemoSessionResponse,
)

router = APIRouter()
DEMO_SESSION_LIFETIME = timedelta(hours=24)


def _as_utc(value: datetime) -> datetime:
    """Normalize database timestamps, including SQLite's naive values, to UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _profile_response(profile: UserProfile) -> ProfileResponse:
    return ProfileResponse(
        timezone=profile.timezone,
        locale=profile.locale,
        automation_mode=profile.automation_mode,
        allow_important_event_detection=profile.allow_important_event_detection,
        allow_aggregate_outcome_sync=profile.allow_aggregate_outcome_sync,
        revision=profile.revision,
        updated_at=_as_utc(profile.updated_at),
    )


def _routine_response(profile: RoutineProfile) -> RoutineProfileResponse:
    return RoutineProfileResponse(
        wake_buffer_min=profile.wake_buffer_min,
        routine_tasks=profile.routine_tasks,
        alarm_preferences=profile.alarm_preferences,
        revision=profile.revision,
        updated_at=_as_utc(profile.updated_at),
    )


def _schedule_response(event: ScheduleEvent) -> ScheduleEventResponse:
    return ScheduleEventResponse(
        id=event.id,
        client_id=event.client_id,
        starts_at=_as_utc(event.starts_at),
        ends_at=_as_utc(event.ends_at),
        category=event.category,
        importance=event.importance,
        location_mode=event.location_mode,
        display_title=event.display_title,
    )


def _next_exam_window(now: datetime, timezone: str) -> tuple[datetime, datetime]:
    local_now = now.astimezone(ZoneInfo(timezone))
    exam_date = local_now.date()
    starts_local = datetime.combine(exam_date, time(hour=9), tzinfo=local_now.tzinfo)
    if starts_local <= local_now:
        starts_local += timedelta(days=1)
    return starts_local.astimezone(UTC), (starts_local + timedelta(minutes=90)).astimezone(UTC)


async def _seed_demo(
    database: DatabaseSession,
    demo_session: DemoSession,
    *,
    now: datetime,
) -> bool:
    await UserProfileRepository(database).add(
        UserProfile(
            user_id=demo_session.id,
            timezone=demo_session.timezone,
            locale=demo_session.locale,
            automation_mode=AutomationMode.RECOMMEND_ONLY,
            allow_important_event_detection=True,
            allow_aggregate_outcome_sync=False,
            revision=1,
        )
    )
    await RoutineProfileRepository(database).add(
        RoutineProfile(
            user_id=demo_session.id,
            wake_buffer_min=15,
            routine_tasks=[
                {"code": "SHOWER", "label": "샤워", "minutes": 20, "movable_to_night": True},
                {
                    "code": "BREAKFAST",
                    "label": "아침 식사",
                    "minutes": 15,
                    "movable_to_night": False,
                },
                {
                    "code": "PACK_BAG",
                    "label": "가방 준비",
                    "minutes": 10,
                    "movable_to_night": True,
                },
            ],
            alarm_preferences={
                "preferred_first_channel": "WATCH_HAPTIC",
                "max_protocol_level": 4,
            },
            revision=1,
        )
    )
    if demo_session.scenario_id != "exam-morning":
        return False

    starts_at, ends_at = _next_exam_window(now, demo_session.timezone)
    await ScheduleEventRepository(database).add(
        ScheduleEvent(
            owner_id=demo_session.id,
            client_id="seed-exam-morning",
            starts_at=starts_at,
            ends_at=ends_at,
            category="EXAM",
            importance=Importance.IMPORTANT,
            location_mode=LocationMode.ONSITE,
            display_title="오전 시험",
        )
    )
    return True


@router.post(
    "/demo-sessions",
    response_model=DemoSessionResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["session"],
    summary="Create a seeded anonymous demo session",
)
async def create_demo_session(
    payload: DemoSessionCreate,
    database: DatabaseSession,
) -> DemoSessionResponse:
    now = datetime.now(UTC)
    demo_session = await DemoSessionRepository(database).add(
        DemoSession(
            expires_at=now + DEMO_SESSION_LIFETIME,
            locale=payload.locale,
            timezone=payload.timezone,
            scenario_id=payload.scenario_id,
        )
    )
    seeded = await _seed_demo(database, demo_session, now=now)
    return DemoSessionResponse(
        session_id=demo_session.id,
        expires_at=demo_session.expires_at,
        seeded=seeded,
    )


@router.get(
    "/me",
    response_model=CurrentSessionResponse,
    tags=["session"],
    summary="Get the current session",
)
async def get_current_session(current: CurrentSession) -> CurrentSessionResponse:
    session = current.demo_session
    return CurrentSessionResponse(
        session_id=session.id,
        session_type=current.session_type,
        timezone=session.timezone,
        locale=session.locale,
        expires_at=_as_utc(session.expires_at),
    )


@router.get(
    "/profile",
    response_model=ProfileResponse,
    tags=["profile"],
    summary="Get profile settings",
)
async def get_profile(current: CurrentSession, database: DatabaseSession) -> ProfileResponse:
    profile = await UserProfileRepository(database).get_by_user_id(current.owner_id)
    if profile is None:
        raise AppError(
            status_code=404,
            code="PROFILE_NOT_FOUND",
            message="The profile was not found.",
        )
    return _profile_response(profile)


@router.put(
    "/profile",
    response_model=ProfileResponse,
    tags=["profile"],
    summary="Replace profile settings",
)
async def replace_profile(
    payload: ProfileUpdate,
    current: CurrentSession,
    database: DatabaseSession,
) -> ProfileResponse:
    profile = await UserProfileRepository(database).get_by_user_id(current.owner_id)
    if profile is None:
        raise AppError(
            status_code=404,
            code="PROFILE_NOT_FOUND",
            message="The profile was not found.",
        )
    if profile.revision != payload.revision:
        raise AppError(
            status_code=409,
            code="REVISION_CONFLICT",
            message="The profile changed after it was loaded.",
            details={"currentRevision": profile.revision},
        )

    profile.timezone = payload.timezone
    profile.locale = payload.locale
    profile.automation_mode = payload.automation_mode
    profile.allow_important_event_detection = payload.allow_important_event_detection
    profile.allow_aggregate_outcome_sync = payload.allow_aggregate_outcome_sync
    profile.revision += 1
    profile.updated_at = datetime.now(UTC)
    await database.flush()
    return _profile_response(profile)


@router.get(
    "/routines",
    response_model=RoutineProfileResponse,
    tags=["routine"],
    summary="Get the morning routine profile",
)
async def get_routines(
    current: CurrentSession,
    database: DatabaseSession,
) -> RoutineProfileResponse:
    profile = await RoutineProfileRepository(database).get_by_user_id(current.owner_id)
    if profile is None:
        raise AppError(
            status_code=404,
            code="ROUTINE_NOT_FOUND",
            message="The routine profile was not found.",
        )
    return _routine_response(profile)


@router.put(
    "/routines",
    response_model=RoutineProfileResponse,
    tags=["routine"],
    summary="Replace the morning routine profile",
)
async def replace_routines(
    payload: RoutineProfileUpdate,
    current: CurrentSession,
    database: DatabaseSession,
) -> RoutineProfileResponse:
    profile = await RoutineProfileRepository(database).get_by_user_id(current.owner_id)
    if profile is None:
        raise AppError(
            status_code=404,
            code="ROUTINE_NOT_FOUND",
            message="The routine profile was not found.",
        )
    if profile.revision != payload.revision:
        raise AppError(
            status_code=409,
            code="REVISION_CONFLICT",
            message="The routine profile changed after it was loaded.",
            details={"currentRevision": profile.revision},
        )

    profile.wake_buffer_min = payload.wake_buffer_min
    profile.routine_tasks = [task.model_dump() for task in payload.routine_tasks]
    profile.alarm_preferences = payload.alarm_preferences.model_dump()
    profile.revision += 1
    profile.updated_at = datetime.now(UTC)
    await database.flush()
    return _routine_response(profile)


@router.post(
    "/schedule-events:batch",
    response_model=ScheduleEventsBatchResponse,
    tags=["schedule"],
    summary="Store a batch of normalized schedule events",
)
async def create_schedule_events(
    payload: ScheduleEventsBatchCreate,
    current: CurrentSession,
    database: DatabaseSession,
) -> ScheduleEventsBatchResponse:
    repository = ScheduleEventRepository(database)
    seen_client_ids: set[str] = set()
    rejected: list[RejectedScheduleEvent] = []
    accepted = 0

    for item in payload.events:
        if item.client_id in seen_client_ids:
            rejected.append(
                RejectedScheduleEvent(
                    client_id=item.client_id,
                    code="DUPLICATE_CLIENT_ID",
                    message="The clientId is duplicated in this batch.",
                )
            )
            continue
        seen_client_ids.add(item.client_id)
        event = await repository.get_by_client_id(current.owner_id, item.client_id)
        if event is None:
            event = ScheduleEvent(owner_id=current.owner_id, client_id=item.client_id)
            database.add(event)
        event.starts_at = item.starts_at
        event.ends_at = item.ends_at
        event.category = item.category
        event.importance = item.importance
        event.location_mode = item.location_mode
        event.display_title = item.display_title
        accepted += 1

    await database.flush()
    return ScheduleEventsBatchResponse(accepted=accepted, rejected=rejected)


def _encode_cursor(event: ScheduleEvent) -> str:
    payload = json.dumps(
        [_as_utc(event.starts_at).isoformat(), str(event.id)],
        separators=(",", ":"),
    ).encode()
    return base64.urlsafe_b64encode(payload).decode().rstrip("=")


def _decode_cursor(value: str) -> tuple[datetime, UUID]:
    try:
        padded = value + "=" * (-len(value) % 4)
        raw = json.loads(base64.urlsafe_b64decode(padded).decode())
        if not isinstance(raw, list) or len(raw) != 2:
            raise ValueError
        starts_at = datetime.fromisoformat(raw[0])
        if starts_at.tzinfo is None:
            raise ValueError
        return starts_at.astimezone(UTC), UUID(raw[1])
    except (ValueError, TypeError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AppError(
            status_code=400,
            code="INVALID_CURSOR",
            message="The schedule cursor is invalid.",
        ) from exc


@router.get(
    "/schedule-events",
    response_model=ScheduleEventsResponse,
    tags=["schedule"],
    summary="List normalized schedule events",
)
async def list_schedule_events(
    current: CurrentSession,
    database: DatabaseSession,
    from_at: Annotated[UtcDatetime, Query(alias="from")],
    to_at: Annotated[UtcDatetime, Query(alias="to")],
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ScheduleEventsResponse:
    if from_at >= to_at:
        raise AppError(
            status_code=400,
            code="INVALID_TIME_RANGE",
            message="The 'from' value must be earlier than 'to'.",
        )
    after = _decode_cursor(cursor) if cursor is not None else None
    events = await ScheduleEventRepository(database).list_between(
        current.owner_id,
        from_at,
        to_at,
        after=after,
        limit=limit + 1,
    )
    has_next = len(events) > limit
    page = events[:limit]
    next_cursor = _encode_cursor(page[-1]) if has_next else None
    return ScheduleEventsResponse(
        items=[_schedule_response(event) for event in page],
        next_cursor=next_cursor,
    )
