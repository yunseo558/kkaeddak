"use client";

import Link from "next/link";
import { useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { formatKoreanTime } from "@/features/tomorrow/lib/schedule-calculation";

import { recordWakeTransition } from "../lib/wake-event-log";
import {
  createConfirmedWakeResult,
  createInitialWakeMachine,
  createUnconfirmedWakeResult,
  hasNextAlarm,
  transitionWakeMachine,
  type WakeMachineEvent,
} from "../model/wake-state-machine";

const channelLabels: Record<string, string> = {
  WATCH_HAPTIC: "워치 진동",
  PHONE_SOUND: "휴대폰 소리",
  FINAL_SAFETY: "최종 안전 알람",
};

const stateCopy = {
  RINGING: {
    eyebrow: "알람 실행 중",
    title: "알람을 확인해 주세요",
    description: "알람을 끄면 다음 기상 단계로 넘어갑니다.",
  },
  DISMISSED: {
    eyebrow: "알람 종료됨",
    title: "기상 활동을 시작했나요?",
    description: "실제 센서를 사용하지 않고 선택한 버튼으로만 상태가 바뀝니다.",
  },
  ACTIVE_CANDIDATE: {
    eyebrow: "활동 확인 중",
    title: "깨어 있는 상태를 확인해 주세요",
    description: "기상 완료 또는 재수면 여부를 직접 선택해 주세요.",
  },
  ESCALATING: {
    eyebrow: "조건부 알람",
    title: "다음 안전 단계를 준비합니다",
    description: "승인한 계획의 다음 알람만 순서대로 실행합니다.",
  },
  CONFIRMED: {
    eyebrow: "기상 확인 완료",
    title: "오늘의 기상을 기록했습니다",
    description: "결과 화면에서 기록을 확인하고 로컬 학습에 반영할 수 있습니다.",
  },
} as const;

export function WakeStatus() {
  const activePlan = useCurrentFlowStore((state) => state.activeWakePlan);
  const storedResult = useCurrentFlowStore((state) => state.wakeResult);
  const setWakeResult = useCurrentFlowStore((state) => state.setWakeResult);
  const [machine, setMachine] = useState(createInitialWakeMachine);
  const [busy, setBusy] = useState(false);

  if (!activePlan) {
    return (
      <AppShell currentStep="계획" eyebrow="기상 실행">
        <section className="glass-card rounded-[var(--radius-card)] p-6">
          <h1 className="text-2xl font-bold">실행할 기상 계획이 없습니다</h1>
          <p className="mt-3 text-muted">먼저 기상 계획을 승인하거나 수정해 주세요.</p>
          <Link
            className="action-primary mt-6 inline-flex min-h-11 items-center px-5 py-3"
            href="/plan"
          >
            기상 계획으로 이동
          </Link>
        </section>
      </AppShell>
    );
  }

  if (
    storedResult?.planId === activePlan.id &&
    machine.name !== "CONFIRMED"
  ) {
    return (
      <AppShell currentStep="결과" eyebrow="기상 실행">
        <section className="glass-card rounded-[var(--radius-card)] p-6">
          <h1 className="text-2xl font-bold">기상 실행이 완료됐습니다</h1>
          <Link
            className="action-primary mt-6 inline-flex min-h-11 items-center px-5 py-3"
            href="/result"
          >
            결과 확인
          </Link>
        </section>
      </AppShell>
    );
  }

  const totalSteps = activePlan.steps.length;
  const currentStep = activePlan.steps[machine.currentStepIndex];
  const copy = stateCopy[machine.name];
  const nextAlarmAvailable = hasNextAlarm(machine, totalSteps);
  const currentAlarmAt =
    machine.currentStepIndex === totalSteps - 1
      ? activePlan.finalAlarmAt
      : new Date(
          new Date(activePlan.firstAlarmAt).getTime() +
            currentStep.offsetMin * 60_000,
        ).toISOString();

  const send = async (event: WakeMachineEvent) => {
    setBusy(true);
    try {
      await recordWakeTransition(event.type, activePlan.id);
      const next = transitionWakeMachine(machine, event, totalSteps);
      setMachine(next);
      if (next.name === "CONFIRMED") {
        setWakeResult(createConfirmedWakeResult(activePlan, next));
      }
    } finally {
      setBusy(false);
    }
  };

  const finishUnconfirmed = async () => {
    setBusy(true);
    try {
      await recordWakeTransition("FINISH_UNCONFIRMED", activePlan.id);
      setWakeResult(createUnconfirmedWakeResult(activePlan, machine));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell currentStep={machine.name === "CONFIRMED" ? "결과" : "계획"} eyebrow="기상 실행">
      <div className="mx-auto max-w-2xl space-y-6">
        <header aria-live="polite">
          <p className="text-sm font-semibold text-brand">{copy.eyebrow}</p>
          <h1 className="display-title mt-2 text-3xl font-bold tracking-tight">{copy.title}</h1>
          <p className="mt-3 leading-7 text-muted">{copy.description}</p>
        </header>

        <section className="glass-card wake-display rounded-[var(--radius-card)] p-8 text-center sm:p-10">
          <p className="text-sm font-semibold text-muted">
            {machine.currentStepIndex + 1} / {totalSteps} 단계
          </p>
          <p className="mt-4 text-5xl font-bold tracking-[-0.05em] sm:text-6xl">
            {formatKoreanTime(currentAlarmAt)}
          </p>
          <p className="mt-3 font-semibold">
            {channelLabels[currentStep.channel] ?? currentStep.channel}
          </p>
        </section>

        <div className="flex flex-wrap gap-3">
          {machine.name === "RINGING" ? (
            <button
              className="action-primary min-h-12 flex-1 px-5 py-3 disabled:opacity-60"
              disabled={busy}
              onClick={() => send({ type: "DISMISS_ALARM" })}
              type="button"
            >
              알람 종료
            </button>
          ) : null}

          {machine.name === "DISMISSED" ? (
            <>
              <button
                className="action-primary min-h-12 flex-1 px-5 py-3 disabled:opacity-60"
                disabled={busy}
                onClick={() => send({ type: "START_ACTIVITY" })}
                type="button"
              >
                기상 활동 시작
              </button>
              <button
                className="action-ghost min-h-12 px-5 py-3 disabled:opacity-60"
                disabled={busy}
                onClick={() => send({ type: "SUSPECT_RESLEEP" })}
                type="button"
              >
                다시 잠든 것 같아요
              </button>
            </>
          ) : null}

          {machine.name === "ACTIVE_CANDIDATE" ? (
            <>
              <button
                className="action-secondary min-h-12 flex-1 px-5 py-3 disabled:opacity-60"
                disabled={busy}
                onClick={() => send({ type: "CONFIRM_WAKE" })}
                type="button"
              >
                기상 완료 확인
              </button>
              <button
                className="action-ghost min-h-12 px-5 py-3 disabled:opacity-60"
                disabled={busy}
                onClick={() => send({ type: "SUSPECT_RESLEEP" })}
                type="button"
              >
                다시 잠들었어요
              </button>
            </>
          ) : null}

          {machine.name === "ESCALATING" && nextAlarmAvailable ? (
            <button
              className="action-primary min-h-12 flex-1 px-5 py-3 disabled:opacity-60"
              disabled={busy}
              onClick={() => send({ type: "TRIGGER_NEXT_ALARM" })}
              type="button"
            >
              다음 알람 실행
            </button>
          ) : null}

          {machine.name === "ESCALATING" && !nextAlarmAvailable ? (
            <button
              className="action-primary min-h-12 flex-1 px-5 py-3 disabled:opacity-60"
              disabled={busy}
              onClick={finishUnconfirmed}
              type="button"
            >
              확인 없이 실행 종료
            </button>
          ) : null}

          {machine.name === "CONFIRMED" ? (
            <Link
              className="action-primary inline-flex min-h-12 flex-1 items-center justify-center px-5 py-3"
              href="/result"
            >
              기상 결과 보기
            </Link>
          ) : null}

          {storedResult?.planId === activePlan.id && machine.name !== "CONFIRMED" ? (
            <Link
              className="action-primary inline-flex min-h-12 flex-1 items-center justify-center px-5 py-3"
              href="/result"
            >
              기상 결과 보기
            </Link>
          ) : null}
        </div>

        <p className="soft-card rounded-[var(--radius-control)] px-4 py-3 text-sm leading-6 text-muted">
          웹 버전에서는 기기 알람·워치·활동 센서가 직접 연동되지 않습니다.
        </p>
      </div>
    </AppShell>
  );
}
