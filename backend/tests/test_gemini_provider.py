"""Gemini adapter tests without external network or credentials."""

import json
from collections.abc import Mapping
from typing import Any

import pytest
from pydantic import SecretStr

from kkaeddak.core.config import Settings
from kkaeddak.main import create_app
from kkaeddak.services.ai import (
    PersonalizedWakePlanAiRequest,
    ScheduleCategoryCandidate,
    ScheduleClassificationAiRequest,
)
from kkaeddak.services.gemini_provider import (
    GEMINI_INTERACTIONS_URL,
    GeminiInteractionsProvider,
    UrllibGeminiTransport,
    _output_text,
)


def _response(value: Mapping[str, Any], *, direct: bool = False) -> dict[str, Any]:
    text = json.dumps(value, ensure_ascii=False)
    if direct:
        return {"output_text": text}
    return {
        "steps": [
            {"type": "reasoning"},
            {
                "type": "model_output",
                "content": [{"type": "text", "text": text}],
            },
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


def _provider(transport: RecordingTransport) -> GeminiInteractionsProvider:
    return GeminiInteractionsProvider(
        api_key=SecretStr("gemini-test-secret"),
        model_name="gemini-test-model",
        timeout_seconds=4.5,
        transport=transport,
    )


def _payload() -> PersonalizedWakePlanAiRequest:
    return PersonalizedWakePlanAiRequest(
        external_ai_consent=True,
        category="CLASS",
        importance="NORMAL",
        event_hour=11,
        base_wake_lead_min=60,
        rest_minutes=330,
        usual_rest_minutes=420,
        activity_level="high",
        condition_level="low",
        recent_on_time_count=2,
        recent_late_count=1,
        recent_missed_count=1,
        recent_average_alarm_steps=2.5,
        learning_days=6,
        preferred_alarm_count=2,
        preferred_interval_min=10,
        keep_safety_alarm=True,
    )


@pytest.mark.anyio
async def test_personalization_uses_private_structured_interaction() -> None:
    expected = {
        "fatigue_score": 72,
        "fatigue_level": "HIGH",
        "alarm_offsets_min": [0, 10, 25],
        "reason_codes": ["SHORTER_REST_THAN_BASELINE", "RECENT_WAKE_FAILURE"],
        "explanation": "요약 지표를 반영해 알람을 앞당겼어요.",
        "confidence": 0.91,
        "requires_review": True,
    }
    transport = RecordingTransport(_response(expected))
    result = await _provider(transport).personalize_wake_plan(_payload())

    assert result == expected
    call = transport.calls[0]
    assert call["url"] == GEMINI_INTERACTIONS_URL
    assert call["headers"]["x-goog-api-key"] == "gemini-test-secret"
    assert call["body"]["store"] is False
    assert call["body"]["model"] == "gemini-test-model"
    assert "gemini-test-secret" not in json.dumps(call["body"])
    assert call["body"]["response_format"]["mime_type"] == "application/json"
    schema = call["body"]["response_format"]["schema"]
    assert schema["properties"]["alarm_offsets_min"]["maxItems"] == 4
    sent = json.loads(call["body"]["input"])
    assert sent["rest_minutes"] == 330
    assert "title" not in sent


@pytest.mark.anyio
async def test_schedule_classification_uses_only_allowed_user_categories() -> None:
    expected = {"category_code": "IMPORTANT", "confidence": 0.94}
    transport = RecordingTransport(_response(expected))
    provider = _provider(transport)

    result = await provider.classify_schedule(
        ScheduleClassificationAiRequest(
            title="개인 면접 일정",
            categories=[
                ScheduleCategoryCandidate(code="IMPORTANT", label="시험·면접"),
                ScheduleCategoryCandidate(code="OTHER", label="기타", is_fallback=True),
            ],
        )
    )

    assert result == expected
    sent = json.loads(transport.calls[0]["body"]["input"])
    assert sent["title"] == "개인 면접 일정"
    schema = transport.calls[0]["body"]["response_format"]["schema"]
    assert schema["properties"]["category_code"]["enum"] == ["IMPORTANT", "OTHER"]


def test_output_text_reads_direct_and_step_responses() -> None:
    assert _output_text(_response({"ok": True}, direct=True)) == '{"ok": true}'
    assert json.loads(_output_text(_response({"ok": True}))) == {"ok": True}
    with pytest.raises(ValueError, match="no output steps"):
        _output_text({})
    with pytest.raises(ValueError, match="no output text"):
        _output_text({"steps": [{"type": "model_output", "content": []}]})


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
async def test_urllib_transport_posts_json_and_rejects_non_object(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    def fake_urlopen(request: Any, timeout: float) -> _UrlResponse:
        captured.update({"request": request, "timeout": timeout})
        return _UrlResponse({"output_text": "{}"})

    monkeypatch.setattr("kkaeddak.services.gemini_provider.urlopen", fake_urlopen)
    transport = UrllibGeminiTransport()
    result = await transport.post_json(
        url=GEMINI_INTERACTIONS_URL,
        headers={"x-goog-api-key": "secret"},
        body={"store": False},
        timeout_seconds=3,
    )
    assert result == {"output_text": "{}"}
    assert captured["timeout"] == 3
    assert json.loads(captured["request"].data) == {"store": False}

    monkeypatch.setattr(
        "kkaeddak.services.gemini_provider.urlopen",
        lambda *_args, **_kwargs: _UrlResponse([]),
    )
    with pytest.raises(ValueError, match="must be a JSON object"):
        await transport.post_json(
            url=GEMINI_INTERACTIONS_URL,
            headers={},
            body={},
            timeout_seconds=3,
        )


def test_create_app_prefers_gemini_when_configured() -> None:
    app = create_app(
        Settings(
            database_url="sqlite+aiosqlite:///:memory:",
            gemini_api_key="gemini-test-secret",
            openai_api_key="openai-test-secret",
            openai_model="openai-test-model",
            _env_file=None,
        )
    )

    assert isinstance(app.state.ai_provider, GeminiInteractionsProvider)
    assert app.state.ai_provider.model_name == "gemini-3.5-flash-lite"
