"use client";

import type { components } from "@kkaeddak/api-client";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import {
  useCurrentFlowStore,
  type WakeResult,
} from "@/features/current-flow/model/current-flow-store";
import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";

import { syncWakeOutcome } from "../api/wake-outcome-api";
import {
  applyWakeLearning,
  type WakeLearningResult,
} from "../lib/wake-learning";

type WakeOutcome = components["schemas"]["WakeOutcome"];
type SyncStatus = "local" | "server" | "server-consent-missing" | "failed";

const outcomeLabels: Record<WakeOutcome, string> = {
  CONFIRMED_ON_TIME: "제시간 기상 확인",
  CONFIRMED_LATE: "늦은 기상 확인",
  UNCONFIRMED: "기상 확인 없음",
  USER_CANCELLED: "사용자 종료",
};

const syncLabels: Record<SyncStatus, string> = {
  local: "결과 원본과 개인 학습값은 이 브라우저에만 저장했습니다.",
  server: "동의된 집계 결과만 서버에 동기화했습니다.",
  "server-consent-missing":
    "서버 프로필의 집계 동의가 확인되지 않아 로컬에만 저장했습니다.",
  failed: "로컬 학습은 완료했지만 집계 결과 동기화는 실패했습니다.",
};

export function WakeResultReview() {
  const activePlan = useCurrentFlowStore((state) => state.activeWakePlan);
  const storedResult = useCurrentFlowStore((state) => state.wakeResult);
  const setWakeResult = useCurrentFlowStore((state) => state.setWakeResult);
  const outcomeSync = useCurrentFlowStore(
    (state) => state.onboardingDraft.outcomeSync,
  );
  const mode = useDemoSessionStore((state) => state.mode);
  const sessionId = useDemoSessionStore((state) => state.sessionId);
  const [draftResult, setDraftResult] = useState<WakeResult | null>(
    storedResult,
  );
  const [learning, setLearning] = useState<WakeLearningResult | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  const mutation = useMutation({
    mutationFn: async (result: WakeResult) => {
      if (!activePlan) {
        throw new Error("An active wake plan is required");
      }
      const learned = await applyWakeLearning(result, activePlan.localDate);
      let nextSyncStatus: SyncStatus = "local";
      if (mode === "server" && sessionId && outcomeSync) {
        try {
          const sync = await syncWakeOutcome(sessionId, result);
          nextSyncStatus = sync.synced ? "server" : "server-consent-missing";
        } catch {
          nextSyncStatus = "failed";
        }
      }
      return { learned, nextSyncStatus };
    },
    onSuccess: ({ learned, nextSyncStatus }) => {
      setLearning(learned);
      setSyncStatus(nextSyncStatus);
    },
  });

  if (!activePlan || !draftResult) {
    return (
      <AppShell currentStep="결과" eyebrow="기상 결과">
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-6">
          <h1 className="text-2xl font-bold">확인할 기상 결과가 없습니다</h1>
          <Link
            className="mt-6 inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-brand px-5 py-3 font-semibold text-white"
            href="/wake"
          >
            기상 실행으로 이동
          </Link>
        </section>
      </AppShell>
    );
  }

  const unusedSteps = Math.max(
    0,
    activePlan.steps.length - draftResult.alarmStepsUsed,
  );
  const correctOutcome = (outcome: WakeOutcome) => {
    const corrected: WakeResult = {
      ...draftResult,
      confirmedAt:
        outcome === "UNCONFIRMED"
          ? null
          : (draftResult.confirmedAt ?? draftResult.completedAt),
      outcome,
      userCorrection: true,
    };
    setDraftResult(corrected);
    setWakeResult(corrected);
  };

  return (
    <AppShell currentStep="결과" eyebrow="기상 결과">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="text-sm font-semibold text-success">실행 완료</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            {outcomeLabels[draftResult.outcome]}
          </h1>
          <p className="mt-3 leading-7 text-muted">
            실제 사용한 알람과 남겨 둔 안전 단계를 확인한 뒤 로컬 학습에 반영합니다.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          <article className="rounded-[var(--radius-card)] border border-border bg-surface p-6 text-center">
            <p className="text-sm font-semibold text-muted">사용한 알람</p>
            <p className="mt-2 text-4xl font-bold">{draftResult.alarmStepsUsed}개</p>
          </article>
          <article className="rounded-[var(--radius-card)] border border-border bg-surface p-6 text-center">
            <p className="text-sm font-semibold text-muted">실행하지 않은 예비 알람</p>
            <p className="mt-2 text-4xl font-bold">{unusedSteps}개</p>
          </article>
        </section>

        {!learning ? (
          <section className="rounded-[var(--radius-card)] border border-border bg-surface p-6">
            <h2 className="text-lg font-bold">결과가 실제와 다른가요?</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="min-h-11 rounded-[var(--radius-control)] border border-border px-4 py-3 font-semibold disabled:opacity-60"
                disabled={mutation.isPending}
                onClick={() => correctOutcome("CONFIRMED_LATE")}
                type="button"
              >
                늦게 일어남으로 수정
              </button>
              <button
                className="min-h-11 rounded-[var(--radius-control)] border border-border px-4 py-3 font-semibold disabled:opacity-60"
                disabled={mutation.isPending}
                onClick={() => correctOutcome("UNCONFIRMED")}
                type="button"
              >
                확인 못함으로 수정
              </button>
            </div>
            <button
              className="mt-5 min-h-11 w-full rounded-[var(--radius-control)] bg-brand px-5 py-3 font-semibold text-white disabled:opacity-60"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(draftResult)}
              type="button"
            >
              {mutation.isPending ? "학습 반영 중…" : "결과 확정하고 학습 반영"}
            </button>
          </section>
        ) : (
          <section className="rounded-[var(--radius-card)] bg-brand-soft p-6">
            <h2 className="text-lg font-bold text-brand">다음 추천 변화</h2>
            <p className="mt-2 leading-7 text-muted">
              {learning.nextRecommendation}
            </p>
            {syncStatus ? (
              <p aria-live="polite" className="mt-3 text-sm text-muted">
                {syncLabels[syncStatus]}
              </p>
            ) : null}
          </section>
        )}

        {mutation.isError ? (
          <p aria-live="polite" className="text-sm text-danger">
            로컬 학습에 반영하지 못했습니다. 현재 결과를 유지한 채 다시 시도해 주세요.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-4">
          {learning ? (
            <Link className="inline-flex min-h-11 items-center font-semibold text-brand" href="/history">
              학습 기록 보기
            </Link>
          ) : null}
          <Link className="inline-flex min-h-11 items-center font-semibold text-brand" href="/tomorrow">
            내일 계획으로 돌아가기
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
