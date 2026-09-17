"""Tests for applying and reverting the initial Alembic migration."""

from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from alembic import command
from tests.test_database_models import EXPECTED_TABLES

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _config(database_path: Path) -> Config:
    config = Config(BACKEND_ROOT / "alembic.ini")
    config.set_main_option(
        "sqlalchemy.url",
        f"sqlite+aiosqlite:///{database_path}",
    )
    return config


def test_initial_migration_upgrades_and_downgrades(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    database_path = tmp_path / "migration.db"
    database_url = f"sqlite+aiosqlite:///{database_path}"
    monkeypatch.setenv("KKAEDDAK_DATABASE_URL", database_url)
    config = _config(database_path)

    command.upgrade(config, "head")

    sync_engine = create_engine(f"sqlite:///{database_path}")
    table_names = set(inspect(sync_engine).get_table_names())
    assert table_names == EXPECTED_TABLES | {"alembic_version"}
    command.check(config)

    command.downgrade(config, "base")

    remaining_tables = set(inspect(sync_engine).get_table_names())
    assert remaining_tables <= {"alembic_version"}
    sync_engine.dispose()
