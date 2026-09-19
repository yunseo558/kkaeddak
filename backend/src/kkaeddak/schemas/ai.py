"""Server-side explanation contracts with privacy-limited inputs."""

from pydantic import Field

from kkaeddak.domain.enums import ExplanationSource
from kkaeddak.schemas.common import APIModel, Code


class ExplanationCreate(APIModel):
    reason_codes: list[Code] = Field(min_length=1, max_length=10)
    plan_change_summary: str = Field(min_length=1, max_length=300)


class ExplanationResponse(APIModel):
    explanation: str = Field(min_length=1, max_length=500)
    source: ExplanationSource


class ScheduleCategoryCandidate(APIModel):
    code: Code
    label: str = Field(min_length=1, max_length=30)
    is_fallback: bool = False


class ScheduleClassificationCreate(APIModel):
    title: str = Field(min_length=1, max_length=100)
    categories: list[ScheduleCategoryCandidate] = Field(min_length=1, max_length=20)


class ScheduleClassificationResponse(APIModel):
    category_code: Code
    confidence: float = Field(ge=0, le=1)
    source: ExplanationSource
