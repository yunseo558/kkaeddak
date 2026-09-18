import Link from "next/link";
import type { ReactNode } from "react";

const STEPS = ["소개", "분석", "준비", "계획", "결과"] as const;

type AppShellProps = {
  children: ReactNode;
  currentStep: (typeof STEPS)[number];
  eyebrow?: string;
};

export function AppShell({ children, currentStep, eyebrow }: AppShellProps) {
  return (
    <div className="min-h-screen px-4 py-6 sm:px-8">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <Link className="text-lg font-bold tracking-tight" href="/">
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

      <main className="mx-auto mt-8 w-full max-w-5xl">
        {eyebrow ? (
          <p className="mb-2 text-sm font-semibold text-brand">{eyebrow}</p>
        ) : null}
        {children}
      </main>
    </div>
  );
}
