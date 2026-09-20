"""SQLAlchemy models for the server-owned, non-sensitive data boundary."""

from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from kkaeddak.db.base import Base, CreatedAtMixin, UpdatedAtMixin, UUIDPrimaryKeyMixin
from kkaeddak.domain.enums import (
    AlarmEventType,
    AutomationMode,
    Importance,
    LocationMode,
    PlanStatus,
    PrepStatus,
    WakeOutcome,
)

JSON_DOCUMENT = JSON().with_variant(JSONB(), "postgresql")


def enum_column(enum_type: type[Any], name: str) -> Enum:
    return Enum(
        enum_type,
        name=name,
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
        values_callable=lambda members: [member.value for member in members],
    )


class DemoSession(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "demo_sessions"
    __table_args__ = (Index("ix_demo_sessions_expires_at", "expires_at"),)

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    locale: Mapped[str] = mapped_column(String(16), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    scenario_id: Mapped[str] = mapped_column(String(64), nullable=False)


class UserProfile(UpdatedAtMixin, Base):
    __tablename__ = "user_profiles"
    __table_args__ = (
        CheckConstraint("revision >= 1", name="revision_positive"),
        Index("ix_user_profiles_updated_at", "updated_at"),
    )

    user_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    locale: Mapped[str] = mapped_column(String(16), nullable=False)
    automation_mode: Mapped[AutomationMode] = mapped_column(
        enum_column(AutomationMode, "automation_mode"), nullable=False
    )
    allow_important_event_detection: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    allow_aggregate_outcome_sync: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    consent_version: Mapped[str | None] = mapped_column(String(64))
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class RoutineProfile(UpdatedAtMixin, Base):
    __tablename__ = "routine_profiles"
    __table_args__ = (
        CheckConstraint("wake_buffer_min BETWEEN 0 AND 180", name="wake_buffer_range"),
        CheckConstraint("revision >= 1", name="revision_positive"),
    )

    user_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    wake_buffer_min: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    routine_tasks: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON_DOCUMENT, nullable=False, default=list
    )
    alarm_preferences: Mapped[dict[str, Any]] = mapped_column(
        JSON_DOCUMENT, nullable=False, default=dict
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class ScheduleEvent(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "schedule_events"
    __table_args__ = (
        UniqueConstraint("owner_id", "client_id", name="uq_schedule_events_owner_client_id"),
        CheckConstraint("ends_at > starts_at", name="valid_time_range"),
        Index("ix_schedule_events_owner_starts_at", "owner_id", "starts_at"),
    )

    owner_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    client_id: Mapped[str] = mapped_column(String(100), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    importance: Mapped[Importance] = mapped_column(
        enum_column(Importance, "importance"), nullable=False
    )
    location_mode: Mapped[LocationMode] = mapped_column(
        enum_column(LocationMode, "location_mode"), nullable=False
    )
    display_title: Mapped[str | None] = mapped_column(String(100))

    preparation_tasks: Mapped[list["PreparationTask"]] = relationship(
        back_populates="event", cascade="all, delete-orphan", passive_deletes=True
    )


class PreparationTask(UUIDPrimaryKeyMixin, CreatedAtMixin, UpdatedAtMixin, Base):
    __tablename__ = "preparation_tasks"
    __table_args__ = (
        CheckConstraint("minutes_saved BETWEEN 0 AND 180", name="minutes_saved_range"),
        CheckConstraint("revision >= 1", name="revision_positive"),
        Index("ix_preparation_tasks_event_status", "event_id", "status"),
    )

    event_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("schedule_events.id", ondelete="CASCADE"),
        nullable=False,
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    minutes_saved: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[PrepStatus] = mapped_column(
        enum_column(PrepStatus, "prep_status"), nullable=False, default=PrepStatus.SUGGESTED
    )
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    event: Mapped[ScheduleEvent] = relationship(back_populates="preparation_tasks")


class WakePlan(UUIDPrimaryKeyMixin, CreatedAtMixin, UpdatedAtMixin, Base):
    __tablename__ = "wake_plans"
    __table_args__ = (
        UniqueConstraint("owner_id", "idempotency_key", name="uq_wake_plans_owner_idempotency"),
        CheckConstraint("protocol_level BETWEEN 0 AND 4", name="protocol_level_range"),
        CheckConstraint("revision >= 1", name="revision_positive"),
        CheckConstraint("first_alarm_at <= final_alarm_at", name="alarm_order"),
        CheckConstraint("final_alarm_at <= deadline_at", name="deadline_order"),
        Index(
            "ix_wake_plans_owner_local_date_revision",
            "owner_id",
            "local_date",
            "revision",
        ),
    )

    owner_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    local_date: Mapped[date] = mapped_column(Date, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    deadline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    first_alarm_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    final_alarm_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    importance: Mapped[Importance] = mapped_column(
        enum_column(Importance, "importance"), nullable=False
    )
    protocol_level: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[PlanStatus] = mapped_column(
        enum_column(PlanStatus, "plan_status"), nullable=False, default=PlanStatus.DRAFT
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    reason_codes: Mapped[list[str]] = mapped_column(JSON_DOCUMENT, nullable=False, default=list)
    requires_approval: Mapped[bool] = mapped_column(Boolean, nullable=False)
    model_version: Mapped[str] = mapped_column(String(64), nullable=False)

    steps: Mapped[list["WakePlanStep"]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="WakePlanStep.step_order",
        passive_deletes=True,
    )
    outcome: Mapped["WakeOutcomeSummary | None"] = relationship(
        back_populates="plan", cascade="all, delete-orphan", passive_deletes=True
    )
    report: Mapped["WakePlanReport | None"] = relationship(
        back_populates="plan", cascade="all, delete-orphan", passive_deletes=True
    )
    alarm_events: Mapped[list["WakeAlarmEvent"]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="WakeAlarmEvent.occurred_at",
        passive_deletes=True,
    )


class WakePlanStep(Base):
    __tablename__ = "wake_plan_steps"
    __table_args__ = (
        CheckConstraint("step_order BETWEEN 1 AND 5", name="step_order_range"),
        CheckConstraint("offset_min BETWEEN 0 AND 240", name="offset_range"),
    )

    plan_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("wake_plans.id", ondelete="CASCADE"),
        primary_key=True,
    )
    step_order: Mapped[int] = mapped_column(Integer, primary_key=True)
    offset_min: Mapped[int] = mapped_column(Integer, nullable=False)
    channel: Mapped[str] = mapped_column(String(64), nullable=False)

    plan: Mapped[WakePlan] = relationship(back_populates="steps")


class WakeOutcomeSummary(CreatedAtMixin, Base):
    __tablename__ = "wake_outcome_summaries"

    plan_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("wake_plans.id", ondelete="CASCADE"),
        primary_key=True,
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    outcome: Mapped[WakeOutcome] = mapped_column(
        enum_column(WakeOutcome, "wake_outcome"), nullable=False
    )
    alarm_steps_used: Mapped[int] = mapped_column(Integer, nullable=False)
    on_time: Mapped[bool | None] = mapped_column(Boolean)
    user_correction: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    consent_version: Mapped[str] = mapped_column(String(64), nullable=False)

    plan: Mapped[WakePlan] = relationship(back_populates="outcome")


class WakePlanReport(CreatedAtMixin, UpdatedAtMixin, Base):
    """Privacy-limited decision and learning snapshots for one wake plan."""

    __tablename__ = "wake_plan_reports"

    plan_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("wake_plans.id", ondelete="CASCADE"),
        primary_key=True,
    )
    decision_context: Mapped[dict[str, Any] | None] = mapped_column(JSON_DOCUMENT)
    learning_effect: Mapped[dict[str, Any] | None] = mapped_column(JSON_DOCUMENT)

    plan: Mapped[WakePlan] = relationship(back_populates="report")


class WakeAlarmEvent(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """Append-only evidence of what happened at each alarm step."""

    __tablename__ = "wake_alarm_events"
    __table_args__ = (
        UniqueConstraint(
            "plan_id",
            "step_order",
            "event_type",
            name="uq_wake_alarm_events_plan_step_type",
        ),
        CheckConstraint("step_order BETWEEN 1 AND 5", name="step_order_range"),
        Index("ix_wake_alarm_events_plan_occurred", "plan_id", "occurred_at"),
    )

    plan_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("wake_plans.id", ondelete="CASCADE"),
        nullable=False,
    )
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[AlarmEventType] = mapped_column(
        enum_column(AlarmEventType, "alarm_event_type"), nullable=False
    )
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    plan: Mapped[WakePlan] = relationship(back_populates="alarm_events")


class ConsentRecord(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "consent_records"
    __table_args__ = (
        Index("ix_consent_records_owner_scope_granted", "owner_id", "scope", "granted_at"),
    )

    owner_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    scope: Mapped[str] = mapped_column(String(64), nullable=False)
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    policy_version: Mapped[str] = mapped_column(String(64), nullable=False)


class AiExecution(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "ai_executions"
    __table_args__ = (
        CheckConstraint("latency_ms >= 0", name="latency_nonnegative"),
        CheckConstraint("token_count IS NULL OR token_count >= 0", name="token_count_nonnegative"),
        Index("ix_ai_executions_created_at", "created_at"),
        Index("ix_ai_executions_feature_status", "feature", "status"),
    )

    feature: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str | None] = mapped_column(String(100))
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    token_count: Mapped[int | None] = mapped_column(Integer)
    redacted_hash: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
