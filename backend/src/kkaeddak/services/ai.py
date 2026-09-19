"""Privacy-limited AI orchestration with validated deterministic fallbacks."""

import hashlib
import logging
from collections.abc import Sequence
from time import monotonic
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from kkaeddak.db.models import AiExecution
from kkaeddak.db.repositories import AiExecutionRepository
from kkaeddak.domain.enums import ExplanationSource, LocationMode

logger = logging.getLogger(__name__)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class PreparationCandidate(StrictModel):
    code: str = Field(pattern=r"^[A-Z][A-Z0-9_]{1,63}$")
    minutes: int = Field(ge=1, le=180)


class PreparationAiRequest(StrictModel):
    category: str = Field(pattern=r"^[A-Z][A-Z0-9_]{1,63}$")
    location_mode: LocationMode
    candidates: list[PreparationCandidate] = Field(min_length=1, max_length=30)
    max_suggestions: int = Field(ge=1, le=10)


class PreparationChoice(StrictModel):
    code: str = Field(pattern=r"^[A-Z][A-Z0-9_]{1,63}$")
    label: str = Field(min_length=1, max_length=80)

    @field_validator("label")
    @classmethod
    def validate_safe_label(cls, value: str) -> str:
        return _validate_display_text(value)


class PreparationAiResponse(StrictModel):
    suggestions: list[PreparationChoice] = Field(min_length=1, max_length=10)


class ExplanationAiRequest(StrictModel):
    reason_codes: list[str] = Field(min_length=1, max_length=10)
    plan_change_summary: str = Field(min_length=1, max_length=300)


class ExplanationAiResponse(StrictModel):
    explanation: str = Field(min_length=1, max_length=500)

    @field_validator("explanation")
    @classmethod
    def validate_safe_explanation(cls, value: str) -> str:
        return _validate_display_text(value)


class ScheduleCategoryCandidate(StrictModel):
    code: str = Field(pattern=r"^[A-Z][A-Z0-9_]{1,63}$")
    label: str = Field(min_length=1, max_length=30)
    is_fallback: bool = False


class ScheduleClassificationAiRequest(StrictModel):
    title: str = Field(min_length=1, max_length=100)
    categories: list[ScheduleCategoryCandidate] = Field(min_length=1, max_length=20)

    @field_validator("title")
    @classmethod
    def validate_safe_title(cls, value: str) -> str:
        return _validate_display_text(value)


class ScheduleClassificationAiResponse(StrictModel):
    category_code: str = Field(pattern=r"^[A-Z][A-Z0-9_]{1,63}$")
    confidence: float = Field(ge=0, le=1)


class AiProvider(Protocol):
    """Vendor-neutral provider that receives only privacy-limited structured inputs."""

    model_name: str

    async def suggest_preparation(self, payload: PreparationAiRequest) -> Any: ...

    async def explain(self, payload: ExplanationAiRequest) -> Any: ...

    async def classify_schedule(self, payload: ScheduleClassificationAiRequest) -> Any: ...


def _validate_display_text(value: str) -> str:
    if "<" in value or ">" in value or any(ord(character) < 32 for character in value):
        raise ValueError("display text contains disallowed characters")
    return value


PREPARATION_LABELS = {
    "PACK_BAG": "가방 미리 준비하기",
    "SHOWER": "전날 샤워하기",
    "PREPARE_CLOTHES": "입을 옷 미리 준비하기",
    "PREPARE_BREAKFAST": "아침 식사 미리 준비하기",
    "CHARGE_DEVICES": "기기 미리 충전하기",
}

REASON_TEMPLATES = {
    "SHORTER_SLEEP_THAN_BASELINE": "평소보다 수면 시간이 짧은 상황을 반영했어요.",
    "RECENT_FIRST_ALARM_FAILURE": "최근 첫 알람만으로 기상이 어려웠던 기록을 반영했어요.",
    "IMPORTANT_EVENT": "중요 일정의 최종 안전 알람을 유지했어요.",
    "EARLY_SCHEDULE": "이른 일정에 맞춰 알람 계획을 조정했어요.",
    "LIMITED_HISTORY": "학습 이력이 충분하지 않아 사용자 확인을 우선했어요.",
}

CATEGORY_HINTS = {
    "CLASS": ("수업", "강의", "세미나", "특강", "전공", "교양"),
    "WORK": ("출근", "근무", "회의", "미팅", "프로젝트", "업무"),
    "IMPORTANT": ("시험", "면접", "인터뷰", "발표", "공모전", "오디션"),
    "APPOINTMENT": ("약속", "브런치", "점심", "저녁", "병원", "진료", "예약"),
    "EXERCISE": ("운동", "헬스", "러닝", "요가", "필라테스", "PT"),
}


def preparation_template(
    candidates: Sequence[PreparationCandidate],
    max_suggestions: int,
) -> list[PreparationChoice]:
    return [
        PreparationChoice(
            code=candidate.code,
            label=PREPARATION_LABELS.get(
                candidate.code,
                candidate.code.replace("_", " ").title(),
            ),
        )
        for candidate in candidates[:max_suggestions]
    ]


def explanation_template(payload: ExplanationAiRequest) -> str:
    reasons = [
        REASON_TEMPLATES.get(code, "선택한 기상 요인을 계획에 반영했어요.")
        for code in payload.reason_codes
    ]
    message = " ".join([*reasons, f"계획 변경: {payload.plan_change_summary}"])
    return message[:500]


def schedule_classification_template(
    payload: ScheduleClassificationAiRequest,
) -> ScheduleClassificationAiResponse:
    title = payload.title.casefold()
    for candidate in payload.categories:
        label = candidate.label.casefold()
        if label in title or any(token in title for token in label.split() if len(token) >= 2):
            return ScheduleClassificationAiResponse(
                category_code=candidate.code,
                confidence=0.96,
            )
    for candidate in payload.categories:
        if any(hint.casefold() in title for hint in CATEGORY_HINTS.get(candidate.code, ())):
            return ScheduleClassificationAiResponse(
                category_code=candidate.code,
                confidence=0.9,
            )
    fallback = next(
        (candidate for candidate in payload.categories if candidate.is_fallback),
        payload.categories[0],
    )
    return ScheduleClassificationAiResponse(
        category_code=fallback.code,
        confidence=0.35,
    )


class AiService:
    """Call an optional provider and fall back without exposing request content in logs."""

    def __init__(
        self,
        database: AsyncSession,
        provider: AiProvider | None,
    ) -> None:
        self.database = database
        self.provider = provider

    async def _record(
        self,
        *,
        feature: str,
        payload: BaseModel,
        started_at: float,
        status: str,
    ) -> None:
        digest = hashlib.sha256(payload.model_dump_json().encode()).hexdigest()
        await AiExecutionRepository(self.database).add(
            AiExecution(
                feature=feature,
                model=self.provider.model_name if self.provider is not None else None,
                latency_ms=max(0, round((monotonic() - started_at) * 1000)),
                status=status,
                token_count=None,
                redacted_hash=digest,
            )
        )

    async def suggest_preparation(
        self,
        payload: PreparationAiRequest,
    ) -> tuple[list[PreparationChoice], ExplanationSource]:
        started_at = monotonic()
        if self.provider is not None:
            try:
                raw = await self.provider.suggest_preparation(payload)
                result = PreparationAiResponse.model_validate(raw)
                allowed_codes = {candidate.code for candidate in payload.candidates}
                result_codes = [item.code for item in result.suggestions]
                if (
                    len(result_codes) != len(set(result_codes))
                    or not set(result_codes) <= allowed_codes
                    or len(result_codes) > payload.max_suggestions
                ):
                    raise ValueError
            except Exception:
                pass
            else:
                await self._record(
                    feature="PREPARATION_SUGGESTION",
                    payload=payload,
                    started_at=started_at,
                    status="MODEL",
                )
                return result.suggestions, ExplanationSource.MODEL

        if self.provider is not None:
            logger.warning(
                "AI provider unavailable; template fallback used",
                extra={"feature": "PREPARATION_SUGGESTION"},
            )
        await self._record(
            feature="PREPARATION_SUGGESTION",
            payload=payload,
            started_at=started_at,
            status="FALLBACK",
        )
        return (
            preparation_template(payload.candidates, payload.max_suggestions),
            ExplanationSource.TEMPLATE,
        )

    async def explain(
        self,
        payload: ExplanationAiRequest,
    ) -> tuple[str, ExplanationSource]:
        started_at = monotonic()
        if self.provider is not None:
            try:
                raw = await self.provider.explain(payload)
                result = ExplanationAiResponse.model_validate(raw)
            except Exception:
                pass
            else:
                await self._record(
                    feature="EXPLANATION",
                    payload=payload,
                    started_at=started_at,
                    status="MODEL",
                )
                return result.explanation, ExplanationSource.MODEL

        if self.provider is not None:
            logger.warning(
                "AI provider unavailable; template fallback used",
                extra={"feature": "EXPLANATION"},
            )
        await self._record(
            feature="EXPLANATION",
            payload=payload,
            started_at=started_at,
            status="FALLBACK",
        )
        return explanation_template(payload), ExplanationSource.TEMPLATE

    async def classify_schedule(
        self,
        payload: ScheduleClassificationAiRequest,
    ) -> tuple[ScheduleClassificationAiResponse, ExplanationSource]:
        started_at = monotonic()
        classifier = getattr(self.provider, "classify_schedule", None)
        if classifier is not None:
            try:
                raw = await classifier(payload)
                result = ScheduleClassificationAiResponse.model_validate(raw)
                allowed_codes = {candidate.code for candidate in payload.categories}
                if result.category_code not in allowed_codes:
                    raise ValueError
            except Exception:
                pass
            else:
                await self._record(
                    feature="SCHEDULE_CLASSIFICATION",
                    payload=payload,
                    started_at=started_at,
                    status="MODEL",
                )
                return result, ExplanationSource.MODEL

        if self.provider is not None:
            logger.warning(
                "AI provider unavailable; schedule classification fallback used",
                extra={"feature": "SCHEDULE_CLASSIFICATION"},
            )
        await self._record(
            feature="SCHEDULE_CLASSIFICATION",
            payload=payload,
            started_at=started_at,
            status="FALLBACK",
        )
        return schedule_classification_template(payload), ExplanationSource.TEMPLATE
