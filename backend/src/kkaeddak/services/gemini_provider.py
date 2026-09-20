"""Gemini Interactions API adapter with JSON Schema constrained outputs."""

import asyncio
import json
from collections.abc import Mapping
from typing import Any, Protocol
from urllib.request import Request, urlopen

from pydantic import SecretStr

from kkaeddak.services.ai import (
    ExplanationAiRequest,
    PersonalizedWakePlanAiRequest,
    PreparationAiRequest,
    ScheduleClassificationAiRequest,
)

GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"


class GeminiTransport(Protocol):
    async def post_json(
        self,
        *,
        url: str,
        headers: Mapping[str, str],
        body: Mapping[str, Any],
        timeout_seconds: float,
    ) -> Mapping[str, Any]: ...


class UrllibGeminiTransport:
    async def post_json(
        self,
        *,
        url: str,
        headers: Mapping[str, str],
        body: Mapping[str, Any],
        timeout_seconds: float,
    ) -> Mapping[str, Any]:
        return await asyncio.to_thread(self._post_json, url, headers, body, timeout_seconds)

    @staticmethod
    def _post_json(
        url: str,
        headers: Mapping[str, str],
        body: Mapping[str, Any],
        timeout_seconds: float,
    ) -> Mapping[str, Any]:
        request = Request(
            url,
            data=json.dumps(body, ensure_ascii=False).encode(),
            headers=dict(headers),
            method="POST",
        )
        with urlopen(request, timeout=timeout_seconds) as response:  # noqa: S310
            payload = json.loads(response.read())
        if not isinstance(payload, dict):
            raise ValueError("Gemini response must be a JSON object")
        return payload


def _output_text(response: Mapping[str, Any]) -> str:
    direct = response.get("output_text")
    if isinstance(direct, str) and direct:
        return direct
    steps = response.get("steps")
    if not isinstance(steps, list):
        raise ValueError("Gemini response has no output steps")
    texts: list[str] = []
    for step in steps:
        if not isinstance(step, dict) or step.get("type") != "model_output":
            continue
        content = step.get("content")
        if not isinstance(content, list):
            continue
        for part in content:
            if (
                isinstance(part, dict)
                and part.get("type") == "text"
                and isinstance(part.get("text"), str)
            ):
                texts.append(part["text"])
    if not texts:
        raise ValueError("Gemini response has no output text")
    return "".join(texts)


def _object_schema(properties: Mapping[str, Any], required: list[str]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": dict(properties),
        "required": required,
        "additionalProperties": False,
    }


class GeminiInteractionsProvider:
    """Send privacy-limited contracts to Gemini without storing interactions."""

    def __init__(
        self,
        *,
        api_key: SecretStr,
        model_name: str,
        timeout_seconds: float = 10.0,
        transport: GeminiTransport | None = None,
    ) -> None:
        self._api_key = api_key
        self.model_name = model_name
        self.timeout_seconds = timeout_seconds
        self._transport = transport or UrllibGeminiTransport()

    async def _structured_response(
        self,
        *,
        instructions: str,
        input_data: Mapping[str, Any],
        schema: Mapping[str, Any],
        max_output_tokens: int,
    ) -> Mapping[str, Any]:
        response = await self._transport.post_json(
            url=GEMINI_INTERACTIONS_URL,
            headers={
                "x-goog-api-key": self._api_key.get_secret_value(),
                "Content-Type": "application/json",
            },
            body={
                "model": self.model_name,
                "store": False,
                "system_instruction": instructions,
                "input": json.dumps(input_data, ensure_ascii=False),
                "generation_config": {"max_output_tokens": max_output_tokens},
                "response_format": {
                    "type": "text",
                    "mime_type": "application/json",
                    "schema": schema,
                },
            },
            timeout_seconds=self.timeout_seconds,
        )
        decoded = json.loads(_output_text(response))
        if not isinstance(decoded, dict):
            raise ValueError("Gemini structured output must be a JSON object")
        return decoded

    async def classify_schedule(
        self,
        payload: ScheduleClassificationAiRequest,
    ) -> Mapping[str, Any]:
        category_codes = [candidate.code for candidate in payload.categories]
        return await self._structured_response(
            instructions=(
                "Classify the calendar title into exactly one of the user-defined categories. "
                "Use only the supplied category code. Infer meaning from the title and category "
                "labels, and choose the fallback category when the meaning is genuinely unclear. "
                "Do not invent schedule details. Confidence must reflect classification certainty."
            ),
            input_data=payload.model_dump(mode="json"),
            schema=_object_schema(
                {
                    "category_code": {"type": "string", "enum": category_codes},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
                ["category_code", "confidence"],
            ),
            max_output_tokens=120,
        )

    async def explain(self, payload: ExplanationAiRequest) -> Mapping[str, Any]:
        return await self._structured_response(
            instructions=(
                "Explain the wake-plan decision in concise natural Korean using only the "
                "supplied reason codes and summary. Do not invent health facts."
            ),
            input_data=payload.model_dump(mode="json"),
            schema=_object_schema(
                {"explanation": {"type": "string", "minLength": 1, "maxLength": 500}},
                ["explanation"],
            ),
            max_output_tokens=240,
        )

    async def suggest_preparation(
        self,
        payload: PreparationAiRequest,
    ) -> Mapping[str, Any]:
        codes = [candidate.code for candidate in payload.candidates]
        return await self._structured_response(
            instructions=(
                "Select only useful preparation tasks from the supplied candidates. Never "
                "create a new code. Write short natural Korean labels."
            ),
            input_data=payload.model_dump(mode="json"),
            schema=_object_schema(
                {
                    "suggestions": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": payload.max_suggestions,
                        "items": _object_schema(
                            {
                                "code": {"type": "string", "enum": codes},
                                "label": {"type": "string", "minLength": 1, "maxLength": 80},
                            },
                            ["code", "label"],
                        ),
                    }
                },
                ["suggestions"],
            ),
            max_output_tokens=320,
        )

    async def personalize_wake_plan(
        self,
        payload: PersonalizedWakePlanAiRequest,
    ) -> Mapping[str, Any]:
        reason_codes = [
            "SHORTER_REST_THAN_BASELINE",
            "RECENT_WAKE_FAILURE",
            "IMPORTANT_EVENT",
            "EARLY_SCHEDULE",
            "HIGH_ACTIVITY",
            "LOW_CONDITION",
            "LIMITED_HISTORY",
            "STABLE_WAKE_PATTERN",
            "USER_ALARM_PREFERENCE",
        ]
        return await self._structured_response(
            instructions=(
                "You are the personalization engine for a wake-alarm service. Analyze fatigue "
                "only from the supplied aggregate signals; never make a medical diagnosis. "
                "Decide the first alarm start and number of alarms. alarm_offsets_min are "
                "minutes after the first alarm: unique ascending integers beginning with 0, "
                "at most four alarms and at most 90 minutes. Explain the decision in concise "
                "Korean using only the input. Require review for limited history, high fatigue, "
                "or important events."
            ),
            input_data=payload.model_dump(mode="json"),
            schema=_object_schema(
                {
                    "fatigue_score": {"type": "integer", "minimum": 0, "maximum": 100},
                    "fatigue_level": {
                        "type": "string",
                        "enum": ["LOW", "MEDIUM", "HIGH"],
                    },
                    "alarm_offsets_min": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 4,
                        "items": {"type": "integer", "minimum": 0, "maximum": 90},
                    },
                    "reason_codes": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 8,
                        "items": {"type": "string", "enum": reason_codes},
                    },
                    "explanation": {"type": "string", "minLength": 1, "maxLength": 500},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "requires_review": {"type": "boolean"},
                },
                [
                    "fatigue_score",
                    "fatigue_level",
                    "alarm_offsets_min",
                    "reason_codes",
                    "explanation",
                    "confidence",
                    "requires_review",
                ],
            ),
            max_output_tokens=420,
        )
