"""Async integration tests for repositories and transaction boundaries."""

from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from kkaeddak.core.config import Settings
from kkaeddak.db import Base
from kkaeddak.db.models import (
    AiExecution,
    ConsentRecord,
    DemoSession,
    PreparationTask,
    RoutineProfile,
    ScheduleEvent,
    UserProfile,
    WakeOutcomeSummary,
    WakePlan,
    WakePlanStep,
)
from kkaeddak.db.repositories import (
    AiExecutionRepository,
    ConsentRecordRepository,
    DemoSessionRepository,
    PreparationTaskRepository,
    RoutineProfileRepository,
    ScheduleEventRepository,
    UserProfileRepository,
    WakeOutcomeRepository,
    WakePlanRepository,
)
from kkaeddak.db.session import create_database_engine, create_session_factory, session_scope
from kkaeddak.domain.enums import (
    AutomationMode,
    Importance,
    LocationMode,
    PlanStatus,
    PrepStatus,
    WakeOutcome,
)


@pytest.fixture
async def database() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    settings = Settings(database_url="sqlite+aiosqlite:///:memory:", _env_file=None)
    engine = create_database_engine(settings)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield create_session_factory(engine)
    await engine.dispose()


@pytest.mark.anyio
async def test_repositories_cover_server_owned_entities(
    database: async_sessionmaker[AsyncSession],
) -> None:
    factory = database
    now = datetime.now(UTC)
    owner_id = uuid4()

    async with factory() as session:
        demo_repository = DemoSessionRepository(session)
        active_demo = await demo_repository.add(
            DemoSession(
                expires_at=now + timedelta(hours=1),
                locale="ko-KR",
                timezone="Asia/Seoul",
                scenario_id="exam-morning",
            )
        )
        expired_demo = await demo_repository.add(
            DemoSession(
                expires_at=now - timedelta(hours=1),
                locale="ko-KR",
                timezone="Asia/Seoul",
                scenario_id="exam-morning",
            )
        )
        assert await demo_repository.get_active(active_demo.id, now) is active_demo
        assert await demo_repository.get_active(expired_demo.id, now) is None

        profile_repository = UserProfileRepository(session)
        profile = await profile_repository.add(
            UserProfile(
                user_id=owner_id,
                timezone="Asia/Seoul",
                locale="ko-KR",
                automation_mode=AutomationMode.RECOMMEND_ONLY,
                revision=1,
            )
        )
        assert await profile_repository.get_by_user_id(owner_id) is profile

        routine_repository = RoutineProfileRepository(session)
        routine = await routine_repository.add(
            RoutineProfile(
                user_id=owner_id,
                wake_buffer_min=10,
                routine_tasks=[{"code": "PACK_BAG", "minutes": 10}],
                alarm_preferences={"maxProtocolLevel": 2},
                revision=1,
            )
        )
        assert await routine_repository.get_by_user_id(owner_id) is routine

        schedule_repository = ScheduleEventRepository(session)
        event = await schedule_repository.add(
            ScheduleEvent(
                owner_id=owner_id,
                client_id="evt-local-1",
                starts_at=now + timedelta(hours=10),
                ends_at=now + timedelta(hours=11),
                category="EXAM",
                importance=Importance.IMPORTANT,
                location_mode=LocationMode.ONSITE,
                display_title="오전 시험",
            )
        )
        events = await schedule_repository.list_between(
            owner_id,
            now + timedelta(hours=9),
            now + timedelta(hours=12),
        )
        assert events == [event]

        preparation_repository = PreparationTaskRepository(session)
        task = await preparation_repository.add(
            PreparationTask(
                event_id=event.id,
                code="PACK_BAG",
                label="가방 미리 준비하기",
                minutes_saved=10,
                status=PrepStatus.SUGGESTED,
                source="TEMPLATE",
                revision=1,
            )
        )
        assert await preparation_repository.list_for_event(event.id) == [task]

        plan_repository = WakePlanRepository(session)
        first_plan = await plan_repository.add(_wake_plan(owner_id, 1, "plan-key-0001"))
        second_plan = await plan_repository.add(_wake_plan(owner_id, 2, "plan-key-0002"))
        assert await plan_repository.get_latest(owner_id, date(2026, 9, 19)) is second_plan
        assert await plan_repository.get_by_idempotency_key(owner_id, "plan-key-0001") is first_plan

        outcome_repository = WakeOutcomeRepository(session)
        outcome = await outcome_repository.add(
            WakeOutcomeSummary(
                plan_id=second_plan.id,
                confirmed_at=now,
                outcome=WakeOutcome.CONFIRMED_ON_TIME,
                alarm_steps_used=1,
                on_time=True,
                user_correction=False,
                consent_version="outcome-sync-1",
            )
        )
        assert await outcome_repository.get_by_plan_id(second_plan.id) is outcome

        consent_repository = ConsentRecordRepository(session)
        active_consent = await consent_repository.add(
            ConsentRecord(
                owner_id=owner_id,
                scope="OUTCOME_SYNC",
                policy_version="outcome-sync-1",
            )
        )
        assert await consent_repository.get_active(owner_id, "OUTCOME_SYNC") is active_consent

        execution_repository = AiExecutionRepository(session)
        execution = await execution_repository.add(
            AiExecution(
                feature="EXPLANATION",
                model=None,
                latency_ms=12,
                status="FALLBACK",
                token_count=None,
                redacted_hash=None,
            )
        )
        assert await execution_repository.get(execution.id) is execution
        await execution_repository.delete(execution)
        assert await execution_repository.get(execution.id) is None


@pytest.mark.anyio
async def test_expired_demo_cleanup_preserves_active_sessions(
    database: async_sessionmaker[AsyncSession],
) -> None:
    now = datetime.now(UTC)
    async with session_scope(database) as session:
        expired = await DemoSessionRepository(session).add(
            DemoSession(
                expires_at=now - timedelta(minutes=1),
                locale="ko-KR",
                timezone="Asia/Seoul",
                scenario_id="exam-morning",
            )
        )
        active = await DemoSessionRepository(session).add(
            DemoSession(
                expires_at=now + timedelta(hours=1),
                locale="ko-KR",
                timezone="Asia/Seoul",
                scenario_id="regular-class",
            )
        )
        await UserProfileRepository(session).add(
            UserProfile(
                user_id=expired.id,
                timezone="Asia/Seoul",
                locale="ko-KR",
                automation_mode=AutomationMode.RECOMMEND_ONLY,
                revision=1,
            )
        )
        deleted = await DemoSessionRepository(session).delete_expired(now)

    async with database() as session:
        assert deleted == 1
        assert await session.get(DemoSession, expired.id) is None
        assert await session.get(UserProfile, expired.id) is None
        assert await session.get(DemoSession, active.id) is not None


def _wake_plan(owner_id: UUID, revision: int, key: str) -> WakePlan:
    return WakePlan(
        owner_id=owner_id,
        local_date=date(2026, 9, 19),
        timezone="Asia/Seoul",
        deadline_at=datetime(2026, 9, 18, 23, 50, tzinfo=UTC),
        first_alarm_at=datetime(2026, 9, 18, 23, 25, tzinfo=UTC),
        final_alarm_at=datetime(2026, 9, 18, 23, 35, tzinfo=UTC),
        importance=Importance.IMPORTANT,
        protocol_level=2,
        status=PlanStatus.PROPOSED,
        revision=revision,
        idempotency_key=key,
        reason_codes=["SHORTER_SLEEP_THAN_BASELINE"],
        requires_approval=True,
        model_version="local-wake-0.1",
        steps=[
            WakePlanStep(step_order=1, offset_min=0, channel="WATCH_HAPTIC"),
            WakePlanStep(step_order=2, offset_min=8, channel="PHONE_SOUND"),
        ],
    )


@pytest.mark.anyio
async def test_session_scope_commits_and_rolls_back(
    database: async_sessionmaker[AsyncSession],
) -> None:
    factory = database
    committed_id = uuid4()

    async with session_scope(factory) as session:
        session.add(
            DemoSession(
                id=committed_id,
                expires_at=datetime.now(UTC) + timedelta(hours=1),
                locale="ko-KR",
                timezone="Asia/Seoul",
                scenario_id="exam-morning",
            )
        )

    async with factory() as session:
        assert await session.get(DemoSession, committed_id) is not None

    rolled_back_id = uuid4()
    with pytest.raises(RuntimeError, match="rollback"):
        async with session_scope(factory) as session:
            session.add(
                DemoSession(
                    id=rolled_back_id,
                    expires_at=datetime.now(UTC) + timedelta(hours=1),
                    locale="ko-KR",
                    timezone="Asia/Seoul",
                    scenario_id="exam-morning",
                )
            )
            raise RuntimeError("rollback")

    async with factory() as session:
        assert await session.get(DemoSession, rolled_back_id) is None
