import type {
  ActiveWakePlan,
  WakeResult,
} from "@/features/current-flow/model/current-flow-store";

export type WakeMachineStateName =
  | "RINGING"
  | "DISMISSED"
  | "ACTIVE_CANDIDATE"
  | "ESCALATING"
  | "CONFIRMED";

export type WakeMachineState = {
  alarmStepsUsed: number;
  currentStepIndex: number;
  name: WakeMachineStateName;
};

export type WakeMachineEvent =
  | { type: "DISMISS_ALARM" }
  | { type: "START_ACTIVITY" }
  | { type: "SUSPECT_RESLEEP" }
  | { type: "TRIGGER_NEXT_ALARM" }
  | { type: "CONFIRM_WAKE" };

export function createInitialWakeMachine(): WakeMachineState {
  return { alarmStepsUsed: 0, currentStepIndex: 0, name: "RINGING" };
}

export function transitionWakeMachine(
  state: WakeMachineState,
  event: WakeMachineEvent,
  totalSteps: number,
): WakeMachineState {
  switch (state.name) {
    case "RINGING":
      return event.type === "DISMISS_ALARM"
        ? {
            ...state,
            alarmStepsUsed: Math.max(
              state.alarmStepsUsed,
              state.currentStepIndex + 1,
            ),
            name: "DISMISSED",
          }
        : state;
    case "DISMISSED":
      if (event.type === "START_ACTIVITY") {
        return { ...state, name: "ACTIVE_CANDIDATE" };
      }
      return event.type === "SUSPECT_RESLEEP"
        ? { ...state, name: "ESCALATING" }
        : state;
    case "ACTIVE_CANDIDATE":
      if (event.type === "CONFIRM_WAKE") {
        return { ...state, name: "CONFIRMED" };
      }
      return event.type === "SUSPECT_RESLEEP"
        ? { ...state, name: "ESCALATING" }
        : state;
    case "ESCALATING":
      return event.type === "TRIGGER_NEXT_ALARM" &&
        state.currentStepIndex + 1 < totalSteps
        ? {
            ...state,
            currentStepIndex: state.currentStepIndex + 1,
            name: "RINGING",
          }
        : state;
    case "CONFIRMED":
      return state;
  }
}

export function hasNextAlarm(
  state: WakeMachineState,
  totalSteps: number,
) {
  return state.currentStepIndex + 1 < totalSteps;
}

export function createConfirmedWakeResult(
  plan: ActiveWakePlan,
  state: WakeMachineState,
  confirmedAt = new Date().toISOString(),
): WakeResult {
  return {
    alarmStepsUsed: state.alarmStepsUsed,
    completedAt: confirmedAt,
    confirmedAt,
    outcome:
      new Date(confirmedAt).getTime() <= new Date(plan.deadlineAt).getTime()
        ? "CONFIRMED_ON_TIME"
        : "CONFIRMED_LATE",
    planId: plan.id,
    userCorrection: false,
  };
}

export function createUnconfirmedWakeResult(
  plan: ActiveWakePlan,
  state: WakeMachineState,
  completedAt = new Date().toISOString(),
): WakeResult {
  return {
    alarmStepsUsed: state.alarmStepsUsed,
    completedAt,
    confirmedAt: null,
    outcome: "UNCONFIRMED",
    planId: plan.id,
    userCorrection: false,
  };
}
