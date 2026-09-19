"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { useOnlineStatus } from "@/lib/network/use-online-status";

const STEPS = ["소개", "분석", "준비", "계획", "결과"] as const;

type AppShellProps = {
  children: ReactNode;
  currentStep: (typeof STEPS)[number];
  eyebrow?: string;
};

export function AppShell({ children, currentStep, eyebrow }: AppShellProps) {
  const online = useOnlineStatus();
  const currentStepIndex = STEPS.indexOf(currentStep);

  return (
    <div className="app-canvas sm:px-6 sm:py-6">
      <a
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-[var(--radius-control)] bg-brand px-4 py-3 font-semibold text-white transition-transform focus:translate-y-0"
        href="#main-content"
      >
        본문으로 건너뛰기
      </a>
      <div className="app-frame mx-auto w-full max-w-[520px] pb-2">
        <header className="site-header mx-4 flex items-center justify-between rounded-[22px] px-4 py-2.5 sm:mx-5 sm:mt-5">
          <Link
            aria-label="깨딱 홈"
            className="inline-flex min-h-11 items-center"
            href="/"
          >
            <BrandLogo className="brand-logo-header" priority />
          </Link>
          <span className="demo-badge">샘플 데이터 데모</span>
        </header>

        <nav aria-label="데모 진행 단계" className="progress-rail mx-4 mt-4 sm:mx-5">
          <ol className="grid grid-cols-5 gap-1 text-center text-xs">
            {STEPS.map((step, index) => {
              const active = step === currentStep;
              const state = active
                ? "active"
                : index < currentStepIndex
                  ? "complete"
                  : "pending";
              return (
                <li
                  aria-current={active ? "step" : undefined}
                  className="progress-step"
                  data-state={state}
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
            className="soft-card mx-4 mt-4 rounded-[var(--radius-control)] px-4 py-3 text-sm font-semibold text-brand sm:mx-5"
            role="status"
          >
            오프라인 상태입니다. 로컬 기능은 계속 사용할 수 있고 서버 동기화는
            연결 후 다시 시도합니다.
          </p>
        ) : null}

        <main
          className="mt-7 w-full px-5 pb-16"
          id="main-content"
          tabIndex={-1}
        >
          {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
