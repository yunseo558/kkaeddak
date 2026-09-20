"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { useOnlineStatus } from "@/lib/network/use-online-status";
import { useServiceStore } from "@/features/service/model/service-store";
import { clockTime } from "@/features/service/model/service-policy";
import { DemoControls } from "@/features/service/components/demo-controls";

type AppStep = "소개" | "분석" | "준비" | "계획" | "결과";

type AppShellProps = {
  children: ReactNode;
  currentStep: AppStep;
  eyebrow?: string;
  immersive?: boolean;
};

export function AppShell({
  children,
  currentStep,
  eyebrow,
  immersive = false,
}: AppShellProps) {
  const pathname = usePathname();
  const online = useOnlineStatus();
  const connected = useServiceStore((s) => s.calendarConnected);
  const virtualNow = useServiceStore((s) => s.virtualNow);

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
              {virtualNow ? clockTime(virtualNow) : "9:41"}
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

          <div
            className={`app-frame${immersive ? " app-frame--immersive" : ""}`}
            data-flow-step={currentStep}
          >
            {!immersive && (
              <header className="site-header mx-5 flex items-center justify-between py-2">
                <Link
                  aria-label="깨딱 홈"
                  className="inline-flex min-h-11 items-center"
                  href="/"
                >
                  <BrandLogo className="brand-logo-header" priority />
                </Link>
                <Link
                  aria-label="마이페이지"
                  className="header-icon-button"
                  href="/settings"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <circle cx="12" cy="8" r="3.5" />
                    <path d="M5.5 20c.6-4.2 2.8-6.3 6.5-6.3s5.9 2.1 6.5 6.3" />
                  </svg>
                </Link>
              </header>
            )}

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

            <main
              className={
                immersive
                  ? "entry-main w-full"
                  : "mt-4 w-full px-5 pb-16"
              }
              id="main-content"
              tabIndex={-1}
            >
              {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
              {children}
            </main>
          </div>

          <div className="iphone-home-indicator" aria-hidden="true" />
          {connected && !immersive && (
            <nav className="service-tabbar" aria-label="주 메뉴">
              <Link data-active={pathname === "/sleep"} href="/sleep">
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18.7 15.5A7.8 7.8 0 0 1 8.5 5.3 8.2 8.2 0 1 0 18.7 15.5Z" /></svg>
                <span>수면 패턴</span>
              </Link>
              <Link data-active={pathname === "/calendar"} href="/calendar">
                <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3.5" y="5.5" width="17" height="15" rx="3" /><path d="M7.5 3.5v4M16.5 3.5v4M3.5 10h17" /></svg>
                <span>캘린더</span>
              </Link>
              <Link className="service-tabbar-home" data-active={pathname === "/"} href="/">
                <span className="service-tabbar-home-icon"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m4 11 8-7 8 7v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5V11Z" /><path d="M9 21v-6h6v6" /></svg></span>
                <span>홈</span>
              </Link>
              <Link data-active={pathname === "/history"} href="/history">
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></svg>
                <span>기록</span>
              </Link>
              <Link data-active={pathname.startsWith("/settings")} href="/settings">
                <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20c.6-4.2 2.8-6.3 6.5-6.3s5.9 2.1 6.5 6.3" /></svg>
                <span>마이</span>
              </Link>
            </nav>
          )}
        </div>
      </div>
      {connected && !immersive && <DemoControls />}
    </div>
  );
}
