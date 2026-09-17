"""Repository layer for server-owned persistence operations."""

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from kkaeddak.db.base import Base
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
)


class Repository[ModelT: Base]:
    """Small unit-of-work-aware repository primitive."""

    model_type: type[ModelT]

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, identity: object) -> ModelT | None:
        return await self.session.get(self.model_type, identity)

    async def add(self, instance: ModelT) -> ModelT:
        self.session.add(instance)
        await self.session.flush()
        return instance

    async def delete(self, instance: ModelT) -> None:
        await self.session.delete(instance)
        await self.session.flush()

    async def first(self, statement: Select[tuple[ModelT]]) -> ModelT | None:
        return await self.session.scalar(statement.limit(1))


class DemoSessionRepository(Repository[DemoSession]):
    model_type = DemoSession

    async def get_active(self, session_id: UUID, now: datetime) -> DemoSession | None:
        statement = select(DemoSession).where(
            DemoSession.id == session_id,
            DemoSession.expires_at > now,
        )
        return await self.first(statement)


class UserProfileRepository(Repository[UserProfile]):
    model_type = UserProfile

    async def get_by_user_id(self, user_id: UUID) -> UserProfile | None:
        return await self.get(user_id)


class RoutineProfileRepository(Repository[RoutineProfile]):
    model_type = RoutineProfile

    async def get_by_user_id(self, user_id: UUID) -> RoutineProfile | None:
        return await self.get(user_id)


class ScheduleEventRepository(Repository[ScheduleEvent]):
    model_type = ScheduleEvent

    async def list_between(
        self,
        owner_id: UUID,
        starts_at: datetime,
        ends_at: datetime,
        *,
        limit: int = 100,
    ) -> list[ScheduleEvent]:
        statement = (
            select(ScheduleEvent)
            .where(
                ScheduleEvent.owner_id == owner_id,
                ScheduleEvent.starts_at < ends_at,
                ScheduleEvent.ends_at > starts_at,
            )
            .order_by(ScheduleEvent.starts_at, ScheduleEvent.id)
            .limit(limit)
        )
        return list(await self.session.scalars(statement))


class PreparationTaskRepository(Repository[PreparationTask]):
    model_type = PreparationTask

    async def list_for_event(self, event_id: UUID) -> list[PreparationTask]:
        statement = (
            select(PreparationTask)
            .where(PreparationTask.event_id == event_id)
            .order_by(PreparationTask.created_at, PreparationTask.id)
        )
        return list(await self.session.scalars(statement))


class WakePlanRepository(Repository[WakePlan]):
    model_type = WakePlan

    async def get_latest(self, owner_id: UUID, local_date: date) -> WakePlan | None:
        statement = (
            select(WakePlan)
            .where(WakePlan.owner_id == owner_id, WakePlan.local_date == local_date)
            .order_by(WakePlan.revision.desc())
        )
        return await self.first(statement)

    async def get_by_idempotency_key(self, owner_id: UUID, idempotency_key: str) -> WakePlan | None:
        statement = select(WakePlan).where(
            WakePlan.owner_id == owner_id,
            WakePlan.idempotency_key == idempotency_key,
        )
        return await self.first(statement)


class WakeOutcomeRepository(Repository[WakeOutcomeSummary]):
    model_type = WakeOutcomeSummary

    async def get_by_plan_id(self, plan_id: UUID) -> WakeOutcomeSummary | None:
        return await self.get(plan_id)


class ConsentRecordRepository(Repository[ConsentRecord]):
    model_type = ConsentRecord

    async def get_active(self, owner_id: UUID, scope: str) -> ConsentRecord | None:
        statement = (
            select(ConsentRecord)
            .where(
                ConsentRecord.owner_id == owner_id,
                ConsentRecord.scope == scope,
                ConsentRecord.revoked_at.is_(None),
            )
            .order_by(ConsentRecord.granted_at.desc())
        )
        return await self.first(statement)


class AiExecutionRepository(Repository[AiExecution]):
    model_type = AiExecution
