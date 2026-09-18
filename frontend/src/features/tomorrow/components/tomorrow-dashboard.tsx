"use client";

import Link from "next/link";

import { ApiErrorState } from "@/components/foundation/api-error-state";
import { TimezoneNotice } from "@/components/foundation/timezone-notice";
import { AppShell } from "@/components/layout/app-shell";
import { getScenario } from "@/features/demo-session/model/scenarios";
import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";

import {
  calculateWakeDeadline,
  formatKoreanDateTime,
  formatKoreanTime,
  getScheduleDemand,
  sumRoutineMinutes,
} from "../lib/schedule-calculation";
import { useTomorrowOverview } from "../model/use-tomorrow-overview";

const importanceLabels = {
  NORMAL: "일반 일정",
  IMPORTANT: "중요 일정",
  CRITICAL: "꼭 지켜야 할 일정",
} as const;

export function TomorrowDashboard() {
  const startLocal = useDemoSessionStore((state) => state.startLocal);
  const { mode, offlineFallback, query, ready, scenarioId } =
    useTomorrowOverview();
  const scenario = scenarioId ? getScenario(scenarioId) : null;

  if (!ready || !scenario) {
    return (
      <AppShell currentStep="분석">
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-6">
          <h1 className="text-2xl font-bold">먼저 데모 상황을 선택해 주세요</h1>
          <Link
            className="mt-6 inline-flex min-h-11 items-center font-semibold text-brand"
            href="/"
          >
            데모 선택으로 이동
          </Link>
        </section>
      </AppShell>
    );
  }

  if (query.isPending) {
    return (
      <AppShell currentStep="분석" eyebrow="내일 분석">
        <p aria-live="polite" className="rounded-xl bg-surface p-6 text-muted">
          내일 일정과 준비 루틴을 불러오는 중입니다.
        </p>
      </AppShell>
    );
  }

  if (query.isError) {
    return (
      <AppShell currentStep="분석" eyebrow="내일 분석">
        <ApiErrorState
          error={query.error}
          onRetry={() => void query.refetch()}
          title="일정을 불러오지 못했습니다"
        />
      </AppShell>
    );
  }

  const { event, routine } = query.data;
  if (!event) {
    return (
      <AppShell currentStep="분석" eyebrow="내일 분석">
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-6">
          <h1 className="text-2xl font-bold">예정된 일정이 없습니다</h1>
          <p className="mt-3 text-muted">
            선택한 시나리오의 평소 패턴으로 로컬 계획을 계속 만들 수 있습니다.
          </p>
          <button
            className="mt-6 min-h-11 rounded-[var(--radius-control)] bg-brand px-5 py-3 font-semibold text-white"
            onClick={() => startLocal(scenario.id)}
            type="button"
          >
            평소 패턴으로 계속
          </button>
        </section>
      </AppShell>
    );
  }

  const routineMinutes = sumRoutineMinutes(routine.routineTasks);
  const minutesBeforeEvent = routineMinutes + routine.wakeBufferMin;
  const wakeDeadline = calculateWakeDeadline({
    eventStartsAt: event.startsAt,
    routineMinutes,
    wakeBufferMinutes: routine.wakeBufferMin,
  });
  const demand = getScheduleDemand(event.importance, minutesBeforeEvent);

  return (
    <AppShell currentStep="분석" eyebrow="내일 분석">
      <div className="space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-brand">
              {offlineFallback
                ? "오프라인 로컬 계산"
                : mode === "server"
                  ? "서버 일정 연결됨"
                  : "로컬 전용 데모"}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              {scenario.name}
            </h1>
            <p className="mt-2 text-muted">가장 이른 일정부터 필요한 시간을 역산했습니다.</p>
          </div>
          <span className="w-fit rounded-full bg-brand-soft px-3 py-2 text-sm font-semibold text-brand">
            일정 부담 {demand}
          </span>
        </header>

        <TimezoneNotice scheduleTimezone="Asia/Seoul" />

        <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <article className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[0_8px_24px_rgba(20,32,43,0.08)] sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-brand">첫 일정</p>
              <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold">
                {importanceLabels[event.importance]}
              </span>
            </div>
            <h2 className="mt-4 text-2xl font-bold">
              {event.displayTitle ?? event.category}
            </h2>
            <p className="mt-2 text-lg text-muted">
              {formatKoreanDateTime(event.startsAt)}
            </p>

            <div className="mt-8 rounded-[var(--radius-control)] bg-brand-soft p-5">
              <p className="text-sm font-semibold text-brand">기본 기상 마감</p>
              <p className="mt-1 text-4xl font-bold tracking-tight">
                {formatKoreanTime(wakeDeadline)}
              </p>
              <p className="mt-3 text-sm leading-6 text-muted">
                일정 {formatKoreanTime(event.startsAt)}에서 준비 {routineMinutes}분과
                이동·여유 {routine.wakeBufferMin}분을 뺀 시각입니다.
              </p>
            </div>
          </article>

          <aside className="rounded-[var(--radius-card)] border border-border bg-surface p-6">
            <h2 className="text-lg font-bold">아침 준비 {routineMinutes}분</h2>
            <ol className="mt-4 space-y-3">
              {routine.routineTasks.map((task) => (
                <li
                  className="flex items-center justify-between gap-3 text-sm"
                  key={task.code}
                >
                  <span>{task.label}</span>
                  <span className="font-semibold">{task.minutes}분</span>
                </li>
              ))}
            </ol>
            <div className="mt-5 border-t border-border pt-4 text-sm text-muted">
              이동·여유 시간 {routine.wakeBufferMin}분 포함
            </div>
          </aside>
        </section>

        <section className="flex flex-col gap-4 rounded-[var(--radius-card)] bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold">전날 준비로 아침 시간을 줄일 수 있어요</h2>
            <p className="mt-1 text-sm text-muted">
              실제로 완료한 작업의 시간만 기상 마감에 반영합니다.
            </p>
          </div>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-brand px-5 py-3 font-semibold text-white"
            href="/prepare"
          >
            준비 작업 보기
          </Link>
        </section>

        <p className="text-sm leading-6 text-muted">
          이 시각은 일정과 루틴만 반영한 기본 마감입니다. 건강 상태를 반영한 알람
          단계와 최종 계획은 계획 화면에서 별도로 확정합니다.
        </p>
      </div>
    </AppShell>
  );
}
