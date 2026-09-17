"""Tests for metadata, PostgreSQL variants, and database settings."""

from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import JSONB

from kkaeddak.core.config import Settings
from kkaeddak.db import Base
from kkaeddak.db.models import RoutineProfile, WakePlan

EXPECTED_TABLES = {
    "ai_executions",
    "consent_records",
    "demo_sessions",
    "preparation_tasks",
    "routine_profiles",
    "schedule_events",
    "user_profiles",
    "wake_outcome_summaries",
    "wake_plan_steps",
    "wake_plans",
}

FORBIDDEN_COLUMN_FRAGMENTS = {
    "accelerometer",
    "heart_rate",
    "hrv",
    "location_trace",
    "menstrual",
    "microphone",
    "sleep_stage",
}


def test_metadata_contains_only_documented_server_tables() -> None:
    assert set(Base.metadata.tables) == EXPECTED_TABLES


def test_schema_has_no_raw_health_or_sensor_columns() -> None:
    column_names = {
        column.name.lower() for table in Base.metadata.sorted_tables for column in table.columns
    }

    assert not any(
        fragment in column_name
        for fragment in FORBIDDEN_COLUMN_FRAGMENTS
        for column_name in column_names
    )


def test_json_documents_compile_to_postgresql_jsonb() -> None:
    dialect = postgresql.dialect()

    routine_type = RoutineProfile.__table__.c.routine_tasks.type.dialect_impl(dialect)
    reasons_type = WakePlan.__table__.c.reason_codes.type.dialect_impl(dialect)
    assert isinstance(routine_type, JSONB)
    assert isinstance(reasons_type, JSONB)


def test_database_settings_support_postgresql_and_test_sqlite() -> None:
    postgres = Settings(_env_file=None)
    sqlite = Settings(database_url="sqlite+aiosqlite:///:memory:", _env_file=None)

    assert postgres.database_url.startswith("postgresql+asyncpg://")
    assert sqlite.database_url == "sqlite+aiosqlite:///:memory:"
