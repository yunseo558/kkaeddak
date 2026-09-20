"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";
import {
  confirmCurrentAlarm,
  dismissCurrentAlarm,
  generateServicePlan,
  serviceAction,
  serviceNow,
  syncPendingAlarmEvents,
  triggerNextAlarmStep,
} from "../lib/service-actions";
import { startAlarmSound, stopAlarmSound } from "../lib/alarm-audio";
import { AlarmSoundButton } from "./alarm-sound-button";
import { useServiceStore } from "../model/service-store";
import { clockTime } from "../model/service-policy";
import { alarmScheduledAt, nextAlarmStep } from "../lib/alarm-sequence";
import { shouldGenerateScheduledPlan } from "../lib/plan-lifecycle";

function hasLiveSession() {
  const session = useDemoSessionStore.getState();
  return Boolean(
    session.sessionId &&
      session.expiresAt &&
      Date.parse(session.expiresAt) > Date.now(),
  );
}

export function GlobalAlarmScheduler() {
  const pathname = usePathname();
  const calendarConnected = useServiceStore((state) => state.calendarConnected);
  const virtualNow = useServiceStore((state) => state.virtualNow);
  const alarmStage = useServiceStore((state) => state.alarmStage);
  const plan = useServiceStore((state) => state.plan);
  const busy = useServiceStore((state) => state.busy);

  useEffect(() => {
    if (!calendarConnected) return;

    const tick = () => {
      const state = useServiceStore.getState();
      if (state.busy) return;
      if (
        state.plan &&
        ["APPROVED", "EDITED"].includes(state.plan.status) &&
        state.alarmStage === "idle" &&
        state.alarmRuntime.planId === state.plan.id &&
        state.alarmRuntime.currentStepOrder !== null
      ) {
        const awaitingConfirmation =
          state.alarmRuntime.awaitingConfirmationStepOrder !== null;
        state.set({ alarmStage: awaitingConfirmation ? "confirm" : "ringing" });
        if (!awaitingConfirmation) {
          void startAlarmSound().catch(() =>
            state.set({
              message:
                "음소거 자동 재생이 차단됐어요. 알람 화면에서 재생 버튼을 눌러 주세요.",
            }),
          );
        }
      }

      if (!hasLiveSession()) {
        // serviceAction restores the existing plan and its alarm progress.
        void serviceAction(async () => {});
        return;
      }
      const now = serviceNow();
      const dueStep = state.plan
        ? nextAlarmStep(state.plan, state.alarmRuntime, now)
        : null;
      // Report delivery must not delay ringing or the next day's planning.
      if (state.alarmRuntime.events.some((event) => !event.synced)) {
        void syncPendingAlarmEvents();
      }
      if (dueStep) {
        void serviceAction(async () => { await triggerNextAlarmStep(); });
        return;
      }
      if (shouldGenerateScheduledPlan(state, now)) {
        void serviceAction(generateServicePlan);
      }
    };

    tick();
    const timer = window.setInterval(tick, 15_000);
    return () => window.clearInterval(timer);
  }, [calendarConnected, virtualNow]);

  useEffect(() => () => stopAlarmSound(), []);

  if (pathname === "/" || alarmStage === "idle" || !plan) return null;
  const activeStepOrder =
    useServiceStore.getState().alarmRuntime.currentStepOrder ??
    useServiceStore.getState().alarmRuntime.awaitingConfirmationStepOrder ??
    1;

  return (
    <div
      aria-labelledby="global-alarm-title"
      className="global-alarm-overlay"
      role="dialog"
      aria-modal="true"
    >
      <section className="service-alarm" aria-live="assertive">
        <p className="service-kicker" id="global-alarm-title">
          {alarmStage === "ringing"
            ? "일어날 시간이에요"
            : "잠깐, 정말 일어났나요?"}
        </p>
        <p className="service-clock">
          {clockTime(alarmScheduledAt(plan, activeStepOrder))}
        </p>
        {alarmStage === "ringing" ? (
          <div className="service-stack">
            <button
              className="service-primary"
              onClick={() => void serviceAction(dismissCurrentAlarm)}
            >
              알람 끄기
            </button>
            <AlarmSoundButton />
          </div>
        ) : (
          <div className="service-stack">
            <button
              className="service-primary"
              disabled={busy}
              onClick={() => void serviceAction(() => confirmCurrentAlarm(true))}
            >
              네, 일어났어요
            </button>
            <button
              className="service-secondary"
              disabled={busy}
              onClick={() => void serviceAction(() => confirmCurrentAlarm(false))}
            >
              못 일어났어요
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
