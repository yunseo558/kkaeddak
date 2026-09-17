"""Async SQLAlchemy engine and session factory helpers."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from kkaeddak.core.config import Settings


def create_database_engine(settings: Settings) -> AsyncEngine:
    options: dict[str, object] = {
        "echo": settings.database_echo,
        "pool_pre_ping": True,
    }
    if settings.database_url.startswith("postgresql+asyncpg://"):
        options["pool_size"] = settings.database_pool_size
    return create_async_engine(settings.database_url, **options)


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


@asynccontextmanager
async def session_scope(
    factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncSession]:
    """Commit one unit of work or roll it back on failure."""
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
