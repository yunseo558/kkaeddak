"""Operational health and browser-origin integration tests."""

from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, text

from kkaeddak.core import config as config_module
from kkaeddak.core.config import Settings
from kkaeddak.db.base import Base
from kkaeddak.db.models import DemoSession
from kkaeddak.db.session import create_database_engine, create_session_factory, session_scope
from kkaeddak.jobs import cleanup_expired_sessions as cleanup_module
from kkaeddak.main import create_app


@pytest.fixture
async def operational_client(tmp_path: Path) -> AsyncIterator[AsyncClient]:
    database_path = tmp_path / "operational.sqlite3"
    settings = Settings(
        environment="test",
        database_url=f"sqlite+aiosqlite:///{database_path}",
        cors_allowed_origins=["https://kkaeddak.vercel.app"],
        _env_file=None,
    )
    engine = create_database_engine(settings)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32))"))
        await connection.execute(text("INSERT INTO alembic_version VALUES ('0001')"))
    await engine.dispose()

    app = create_app(settings)
    async with (
        app.router.lifespan_context(app),
        AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client,
    ):
        yield client


@pytest.mark.anyio
async def test_health_reports_current_migration(
    operational_client: AsyncClient,
) -> None:
    response = await operational_client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "api": "ok",
        "database": "ok",
        "migrationVersion": "0001",
    }


@pytest.mark.anyio
async def test_cors_allows_only_configured_browser_origin(
    operational_client: AsyncClient,
) -> None:
    allowed = await operational_client.options(
        "/api/v1/health",
        headers={
            "Origin": "https://kkaeddak.vercel.app",
            "Access-Control-Request-Method": "GET",
        },
    )
    denied = await operational_client.options(
        "/api/v1/health",
        headers={
            "Origin": "https://untrusted.example",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "https://kkaeddak.vercel.app"
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers


@pytest.mark.anyio
async def test_cleanup_job_deletes_only_expired_sessions(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(
        environment="test",
        database_url=f"sqlite+aiosqlite:///{tmp_path / 'cleanup.sqlite3'}",
        _env_file=None,
    )
    engine = create_database_engine(settings)
    factory = create_session_factory(engine)
    now = datetime.now(UTC)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with session_scope(factory) as session:
        session.add_all(
            [
                DemoSession(
                    expires_at=now - timedelta(minutes=1),
                    locale="ko-KR",
                    timezone="Asia/Seoul",
                    scenario_id="exam-morning",
                ),
                DemoSession(
                    expires_at=now + timedelta(hours=1),
                    locale="ko-KR",
                    timezone="Asia/Seoul",
                    scenario_id="regular-class",
                ),
            ]
        )
    await engine.dispose()

    monkeypatch.setattr(cleanup_module, "get_settings", lambda: settings)
    config_module.get_settings.cache_clear()
    assert await cleanup_module.cleanup_expired_sessions() == 1

    verification_engine = create_database_engine(settings)
    async with create_session_factory(verification_engine)() as session:
        remaining = await session.scalar(select(func.count()).select_from(DemoSession))
    await verification_engine.dispose()
    assert remaining == 1
