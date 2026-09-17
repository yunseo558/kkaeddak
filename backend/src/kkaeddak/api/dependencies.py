"""Database and authenticated session dependencies."""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from kkaeddak.core.errors import AppError
from kkaeddak.db.models import DemoSession
from kkaeddak.db.repositories import DemoSessionRepository


async def database_session(request: Request) -> AsyncIterator[AsyncSession]:
    """Provide one transactional database session per request."""
    factory: async_sessionmaker[AsyncSession] = request.app.state.session_factory
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


DatabaseSession = Annotated[AsyncSession, Depends(database_session)]


@dataclass(frozen=True, slots=True)
class SessionContext:
    owner_id: UUID
    session_type: Literal["DEMO"]
    demo_session: DemoSession


async def session_headers(
    database: DatabaseSession,
    x_demo_session: Annotated[UUID | None, Header(alias="X-Demo-Session")] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> SessionContext:
    """Resolve the current demo session while reserving Authorization for OIDC."""
    if x_demo_session is None:
        raise AppError(
            status_code=401,
            code="SESSION_INVALID",
            message="A valid demo session is required.",
        )

    demo_session = await DemoSessionRepository(database).get_active(
        x_demo_session, datetime.now(UTC)
    )
    if demo_session is None:
        raise AppError(
            status_code=401,
            code="SESSION_INVALID",
            message="The demo session is invalid or expired.",
        )
    return SessionContext(
        owner_id=demo_session.id,
        session_type="DEMO",
        demo_session=demo_session,
    )


CurrentSession = Annotated[SessionContext, Depends(session_headers)]


IdempotencyKey = Annotated[
    str,
    Header(
        alias="Idempotency-Key",
        min_length=8,
        max_length=128,
        pattern=r"^[A-Za-z0-9._:-]+$",
    ),
]
