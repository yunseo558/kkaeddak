"""Repository layer for server-owned persistence operations."""

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import Select, and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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
    WakePlanStep,
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

    async def delete_expired(self, now: datetime, *, limit: int = 1_000) -> int:
        expired_ids = list(
            await self.session.scalars(
                select(DemoSession.id)
                .where(DemoSession.expires_at <= now)
                .order_by(DemoSession.expires_at, DemoSession.id)
                .limit(limit)
            )
        )
        if not expired_ids:
            return 0

        event_ids = select(ScheduleEvent.id).where(ScheduleEvent.owner_id.in_(expired_ids))
        plan_ids = select(WakePlan.id).where(WakePlan.owner_id.in_(expired_ids))
        await self.session.execute(
            delete(PreparationTask).where(PreparationTask.event_id.in_(event_ids))
        )
        await self.session.execute(
            delete(WakeOutcomeSummary).where(WakeOutcomeSummary.plan_id.in_(plan_ids))
        )
        await self.session.execute(delete(WakePlanStep).where(WakePlanStep.plan_id.in_(plan_ids)))
        await self.session.execute(delete(WakePlan).where(WakePlan.owner_id.in_(expired_ids)))
        await self.session.execute(
            delete(ScheduleEvent).where(ScheduleEvent.owner_id.in_(expired_ids))
        )
        await self.session.execute(
            delete(ConsentRecord).where(ConsentRecord.owner_id.in_(expired_ids))
        )
        await self.session.execute(
            delete(RoutineProfile).where(RoutineProfile.user_id.in_(expired_ids))
        )
        await self.session.execute(delete(UserProfile).where(UserProfile.user_id.in_(expired_ids)))
        await self.session.execute(delete(DemoSession).where(DemoSession.id.in_(expired_ids)))
        await self.session.flush()
        return len(expired_ids)


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

    async def get_by_client_id(self, owner_id: UUID, client_id: str) -> ScheduleEvent | None:
        statement = select(ScheduleEvent).where(
            ScheduleEvent.owner_id == owner_id,
            ScheduleEvent.client_id == client_id,
        )
        return await self.first(statement)

    async def list_between(
        self,
        owner_id: UUID,
        starts_at: datetime,
        ends_at: datetime,
        *,
        after: tuple[datetime, UUID] | None = None,
        limit: int = 100,
    ) -> list[ScheduleEvent]:
        conditions = [
            ScheduleEvent.owner_id == owner_id,
            ScheduleEvent.starts_at < ends_at,
            ScheduleEvent.ends_at > starts_at,
        ]
        if after is not None:
            cursor_time, cursor_id = after
            conditions.append(
                or_(
                    ScheduleEvent.starts_at > cursor_time,
                    and_(
                        ScheduleEvent.starts_at == cursor_time,
                        ScheduleEvent.id > cursor_id,
                    ),
                )
            )
        statement = (
            select(ScheduleEvent)
            .where(*conditions)
            .order_by(ScheduleEvent.starts_at, ScheduleEvent.id)
            .limit(limit)
        )
        return list(await self.session.scalars(statement))


class PreparationTaskRepository(Repository[PreparationTask]):
    model_type = PreparationTask

    async def get_for_owner(self, task_id: UUID, owner_id: UUID) -> PreparationTask | None:
        statement = (
            select(PreparationTask)
            .join(ScheduleEvent)
            .where(
                PreparationTask.id == task_id,
                ScheduleEvent.owner_id == owner_id,
            )
        )
        return await self.first(statement)

    async def get_by_event_and_code(
        self,
        event_id: UUID,
        code: str,
    ) -> PreparationTask | None:
        statement = select(PreparationTask).where(
            PreparationTask.event_id == event_id,
            PreparationTask.code == code,
        )
        return await self.first(statement)

    async def list_for_event(self, event_id: UUID) -> list[PreparationTask]:
        statement = (
            select(PreparationTask)
            .where(PreparationTask.event_id == event_id)
            .order_by(PreparationTask.created_at, PreparationTask.id)
        )
        return list(await self.session.scalars(statement))


class WakePlanRepository(Repository[WakePlan]):
    model_type = WakePlan

    async def get_for_owner(self, plan_id: UUID, owner_id: UUID) -> WakePlan | None:
        statement = (
            select(WakePlan)
            .options(selectinload(WakePlan.steps))
            .where(WakePlan.id == plan_id, WakePlan.owner_id == owner_id)
        )
        return await self.first(statement)

    async def get_latest(self, owner_id: UUID, local_date: date) -> WakePlan | None:
        statement = (
            select(WakePlan)
            .options(selectinload(WakePlan.steps))
            .where(WakePlan.owner_id == owner_id, WakePlan.local_date == local_date)
            .order_by(WakePlan.revision.desc(), WakePlan.created_at.desc(), WakePlan.id.desc())
        )
        return await self.first(statement)

    async def get_by_idempotency_key(self, owner_id: UUID, idempotency_key: str) -> WakePlan | None:
        statement = (
            select(WakePlan)
            .options(selectinload(WakePlan.steps))
            .where(
                WakePlan.owner_id == owner_id,
                WakePlan.idempotency_key == idempotency_key,
            )
        )
        return await self.first(statement)


class WakeOutcomeRepository(Repository[WakeOutcomeSummary]):
    model_type = WakeOutcomeSummary

    async def get_by_plan_id(self, plan_id: UUID) -> WakeOutcomeSummary | None:
        return await self.get(plan_id)

    async def list_between(
        self,
        owner_id: UUID,
        from_date: date,
        to_date: date,
    ) -> list[WakeOutcomeSummary]:
        statement = (
            select(WakeOutcomeSummary)
            .join(WakePlan)
            .where(
                WakePlan.owner_id == owner_id,
                WakePlan.local_date >= from_date,
                WakePlan.local_date <= to_date,
            )
            .order_by(WakePlan.local_date, WakeOutcomeSummary.plan_id)
        )
        return list(await self.session.scalars(statement))


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
