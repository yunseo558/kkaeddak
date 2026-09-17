"""Enumerations fixed by the backend API contract."""

from enum import StrEnum


class AutomationMode(StrEnum):
    RECOMMEND_ONLY = "RECOMMEND_ONLY"
    AUTO_ROUTINE_DAYS = "AUTO_ROUTINE_DAYS"
    AUTO_EXCEPT_IMPORTANT = "AUTO_EXCEPT_IMPORTANT"


class Importance(StrEnum):
    NORMAL = "NORMAL"
    IMPORTANT = "IMPORTANT"
    CRITICAL = "CRITICAL"


class LocationMode(StrEnum):
    REMOTE = "REMOTE"
    ONSITE = "ONSITE"
    UNKNOWN = "UNKNOWN"


class PlanStatus(StrEnum):
    DRAFT = "DRAFT"
    PROPOSED = "PROPOSED"
    APPROVED = "APPROVED"
    EDITED = "EDITED"
    DECLINED = "DECLINED"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class PrepStatus(StrEnum):
    SUGGESTED = "SUGGESTED"
    ACCEPTED = "ACCEPTED"
    COMPLETED = "COMPLETED"
    SKIPPED = "SKIPPED"


class WakeOutcome(StrEnum):
    CONFIRMED_ON_TIME = "CONFIRMED_ON_TIME"
    CONFIRMED_LATE = "CONFIRMED_LATE"
    UNCONFIRMED = "UNCONFIRMED"
    USER_CANCELLED = "USER_CANCELLED"


class WakeState(StrEnum):
    IDLE = "IDLE"
    RINGING = "RINGING"
    DISMISSED = "DISMISSED"
    ACTIVE_CANDIDATE = "ACTIVE_CANDIDATE"
    CONFIRMED = "CONFIRMED"
    ESCALATING = "ESCALATING"
    FINISHED = "FINISHED"


class PlanDecision(StrEnum):
    APPROVE = "APPROVE"
    EDIT = "EDIT"
    DECLINE = "DECLINE"


class ExplanationSource(StrEnum):
    TEMPLATE = "TEMPLATE"
    MODEL = "MODEL"
