"""Delete expired anonymous demo sessions and their server-owned data."""

import asyncio
import logging
from datetime import UTC, datetime

from kkaeddak.core.config import get_settings
from kkaeddak.db.repositories import DemoSessionRepository
from kkaeddak.db.session import create_database_engine, create_session_factory, session_scope

logger = logging.getLogger(__name__)


async def cleanup_expired_sessions() -> int:
    settings = get_settings()
    engine = create_database_engine(settings)
    factory = create_session_factory(engine)
    try:
        async with session_scope(factory) as session:
            deleted = await DemoSessionRepository(session).delete_expired(datetime.now(UTC))
    finally:
        await engine.dispose()
    return deleted


async def _run() -> None:
    deleted = await cleanup_expired_sessions()
    logger.info("deleted %d expired demo sessions", deleted)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(_run())
