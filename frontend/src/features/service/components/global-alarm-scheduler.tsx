"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";
import {
  connectCalendar,
  ensureMockCalendarCoverage,
  generateServicePlan,
  saveServiceOutcome,
  serviceAction,
  serviceNow,
} from "../lib/service-actions";
import { startAlarmSound, stopAlarmSound } from "../lib/alarm-audio";
import { useServiceStore } from "../model/service-store";
import { addDays, clockTime, localDate } from "../model/service-policy";

const ALARM_GRACE_MS = 4 * 60 * 60 * 1000;

export function isAlarmDue(
  plan: {
    id: string;
    status: string;
    firstAlarmAt: string;
    finalAlarmAt: string;
  },
  now: string,
  lastTriggeredAlarmPlanId: string | null,
) {
  const nowMs = Date.parse(now);
  return (
    ["APPROVED", "EDITED"].includes(plan.status) &&
    plan.id !== lastTriggeredAlarmPlanId &&
    nowMs >= Date.parse(plan.firstAlarmAt) &&
    nowMs <= Date.parse(plan.finalAlarmAt) + ALARM_GRACE_MS
  );
}

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
      if (!hasLiveSession()) {
        void serviceAction(() => connectCalendar(true));
        return;
      }

      const now = serviceNow();
      if (
        state.alarmStage === "idle" &&
        state.plan &&
        isAlarmDue(state.plan, now, state.lastTriggeredAlarmPlanId)
      ) {
        state.set({
          alarmStage: "ringing",
          lastTriggeredAlarmPlanId: state.plan.id,
        });
        void startAlarmSound().catch(() =>
          state.set({
            message:
              "음소거 자동 재생이 차단됐어요. 알람 화면에서 재생 버튼을 눌러 주세요.",
          }),
        );
        return;
      }

      if (
        state.alarmStage === "idle" &&
        clockTime(now) >= state.automationTime &&
        state.lastAutomationSlot !== localDate(now)
      ) {
        state.set({ lastAutomationSlot: localDate(now) });
        void serviceAction(generateServicePlan);
      }
    };

    tick();
    const timer = window.setInterval(tick, 15_000);
    return () => window.clearInterval(timer);
  }, [calendarConnected, virtualNow]);

  useEffect(() => {
    if (!calendarConnected) return;
    void serviceAction(async () => {
      if (!hasLiveSession()) {
        await connectCalendar(true);
        return;
      }
      await ensureMockCalendarCoverage();
      const targetDate = addDays(localDate(serviceNow()), 1);
      if (useServiceStore.getState().plan?.localDate !== targetDate) {
        await generateServicePlan();
      }
    });
  }, [calendarConnected, virtualNow]);

  useEffect(() => () => stopAlarmSound(), []);

  if (pathname === "/" || alarmStage === "idle" || !plan) return null;

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
        <p className="service-clock">{clockTime(plan.firstAlarmAt)}</p>
        {alarmStage === "ringing" ? (
          <button
            className="service-primary"
            onClick={() => {
              stopAlarmSound();
              useServiceStore.getState().set({ alarmStage: "confirm" });
            }}
          >
            알람 끄기
          </button>
        ) : (
          <div className="service-stack">
            <button
              className="service-primary"
              disabled={busy}
              onClick={() => void serviceAction(() => saveServiceOutcome(true))}
            >
              네, 일어났어요
            </button>
            <button
              className="service-secondary"
              disabled={busy}
              onClick={() => void serviceAction(() => saveServiceOutcome(false))}
            >
              못 일어났어요
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
