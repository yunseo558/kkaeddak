"""Add explainable wake-history reports and alarm lifecycle events.

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

json_document = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def enum_type(name: str, *values: str) -> sa.Enum:
    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True)


def upgrade() -> None:
    op.create_table(
        "wake_plan_reports",
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("decision_context", json_document, nullable=True),
        sa.Column("learning_effect", json_document, nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["wake_plans.id"],
            name="fk_wake_plan_reports_plan_id_wake_plans",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("plan_id", name="pk_wake_plan_reports"),
    )

    op.create_table(
        "wake_alarm_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("step_order", sa.Integer(), nullable=False),
        sa.Column(
            "event_type",
            enum_type(
                "alarm_event_type",
                "RANG",
                "DISMISSED",
                "CONFIRMED_AWAKE",
                "MISSED",
                "CANCELLED",
            ),
            nullable=False,
        ),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("step_order BETWEEN 1 AND 5", name="step_order_range"),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["wake_plans.id"],
            name="fk_wake_alarm_events_plan_id_wake_plans",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_wake_alarm_events"),
        sa.UniqueConstraint(
            "plan_id",
            "step_order",
            "event_type",
            name="uq_wake_alarm_events_plan_step_type",
        ),
    )
    op.create_index(
        "ix_wake_alarm_events_plan_occurred",
        "wake_alarm_events",
        ["plan_id", "occurred_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_wake_alarm_events_plan_occurred", table_name="wake_alarm_events")
    op.drop_table("wake_alarm_events")
    op.drop_table("wake_plan_reports")
