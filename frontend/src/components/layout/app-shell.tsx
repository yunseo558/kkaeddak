"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { useOnlineStatus } from "@/lib/network/use-online-status";

type AppStep = "소개" | "분석" | "준비" | "계획" | "결과";

type AppShellProps = {
  children: ReactNode;
  currentStep: AppStep;
  eyebrow?: string;
};

export function AppShell({ children, currentStep, eyebrow }: AppShellProps) {
  const online = useOnlineStatus();

  return (
    <div className="app-canvas">
      <a
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-[var(--radius-control)] bg-brand px-4 py-3 font-semibold text-white transition-transform focus:translate-y-0"
        href="#main-content"
      >
        본문으로 건너뛰기
      </a>
      <div className="iphone-shell" aria-label="깨딱 앱">
        <div className="iphone-screen">
          <div className="iphone-status-bar" aria-hidden="true">
            <time className="iphone-time" dateTime="09:41">
              9:41
            </time>
            <span className="dynamic-island" />
            <div className="iphone-status-icons">
              <svg viewBox="0 0 18 12" role="presentation">
                <rect x="1" y="8" width="2.5" height="3" rx="1" />
                <rect x="5.5" y="6" width="2.5" height="5" rx="1" />
                <rect x="10" y="3" width="2.5" height="8" rx="1" />
                <rect x="14.5" width="2.5" height="11" rx="1" />
              </svg>
              <svg viewBox="0 0 18 13" role="presentation">
                <path d="M1 4.6C5.5.8 12.5.8 17 4.6" />
                <path d="M4 7.6c2.8-2.2 7.2-2.2 10 0" />
                <path d="M7.2 10.3a3 3 0 0 1 3.6 0" />
                <circle cx="9" cy="11.4" r="1" />
              </svg>
              <span className="iphone-battery">
                <span />
              </span>
            </div>
          </div>

          <div className="app-frame" data-flow-step={currentStep}>
            <header className="site-header mx-5 flex items-center justify-between py-2">
              <Link
                aria-label="깨딱 홈"
                className="inline-flex min-h-11 items-center"
                href="/"
              >
                <BrandLogo className="brand-logo-header" priority />
              </Link>
              <Link
                aria-label="개인정보 설정"
                className="header-icon-button"
                href="/settings/privacy"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" />
                  <path d="M19.4 13.5a7.8 7.8 0 0 0 .05-3l1.6-1.25-2-3.46-1.9.77a8.1 8.1 0 0 0-2.6-1.5L14.25 3h-4.5l-.3 2.06a8.1 8.1 0 0 0-2.6 1.5l-1.9-.77-2 3.46 1.6 1.25a7.8 7.8 0 0 0 .05 3L3 14.75l2 3.46 1.9-.77a8.1 8.1 0 0 0 2.55 1.5l.3 2.06h4.5l.3-2.06a8.1 8.1 0 0 0 2.55-1.5l1.9.77 2-3.46-1.6-1.25Z" />
                </svg>
              </Link>
            </header>

            {!online ? (
              <p
                aria-live="polite"
                className="soft-card mx-4 mt-4 rounded-[var(--radius-control)] px-4 py-3 text-sm font-semibold text-brand"
                role="status"
              >
                오프라인 상태입니다. 로컬 기능은 계속 사용할 수 있고 서버
                동기화는 연결 후 다시 시도합니다.
              </p>
            ) : null}

            <main className="mt-4 w-full px-5 pb-16" id="main-content" tabIndex={-1}>
              {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
              {children}
            </main>
          </div>

          <div className="iphone-home-indicator" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
