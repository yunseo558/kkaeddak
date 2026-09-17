"""Create the initial server-owned schema.

Revision ID: 0001
Revises:
Create Date: 2026-09-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

json_document = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def enum_type(name: str, *values: str) -> sa.Enum:
    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True)


def upgrade() -> None:
    op.create_table(
        "demo_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("locale", sa.String(length=16), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("scenario_id", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_demo_sessions"),
    )
    op.create_index("ix_demo_sessions_expires_at", "demo_sessions", ["expires_at"])

    op.create_table(
        "user_profiles",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("locale", sa.String(length=16), nullable=False),
        sa.Column(
            "automation_mode",
            enum_type(
                "automation_mode",
                "RECOMMEND_ONLY",
                "AUTO_ROUTINE_DAYS",
                "AUTO_EXCEPT_IMPORTANT",
            ),
            nullable=False,
        ),
        sa.Column("allow_important_event_detection", sa.Boolean(), nullable=False),
        sa.Column("allow_aggregate_outcome_sync", sa.Boolean(), nullable=False),
        sa.Column("consent_version", sa.String(length=64), nullable=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("revision >= 1", name="revision_positive"),
        sa.PrimaryKeyConstraint("user_id", name="pk_user_profiles"),
    )
    op.create_index("ix_user_profiles_updated_at", "user_profiles", ["updated_at"])

    op.create_table(
        "routine_profiles",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("wake_buffer_min", sa.Integer(), nullable=False),
        sa.Column("routine_tasks", json_document, nullable=False),
        sa.Column("alarm_preferences", json_document, nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "wake_buffer_min BETWEEN 0 AND 180",
            name="wake_buffer_range",
        ),
        sa.CheckConstraint("revision >= 1", name="revision_positive"),
        sa.PrimaryKeyConstraint("user_id", name="pk_routine_profiles"),
    )

    op.create_table(
        "schedule_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("client_id", sa.String(length=100), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column(
            "importance",
            enum_type("importance", "NORMAL", "IMPORTANT", "CRITICAL"),
            nullable=False,
        ),
        sa.Column(
            "location_mode",
            enum_type("location_mode", "REMOTE", "ONSITE", "UNKNOWN"),
            nullable=False,
        ),
        sa.Column("display_title", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("ends_at > starts_at", name="valid_time_range"),
        sa.PrimaryKeyConstraint("id", name="pk_schedule_events"),
        sa.UniqueConstraint(
            "owner_id",
            "client_id",
            name="uq_schedule_events_owner_client_id",
        ),
    )
    op.create_index(
        "ix_schedule_events_owner_starts_at",
        "schedule_events",
        ["owner_id", "starts_at"],
    )

    op.create_table(
        "preparation_tasks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=80), nullable=False),
        sa.Column("minutes_saved", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            enum_type("prep_status", "SUGGESTED", "ACCEPTED", "COMPLETED", "SKIPPED"),
            nullable=False,
        ),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "minutes_saved BETWEEN 0 AND 180",
            name="minutes_saved_range",
        ),
        sa.CheckConstraint("revision >= 1", name="revision_positive"),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["schedule_events.id"],
            name="fk_preparation_tasks_event_id_schedule_events",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_preparation_tasks"),
    )
    op.create_index(
        "ix_preparation_tasks_event_status",
        "preparation_tasks",
        ["event_id", "status"],
    )

    op.create_table(
        "wake_plans",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("local_date", sa.Date(), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("deadline_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("first_alarm_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("final_alarm_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "importance",
            enum_type("importance", "NORMAL", "IMPORTANT", "CRITICAL"),
            nullable=False,
        ),
        sa.Column("protocol_level", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            enum_type(
                "plan_status",
                "DRAFT",
                "PROPOSED",
                "APPROVED",
                "EDITED",
                "DECLINED",
                "ACTIVE",
                "COMPLETED",
                "CANCELLED",
            ),
            nullable=False,
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("reason_codes", json_document, nullable=False),
        sa.Column("requires_approval", sa.Boolean(), nullable=False),
        sa.Column("model_version", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("protocol_level BETWEEN 0 AND 4", name="protocol_level_range"),
        sa.CheckConstraint("revision >= 1", name="revision_positive"),
        sa.CheckConstraint("first_alarm_at <= final_alarm_at", name="alarm_order"),
        sa.CheckConstraint("final_alarm_at <= deadline_at", name="deadline_order"),
        sa.PrimaryKeyConstraint("id", name="pk_wake_plans"),
        sa.UniqueConstraint(
            "owner_id",
            "idempotency_key",
            name="uq_wake_plans_owner_idempotency",
        ),
    )
    op.create_index(
        "ix_wake_plans_owner_local_date_revision",
        "wake_plans",
        ["owner_id", "local_date", "revision"],
    )

    op.create_table(
        "wake_plan_steps",
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("step_order", sa.Integer(), nullable=False),
        sa.Column("offset_min", sa.Integer(), nullable=False),
        sa.Column("channel", sa.String(length=64), nullable=False),
        sa.CheckConstraint("step_order BETWEEN 1 AND 5", name="step_order_range"),
        sa.CheckConstraint("offset_min BETWEEN 0 AND 240", name="offset_range"),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["wake_plans.id"],
            name="fk_wake_plan_steps_plan_id_wake_plans",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("plan_id", "step_order", name="pk_wake_plan_steps"),
    )

    op.create_table(
        "wake_outcome_summaries",
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "outcome",
            enum_type(
                "wake_outcome",
                "CONFIRMED_ON_TIME",
                "CONFIRMED_LATE",
                "UNCONFIRMED",
                "USER_CANCELLED",
            ),
            nullable=False,
        ),
        sa.Column("alarm_steps_used", sa.Integer(), nullable=False),
        sa.Column("on_time", sa.Boolean(), nullable=True),
        sa.Column("user_correction", sa.Boolean(), nullable=False),
        sa.Column("consent_version", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["wake_plans.id"],
            name="fk_wake_outcome_summaries_plan_id_wake_plans",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("plan_id", name="pk_wake_outcome_summaries"),
    )

    op.create_table(
        "consent_records",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("scope", sa.String(length=64), nullable=False),
        sa.Column(
            "granted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("policy_version", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_consent_records"),
    )
    op.create_index(
        "ix_consent_records_owner_scope_granted",
        "consent_records",
        ["owner_id", "scope", "granted_at"],
    )

    op.create_table(
        "ai_executions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("feature", sa.String(length=64), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=True),
        sa.Column("redacted_hash", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("latency_ms >= 0", name="latency_nonnegative"),
        sa.CheckConstraint(
            "token_count IS NULL OR token_count >= 0",
            name="token_count_nonnegative",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_ai_executions"),
    )
    op.create_index("ix_ai_executions_created_at", "ai_executions", ["created_at"])
    op.create_index(
        "ix_ai_executions_feature_status",
        "ai_executions",
        ["feature", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_ai_executions_feature_status", table_name="ai_executions")
    op.drop_index("ix_ai_executions_created_at", table_name="ai_executions")
    op.drop_table("ai_executions")
    op.drop_index("ix_consent_records_owner_scope_granted", table_name="consent_records")
    op.drop_table("consent_records")
    op.drop_table("wake_outcome_summaries")
    op.drop_table("wake_plan_steps")
    op.drop_index("ix_wake_plans_owner_local_date_revision", table_name="wake_plans")
    op.drop_table("wake_plans")
    op.drop_index("ix_preparation_tasks_event_status", table_name="preparation_tasks")
    op.drop_table("preparation_tasks")
    op.drop_index("ix_schedule_events_owner_starts_at", table_name="schedule_events")
    op.drop_table("schedule_events")
    op.drop_table("routine_profiles")
    op.drop_index("ix_user_profiles_updated_at", table_name="user_profiles")
    op.drop_table("user_profiles")
    op.drop_index("ix_demo_sessions_expires_at", table_name="demo_sessions")
    op.drop_table("demo_sessions")
