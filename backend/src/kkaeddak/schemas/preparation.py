"""Preparation suggestion and task contracts."""

from uuid import UUID

from pydantic import Field

from kkaeddak.domain.enums import PrepStatus
from kkaeddak.schemas.common import APIModel, Code, UtcDatetime


class RoutineTaskCandidate(APIModel):
    code: Code
    minutes: int = Field(ge=1, le=180)
    movable_to_night: bool


class PreparationSuggestionCreate(APIModel):
    event_id: UUID
    available_routine_tasks: list[RoutineTaskCandidate] = Field(max_length=30)
    max_suggestions: int = Field(default=3, ge=1, le=10)


class PreparationSuggestion(APIModel):
    id: UUID
    code: Code
    label: str = Field(min_length=1, max_length=80)
    minutes_saved: int = Field(ge=1, le=180)
    source: Code
    status: PrepStatus
    revision: int = Field(ge=1)


class PreparationSuggestionsResponse(APIModel):
    suggestions: list[PreparationSuggestion]
    total_potential_minutes: int = Field(ge=0)


class PreparationTaskUpdate(APIModel):
    status: PrepStatus
    revision: int = Field(ge=1)


class PreparationTaskResponse(APIModel):
    id: UUID
    status: PrepStatus
    revision: int = Field(ge=1)
    updated_at: UtcDatetime
