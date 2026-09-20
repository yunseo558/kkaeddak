"""OpenAI adapter tests without external network or credentials."""

import json
from collections.abc import Mapping
from typing import Any

import pytest
from pydantic import SecretStr

from kkaeddak.core.config import Settings
from kkaeddak.domain.enums import LocationMode
from kkaeddak.main import create_app
from kkaeddak.services.ai import (
    ExplanationAiRequest,
    PersonalizedWakePlanAiRequest,
    PreparationAiRequest,
    PreparationCandidate,
    ScheduleCategoryCandidate,
    ScheduleClassificationAiRequest,
)
from kkaeddak.services.openai_provider import (
    OPENAI_RESPONSES_URL,
    OpenAIResponsesProvider,
    UrllibResponsesTransport,
    _output_text,
)


def _response(value: Mapping[str, Any], *, direct: bool = False) -> dict[str, Any]:
    text = json.dumps(value, ensure_ascii=False)
    if direct:
        return {"output_text": text}
    return {
        "output": [
            {
                "type": "message",
                "content": [{"type": "output_text", "text": text}],
            }
        ]
    }


class RecordingTransport:
    def __init__(self, *responses: Mapping[str, Any]) -> None:
        self.responses = list(responses)
        self.calls: list[dict[str, Any]] = []

    async def post_json(
        self,
        *,
        url: str,
        headers: Mapping[str, str],
        body: Mapping[str, Any],
        timeout_seconds: float,
    ) -> Mapping[str, Any]:
        self.calls.append(
            {
                "url": url,
                "headers": dict(headers),
                "body": dict(body),
                "timeout_seconds": timeout_seconds,
            }
        )
        return self.responses.pop(0)


def _provider(transport: RecordingTransport) -> OpenAIResponsesProvider:
    return OpenAIResponsesProvider(
        api_key=SecretStr("test-secret"),
        model_name="test-model",
        timeout_seconds=4.5,
        transport=transport,
    )


@pytest.mark.anyio
async def test_schedule_classification_uses_strict_private_response_request() -> None:
    transport = RecordingTransport(_response({"category_code": "IMPORTANT", "confidence": 0.93}))
    provider = _provider(transport)

    result = await provider.classify_schedule(
        ScheduleClassificationAiRequest(
            title="카카오 인턴 1차 인터뷰",
            categories=[
                ScheduleCategoryCandidate(code="CLASS", label="수업"),
                ScheduleCategoryCandidate(code="IMPORTANT", label="시험·면접"),
                ScheduleCategoryCandidate(code="OTHER", label="기타", is_fallback=True),
            ],
        )
    )

    assert result == {"category_code": "IMPORTANT", "confidence": 0.93}
    call = transport.calls[0]
    assert call["url"] == OPENAI_RESPONSES_URL
    assert call["headers"]["Authorization"] == "Bearer test-secret"
    assert call["timeout_seconds"] == 4.5
    assert call["body"]["model"] == "test-model"
    assert call["body"]["store"] is False
    assert "test-secret" not in json.dumps(call["body"])
    output_format = call["body"]["text"]["format"]
    assert output_format["strict"] is True
    assert output_format["schema"]["properties"]["category_code"]["enum"] == [
        "CLASS",
        "IMPORTANT",
        "OTHER",
    ]


@pytest.mark.anyio
async def test_provider_explains_and_selects_only_candidate_tasks() -> None:
    transport = RecordingTransport(
        _response({"explanation": "최근 실패를 반영해 조금 더 일찍 시작해요."}, direct=True),
        _response({"suggestions": [{"code": "PACK_BAG", "label": "가방 미리 챙기기"}]}),
    )
    provider = _provider(transport)

    explanation = await provider.explain(
        ExplanationAiRequest(
            reason_codes=["RECENT_FIRST_ALARM_FAILURE"],
            plan_change_summary="첫 알람을 10분 앞당겼습니다.",
        )
    )
    suggestions = await provider.suggest_preparation(
        PreparationAiRequest(
            category="CLASS",
            location_mode=LocationMode.ONSITE,
            candidates=[PreparationCandidate(code="PACK_BAG", minutes=10)],
            max_suggestions=1,
        )
    )

    assert explanation["explanation"].startswith("최근 실패")
    assert suggestions == {"suggestions": [{"code": "PACK_BAG", "label": "가방 미리 챙기기"}]}
    suggestion_schema = transport.calls[1]["body"]["text"]["format"]["schema"]
    assert suggestion_schema["properties"]["suggestions"]["maxItems"] == 1


@pytest.mark.anyio
async def test_provider_requests_a_structured_personalized_wake_plan() -> None:
    expected = {
        "fatigue_score": 61,
        "fatigue_level": "MEDIUM",
        "alarm_offsets_min": [0, 10, 20],
        "reason_codes": ["SHORTER_REST_THAN_BASELINE"],
        "explanation": "수면이 평소보다 짧아 첫 알람을 20분 앞당겼어요.",
        "confidence": 0.86,
        "requires_review": True,
    }
    transport = RecordingTransport(_response(expected))
    provider = _provider(transport)

    result = await provider.personalize_wake_plan(
        PersonalizedWakePlanAiRequest(
            external_ai_consent=True,
            category="CLASS",
            importance="NORMAL",
            event_hour=11,
            base_wake_lead_min=60,
            rest_minutes=360,
            usual_rest_minutes=420,
            activity_level="moderate",
            condition_level="normal",
            recent_on_time_count=3,
            recent_late_count=1,
            recent_missed_count=0,
            recent_average_alarm_steps=2,
            learning_days=8,
            preferred_alarm_count=2,
            preferred_interval_min=10,
            keep_safety_alarm=True,
        )
    )

    assert result == expected
    schema = transport.calls[0]["body"]["text"]["format"]["schema"]
    assert schema["properties"]["fatigue_level"]["enum"] == [
        "LOW",
        "MEDIUM",
        "HIGH",
    ]


@pytest.mark.anyio
async def test_provider_rejects_missing_or_non_object_structured_output() -> None:
    missing = _provider(RecordingTransport({"output": []}))
    non_object = _provider(RecordingTransport({"output_text": "[]"}))
    payload = ExplanationAiRequest(
        reason_codes=["LIMITED_HISTORY"],
        plan_change_summary="사용자 확인을 유지합니다.",
    )

    with pytest.raises(ValueError, match="no output text"):
        await missing.explain(payload)
    with pytest.raises(ValueError, match="must be a JSON object"):
        await non_object.explain(payload)


def test_output_text_skips_unrelated_response_items() -> None:
    response = {
        "output": [
            {"type": "reasoning"},
            {"type": "message", "content": "invalid"},
            {"type": "message", "content": [{"type": "refusal"}]},
        ]
    }
    with pytest.raises(ValueError, match="no output text"):
        _output_text(response)
    with pytest.raises(ValueError, match="no output"):
        _output_text({})


class _UrlResponse:
    def __init__(self, payload: object) -> None:
        self.payload = payload

    def __enter__(self) -> "_UrlResponse":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode()


@pytest.mark.anyio
async def test_urllib_transport_posts_json(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    def fake_urlopen(request: Any, timeout: float) -> _UrlResponse:
        captured.update({"request": request, "timeout": timeout})
        return _UrlResponse({"output_text": "{}"})

    monkeypatch.setattr("kkaeddak.services.openai_provider.urlopen", fake_urlopen)
    result = await UrllibResponsesTransport().post_json(
        url=OPENAI_RESPONSES_URL,
        headers={"Authorization": "Bearer secret"},
        body={"store": False},
        timeout_seconds=3,
    )

    assert result == {"output_text": "{}"}
    assert captured["timeout"] == 3
    assert json.loads(captured["request"].data) == {"store": False}


@pytest.mark.anyio
async def test_urllib_transport_rejects_non_object_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "kkaeddak.services.openai_provider.urlopen",
        lambda *_args, **_kwargs: _UrlResponse([]),
    )
    with pytest.raises(ValueError, match="must be a JSON object"):
        await UrllibResponsesTransport().post_json(
            url=OPENAI_RESPONSES_URL,
            headers={},
            body={},
            timeout_seconds=3,
        )


def test_create_app_wires_provider_only_when_settings_are_complete() -> None:
    without_provider = create_app(
        Settings(database_url="sqlite+aiosqlite:///:memory:", _env_file=None)
    )
    configured = create_app(
        Settings(
            database_url="sqlite+aiosqlite:///:memory:",
            openai_api_key="test-secret",
            openai_model="test-model",
            _env_file=None,
        )
    )

    assert without_provider.state.ai_provider is None
    assert isinstance(configured.state.ai_provider, OpenAIResponsesProvider)
