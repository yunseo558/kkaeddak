"""Privacy-limited AI orchestration with validated deterministic fallbacks."""

import hashlib
import logging
from collections.abc import Sequence
from time import monotonic
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from kkaeddak.db.models import AiExecution
from kkaeddak.db.repositories import AiExecutionRepository
from kkaeddak.domain.enums import ExplanationSource, Importance, LocationMode

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


FatigueLevel = Literal["LOW", "MEDIUM", "HIGH"]
ActivityLevel = Literal["low", "moderate", "high"]
ConditionLevel = Literal["low", "normal", "high"]

WAKE_PLAN_REASON_CODES = frozenset(
    {
        "SHORTER_REST_THAN_BASELINE",
        "RECENT_WAKE_FAILURE",
        "IMPORTANT_EVENT",
        "EARLY_SCHEDULE",
        "HIGH_ACTIVITY",
        "LOW_CONDITION",
        "LIMITED_HISTORY",
        "STABLE_WAKE_PATTERN",
        "USER_ALARM_PREFERENCE",
    }
)


class PersonalizedWakePlanAiRequest(StrictModel):
    """Aggregated health signals only; raw health samples stay local."""

    category: str = Field(pattern=r"^[A-Z][A-Z0-9_]{1,63}$")
    external_ai_consent: Literal[True]
    importance: Importance
    event_hour: int = Field(ge=0, le=23)
    base_wake_lead_min: int = Field(ge=15, le=300)
    rest_minutes: int | None = Field(default=None, ge=0, le=960)
    usual_rest_minutes: int | None = Field(default=None, ge=180, le=720)
    activity_level: ActivityLevel | None = None
    condition_level: ConditionLevel | None = None
    recent_on_time_count: int = Field(ge=0, le=14)
    recent_late_count: int = Field(ge=0, le=14)
    recent_missed_count: int = Field(ge=0, le=14)
    recent_average_alarm_steps: float = Field(ge=0, le=5)
    learning_days: int = Field(ge=0, le=365)
    preferred_alarm_count: int = Field(ge=1, le=5)
    preferred_interval_min: int = Field(ge=3, le=30)
    keep_safety_alarm: bool


class PersonalizedWakePlanAiResponse(StrictModel):
    fatigue_score: int = Field(ge=0, le=100)
    fatigue_level: FatigueLevel
    alarm_offsets_min: list[int] = Field(min_length=1, max_length=4)
    reason_codes: list[str] = Field(min_length=1, max_length=8)
    explanation: str = Field(min_length=1, max_length=500)
    confidence: float = Field(ge=0, le=1)
    requires_review: bool

    @field_validator("alarm_offsets_min")
    @classmethod
    def validate_alarm_offsets(cls, value: list[int]) -> list[int]:
        if value[0] != 0 or value != sorted(set(value)) or value[-1] > 90:
            raise ValueError("alarm offsets must be unique, sorted, start at 0, and end by 90")
        return value

    @field_validator("reason_codes")
    @classmethod
    def validate_reason_codes(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)) or not set(value) <= WAKE_PLAN_REASON_CODES:
            raise ValueError("wake-plan reason codes must be unique and allow-listed")
        return value

    @field_validator("explanation")
    @classmethod
    def validate_safe_explanation(cls, value: str) -> str:
        return _validate_display_text(value)


class AiProvider(Protocol):
    """Vendor-neutral provider that receives only privacy-limited structured inputs."""

    model_name: str

    async def suggest_preparation(self, payload: PreparationAiRequest) -> Any: ...

    async def explain(self, payload: ExplanationAiRequest) -> Any: ...

    async def classify_schedule(self, payload: ScheduleClassificationAiRequest) -> Any: ...

    async def personalize_wake_plan(self, payload: PersonalizedWakePlanAiRequest) -> Any: ...


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


def personalized_wake_plan_template(
    payload: PersonalizedWakePlanAiRequest,
) -> PersonalizedWakePlanAiResponse:
    """Safe, explainable fallback when the external model is unavailable."""

    history_total = (
        payload.recent_on_time_count + payload.recent_late_count + payload.recent_missed_count
    )
    score = 20
    reasons: list[str] = []
    if payload.rest_minutes is not None and payload.usual_rest_minutes is not None:
        shortfall = payload.usual_rest_minutes - payload.rest_minutes
        if shortfall >= 30:
            score += min(35, 10 + shortfall // 10)
            reasons.append("SHORTER_REST_THAN_BASELINE")
    else:
        score += 10
        reasons.append("LIMITED_HISTORY")
    if payload.recent_late_count or payload.recent_missed_count:
        score += min(25, payload.recent_late_count * 5 + payload.recent_missed_count * 10)
        reasons.append("RECENT_WAKE_FAILURE")
    elif history_total >= 4:
        score = max(10, score - 10)
        reasons.append("STABLE_WAKE_PATTERN")
    elif "LIMITED_HISTORY" not in reasons:
        reasons.append("LIMITED_HISTORY")
    if payload.activity_level == "high":
        score += 10
        reasons.append("HIGH_ACTIVITY")
    if payload.condition_level == "low":
        score += 15
        reasons.append("LOW_CONDITION")
    if payload.importance is not Importance.NORMAL:
        score += 10
        reasons.append("IMPORTANT_EVENT")
    if payload.event_hour <= 8:
        score += 5
        reasons.append("EARLY_SCHEDULE")

    score = max(0, min(100, score))
    level: FatigueLevel = "LOW" if score < 35 else "MEDIUM" if score < 65 else "HIGH"
    failure_count = payload.recent_late_count + payload.recent_missed_count
    alarm_count = min(
        5,
        max(
            payload.preferred_alarm_count,
            3 if level == "HIGH" or failure_count >= 2 else 2 if level == "MEDIUM" else 1,
            2 if payload.keep_safety_alarm else 1,
        ),
    )
    interval = payload.preferred_interval_min
    offsets = [interval * index for index in range(alarm_count)]
    if offsets[-1] > 90:
        interval = max(3, 90 // max(1, alarm_count - 1))
        offsets = [interval * index for index in range(alarm_count)]
    reasons.append("USER_ALARM_PREFERENCE")
    reason_text = {
        "LOW": "최근 기상 흐름이 안정적이라 필요한 알람만 배치했어요.",
        "MEDIUM": "수면과 최근 기상 기록을 반영해 예비 알람을 함께 배치했어요.",
        "HIGH": "피로 신호와 최근 기상 실패를 반영해 더 일찍, 여러 번 울리도록 했어요.",
    }[level]
    return PersonalizedWakePlanAiResponse(
        fatigue_score=score,
        fatigue_level=level,
        alarm_offsets_min=offsets,
        reason_codes=list(dict.fromkeys(reasons)),
        explanation=reason_text,
        confidence=0.45 if history_total < 4 else 0.68,
        requires_review=history_total < 10 or level == "HIGH",
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

    async def personalize_wake_plan(
        self,
        payload: PersonalizedWakePlanAiRequest,
    ) -> tuple[PersonalizedWakePlanAiResponse, ExplanationSource]:
        started_at = monotonic()
        planner = getattr(self.provider, "personalize_wake_plan", None)
        if planner is not None:
            try:
                raw = await planner(payload)
                result = PersonalizedWakePlanAiResponse.model_validate(raw)
            except Exception:
                pass
            else:
                await self._record(
                    feature="WAKE_PLAN_PERSONALIZATION",
                    payload=payload,
                    started_at=started_at,
                    status="MODEL",
                )
                return result, ExplanationSource.MODEL

        if self.provider is not None:
            logger.warning(
                "AI provider unavailable; personalized wake-plan fallback used",
                extra={"feature": "WAKE_PLAN_PERSONALIZATION"},
            )
        await self._record(
            feature="WAKE_PLAN_PERSONALIZATION",
            payload=payload,
            started_at=started_at,
            status="FALLBACK",
        )
        return personalized_wake_plan_template(payload), ExplanationSource.TEMPLATE
