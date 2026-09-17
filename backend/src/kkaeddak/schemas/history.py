"""Aggregate wake history contracts."""

from datetime import date

from pydantic import Field

from kkaeddak.schemas.common import APIModel


class HistorySummaryResponse(APIModel):
    from_date: date
    to_date: date
    total_sessions: int = Field(ge=0)
    on_time_sessions: int = Field(ge=0)
    late_sessions: int = Field(ge=0)
    unconfirmed_sessions: int = Field(ge=0)
    average_alarm_steps: float | None = Field(default=None, ge=0, le=5)
