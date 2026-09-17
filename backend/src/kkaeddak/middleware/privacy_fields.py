"""Reject raw health and sensor fields before request validation or persistence."""

import json
import re
from typing import Any

from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

FORBIDDEN_FIELD_NAMES = frozenset(
    {
        "accelerometer",
        "acceleration",
        "audio",
        "bedtime",
        "gyroscope",
        "healthKitData",
        "heartRate",
        "heartRateSeries",
        "heartRateVariability",
        "hrv",
        "latitude",
        "locationHistory",
        "longitude",
        "menstrualCycle",
        "menstrualRecords",
        "microphone",
        "movementSeries",
        "periodRecords",
        "personalModelParameters",
        "preciseLocation",
        "rawHealthData",
        "screenStateEvents",
        "screenUsage",
        "sensorEvents",
        "sleepDuration",
        "sleepHours",
        "sleepStages",
        "sleepTimeSeries",
        "stepCount",
        "stepSeries",
        "symptomRecords",
        "wakeDifficultyScore",
    }
)


def _normalize_field_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.casefold())


_NORMALIZED_FORBIDDEN_FIELDS = {
    _normalize_field_name(field): field for field in FORBIDDEN_FIELD_NAMES
}

_FORBIDDEN_PREFIXES = (
    ("rawhealth", "rawHealthData"),
    ("rawsensor", "sensorEvents"),
    ("sleep", "sleepTimeSeries"),
    ("heartrate", "heartRate"),
    ("hrv", "hrv"),
    ("menstrual", "menstrualRecords"),
    ("menstruation", "menstrualRecords"),
    ("period", "periodRecords"),
    ("symptom", "symptomRecords"),
    ("accelerometer", "accelerometer"),
    ("acceleration", "acceleration"),
    ("gyroscope", "gyroscope"),
    ("microphone", "microphone"),
    ("audio", "audio"),
    ("movement", "movementSeries"),
    ("stepcount", "stepCount"),
    ("stepseries", "stepSeries"),
    ("screenusage", "screenUsage"),
    ("screenstate", "screenStateEvents"),
    ("sensorevent", "sensorEvents"),
    ("latitude", "latitude"),
    ("longitude", "longitude"),
    ("gps", "preciseLocation"),
    ("wakedifficulty", "wakeDifficultyScore"),
    ("personalmodel", "personalModelParameters"),
)


def _canonical_forbidden_field(key: str) -> str | None:
    normalized = _normalize_field_name(key)
    exact = _NORMALIZED_FORBIDDEN_FIELDS.get(normalized)
    if exact is not None:
        return exact
    return next(
        (canonical for prefix, canonical in _FORBIDDEN_PREFIXES if normalized.startswith(prefix)),
        None,
    )


def find_forbidden_fields(value: Any) -> set[str]:
    """Return canonical forbidden names found anywhere in a JSON-compatible value."""
    found: set[str] = set()
    pending = [value]
    while pending:
        current = pending.pop()
        if isinstance(current, dict):
            for key, nested in current.items():
                if isinstance(key, str):
                    canonical = _canonical_forbidden_field(key)
                    if canonical is not None:
                        found.add(canonical)
                pending.append(nested)
        elif isinstance(current, list):
            pending.extend(current)
    return found


async def _read_body(receive: Receive) -> bytes:
    chunks: list[bytes] = []
    more_body = True
    while more_body:
        message = await receive()
        if message["type"] == "http.disconnect":
            break
        chunks.append(message.get("body", b""))
        more_body = message.get("more_body", False)
    return b"".join(chunks)


def _replay_body(body: bytes) -> Receive:
    sent = False

    async def receive() -> Message:
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        return {"type": "http.request", "body": b"", "more_body": False}

    return receive


class PrivacyFieldMiddleware:
    """Block explicitly forbidden JSON keys without retaining request values."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") not in {"POST", "PUT", "PATCH"}:
            await self.app(scope, receive, send)
            return

        content_type = Headers(scope=scope).get("content-type", "").split(";", 1)[0].strip()
        if content_type != "application/json" and not content_type.endswith("+json"):
            await self.app(scope, receive, send)
            return

        body = await _read_body(receive)
        forbidden: set[str] = set()
        try:
            parsed = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            parsed = None
        if parsed is not None:
            forbidden = find_forbidden_fields(parsed)

        if forbidden:
            request_id = scope.get("state", {}).get("request_id", "unknown")
            response = JSONResponse(
                status_code=422,
                content={
                    "error": {
                        "code": "PRIVACY_FIELD_NOT_ALLOWED",
                        "message": "Raw health and sensor fields are not accepted by this API.",
                        "requestId": request_id,
                        "details": {"fields": sorted(forbidden)},
                    }
                },
            )
            await response(scope, _replay_body(body), send)
            return

        await self.app(scope, _replay_body(body), send)
