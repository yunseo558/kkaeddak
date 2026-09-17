"""Alembic environment for the async SQLAlchemy engine."""

from logging.config import fileConfig

from sqlalchemy import Connection, pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context
from kkaeddak.core.config import Settings
from kkaeddak.db import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = Settings()
config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
target_metadata = Base.metadata


def configure_context(connection: Connection | None = None) -> None:
    options = {
        "target_metadata": target_metadata,
        "compare_type": True,
        "render_as_batch": settings.database_url.startswith("sqlite+aiosqlite://"),
    }
    if connection is None:
        context.configure(url=settings.database_url, literal_binds=True, **options)
    else:
        context.configure(connection=connection, **options)


def run_migrations_offline() -> None:
    configure_context()
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    configure_context(connection)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    import asyncio

    asyncio.run(run_async_migrations())
