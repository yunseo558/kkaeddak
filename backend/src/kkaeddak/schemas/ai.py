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
