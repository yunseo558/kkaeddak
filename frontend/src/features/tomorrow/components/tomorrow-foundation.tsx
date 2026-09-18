"use client";

import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";
import { getScenario } from "@/features/demo-session/model/scenarios";

export function TomorrowFoundation() {
  const mode = useDemoSessionStore((state) => state.mode);
  const scenarioId = useDemoSessionStore((state) => state.scenarioId);
  const scenario = scenarioId ? getScenario(scenarioId) : null;

  if (!scenario || !mode) {
    return (
      <AppShell currentStep="분석">
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-6">
          <h1 className="text-2xl font-bold">먼저 데모 상황을 선택해 주세요</h1>
          <Link className="mt-6 inline-flex min-h-11 items-center text-brand" href="/">
            데모 선택으로 이동
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell currentStep="분석" eyebrow="첫 번째 수직 흐름">
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-6 sm:p-8">
        <p className="text-sm font-semibold text-brand">
          {mode === "server" ? "서버 세션 연결됨" : "로컬 전용 데모"}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{scenario.name}</h1>
        <p className="mt-4 text-lg text-muted">{scenario.summary}</p>
        <p className="mt-3 max-w-2xl leading-7">{scenario.detail}</p>
        <p className="mt-8 rounded-[var(--radius-control)] bg-brand-soft p-4 text-sm leading-6">
          다음 구현에서 일정 조회, 기상 마감 역산과 로컬 건강 시나리오 분석을 이
          화면에 연결합니다.
        </p>
      </section>
    </AppShell>
  );
}
