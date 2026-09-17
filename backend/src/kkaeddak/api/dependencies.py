"""OpenAPI-visible request headers shared by session routes."""

from typing import Annotated
from uuid import UUID

from fastapi import Header


async def session_headers(
    x_demo_session: Annotated[UUID | None, Header(alias="X-Demo-Session")] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    """Document supported session headers; enforcement is implemented later."""


IdempotencyKey = Annotated[
    str,
    Header(
        alias="Idempotency-Key",
        min_length=8,
        max_length=128,
        pattern=r"^[A-Za-z0-9._:-]+$",
    ),
]
