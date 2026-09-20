"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { useOnlineStatus } from "@/lib/network/use-online-status";
import { useServiceStore } from "@/features/service/model/service-store";
import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { clockTime } from "@/features/service/model/service-policy";
import { DemoControls } from "@/features/service/components/demo-controls";
import { ClayIcon, type ClayIconName } from "@/components/brand/clay-icon";
import homeStyles from "@/features/service/components/service-home.module.css";

const homeTabs: { href: string; label: string; icon: ClayIconName }[] = [
  { href: "/sleep", label: "건강", icon: "health" },
  { href: "/calendar", label: "캘린더", icon: "calendar" },
  { href: "/", label: "홈", icon: "home" },
  { href: "/history", label: "기록", icon: "chart" },
  { href: "/settings", label: "마이", icon: "user" },
];

type AppStep = "소개" | "분석" | "준비" | "계획" | "결과";

type AppShellProps = {
  children: ReactNode;
  currentStep: AppStep;
  eyebrow?: string;
  immersive?: boolean;
  homeScene?: boolean;
};

export function AppShell({
  children,
  currentStep,
  eyebrow,
  immersive = false,
  homeScene = false,
}: AppShellProps) {
  const pathname = usePathname();
  const currentPath = pathname ?? "/";
  const online = useOnlineStatus();
  const authenticated = useCurrentFlowStore((s) => s.demoAuthenticated);
  const connected = useServiceStore((s) => s.calendarConnected);
  const virtualNow = useServiceStore((s) => s.virtualNow);
  const isSettingsPage = currentPath.startsWith("/settings");
  const isTabActive = (href: string) =>
    href === "/"
      ? currentPath === href
      : currentPath === href || currentPath.startsWith(`${href}/`);

  return (
    <div className={`app-canvas${homeScene ? ` ${homeStyles.shell}` : ""}`}>
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
                {!isSettingsPage && (
                  <Link
                    aria-label="마이페이지"
                    className="header-icon-button"
                    href="/settings"
                  >
                    <ClayIcon name="user" size={34} />
                  </Link>
                )}
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
          {authenticated && pathname !== "/onboarding" && !immersive && (
            <nav className="service-tabbar" aria-label="주 메뉴">
              {homeTabs.map((tab) => {
                const active = isTabActive(tab.href);
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    data-active={active}
                    href={tab.href}
                    key={tab.href}
                  >
                    <ClayIcon name={tab.icon} size={30} />
                    <span>{tab.label}</span>
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      </div>
      {connected && !immersive && <DemoControls />}
    </div>
  );
}
