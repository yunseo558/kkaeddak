"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useOnlineStatus } from "@/lib/network/use-online-status";

const STEPS = ["소개", "분석", "준비", "계획", "결과"] as const;

type AppShellProps = {
  children: ReactNode;
  currentStep: (typeof STEPS)[number];
  eyebrow?: string;
};

export function AppShell({ children, currentStep, eyebrow }: AppShellProps) {
  const online = useOnlineStatus();

  return (
    <div className="min-h-screen px-4 py-6 sm:px-8">
      <a
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-[var(--radius-control)] bg-brand px-4 py-3 font-semibold text-white transition-transform focus:translate-y-0"
        href="#main-content"
      >
        본문으로 건너뛰기
      </a>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <Link
          className="inline-flex min-h-11 items-center text-lg font-bold tracking-tight"
          href="/"
        >
          깨딱
        </Link>
        <span className="text-sm text-muted">샘플 데이터 데모</span>
      </header>

      <nav aria-label="데모 진행 단계" className="mx-auto mt-6 w-full max-w-5xl">
        <ol className="grid grid-cols-5 gap-1 text-center text-xs sm:gap-2 sm:text-sm">
          {STEPS.map((step) => {
            const active = step === currentStep;
            return (
              <li
                aria-current={active ? "step" : undefined}
                className={`rounded-full px-2 py-2 ${
                  active
                    ? "bg-brand font-semibold text-white"
                    : "bg-surface text-muted"
                }`}
                key={step}
              >
                {step}
              </li>
            );
          })}
        </ol>
      </nav>

      {!online ? (
        <p
          aria-live="polite"
          className="mx-auto mt-4 w-full max-w-5xl rounded-xl bg-brand-soft px-4 py-3 text-sm font-semibold text-brand"
          role="status"
        >
          오프라인 상태입니다. 로컬 기능은 계속 사용할 수 있고 서버 동기화는
          연결 후 다시 시도합니다.
        </p>
      ) : null}

      <main
        className="mx-auto mt-8 w-full max-w-5xl"
        id="main-content"
        tabIndex={-1}
      >
        {eyebrow ? (
          <p className="mb-2 text-sm font-semibold text-brand">{eyebrow}</p>
        ) : null}
        {children}
      </main>
    </div>
  );
}
