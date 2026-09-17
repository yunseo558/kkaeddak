"""Shared schema configuration and validated scalar types."""

from datetime import UTC, datetime
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AfterValidator, BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class APIModel(BaseModel):
    """Strict camelCase JSON model used at the HTTP boundary."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        extra="forbid",
        populate_by_name=True,
        str_strip_whitespace=True,
    )


def _validate_timezone(value: str) -> str:
    try:
        ZoneInfo(value)
    except ZoneInfoNotFoundError as exc:
        raise ValueError("timezone must be a valid IANA timezone") from exc
    return value


def _validate_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("datetime must include a timezone offset")
    if value.utcoffset() != UTC.utcoffset(value):
        raise ValueError("datetime must use UTC")
    return value


TimezoneName = Annotated[
    str,
    Field(min_length=1, max_length=64, examples=["Asia/Seoul"]),
    AfterValidator(_validate_timezone),
]
UtcDatetime = Annotated[datetime, AfterValidator(_validate_utc)]
Locale = Annotated[str, Field(pattern=r"^[a-z]{2,3}(?:-[A-Z]{2})?$", examples=["ko-KR"])]
Code = Annotated[
    str,
    Field(pattern=r"^[A-Z][A-Z0-9_]{1,63}$", examples=["PACK_BAG"]),
]
Cursor = Annotated[str, Field(min_length=1, max_length=512)]


class AcceptedResponse(APIModel):
    accepted: bool = True


class RevisionResponse(APIModel):
    revision: int = Field(ge=1)
    updated_at: UtcDatetime


class CursorPage(APIModel):
    next_cursor: Cursor | None = None
