"use client";

import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";

import { useWakeHistory } from "../model/use-wake-history";

export function WakeHistorySummary() {
  const { query, window } = useWakeHistory();
  const summary = query.data?.summary;
  const source = query.data?.source;

  return (
    <AppShell currentStep="결과" eyebrow="학습 기록">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">최근 30일 기상 기록</h1>
          <p className="mt-3 leading-7 text-muted">
            {source === "server"
              ? "동의한 집계 결과만 서버 기록으로 표시합니다."
              : "이 브라우저에 저장된 결과만 집계합니다."}
          </p>
          <p className="mt-1 text-sm text-muted">
            {window.from} ~ {window.to}
          </p>
        </header>

        {query.isPending ? (
          <p aria-live="polite" className="rounded-xl bg-surface p-6 text-muted">
            학습 기록을 불러오는 중입니다.
          </p>
        ) : null}

        {query.isError ? (
          <section className="rounded-[var(--radius-card)] border border-border bg-surface p-6">
            <h2 className="text-xl font-bold">기록을 불러오지 못했습니다</h2>
            <button
              className="mt-5 min-h-11 rounded-[var(--radius-control)] bg-brand px-5 py-3 font-semibold text-white"
              onClick={() => query.refetch()}
              type="button"
            >
              다시 불러오기
            </button>
          </section>
        ) : null}

        {summary ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["전체 기록", summary.totalSessions],
                ["제시간 확인", summary.onTimeSessions],
                ["늦은 확인", summary.lateSessions],
                ["미확인", summary.unconfirmedSessions],
              ].map(([label, value]) => (
                <article
                  className="rounded-[var(--radius-card)] border border-border bg-surface p-5"
                  key={label}
                >
                  <p className="text-sm font-semibold text-muted">{label}</p>
                  <p className="mt-2 text-3xl font-bold">{value}</p>
                </article>
              ))}
            </section>
            <section className="rounded-[var(--radius-card)] border border-border bg-surface p-6">
              <h2 className="text-lg font-bold">평균 사용 알람</h2>
              <p className="mt-2 text-3xl font-bold">
                {summary.averageAlarmSteps === null ||
                summary.averageAlarmSteps === undefined
                  ? "기록 없음"
                  : `${summary.averageAlarmSteps.toFixed(1)}개`}
              </p>
              <p className="mt-3 text-sm leading-6 text-muted">
                성공 확률이 아니라 실제로 사용한 알람 단계의 평균입니다.
              </p>
            </section>
          </>
        ) : null}

        <Link className="inline-flex min-h-11 items-center font-semibold text-brand" href="/result">
          최근 결과로 돌아가기
        </Link>
      </div>
    </AppShell>
  );
}
