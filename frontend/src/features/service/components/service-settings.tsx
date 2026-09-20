"use client";

import Link from "next/link";
import { useId } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { automationEligibility } from "../model/service-policy";
import { useServiceStore } from "../model/service-store";
import { serviceNow } from "../lib/service-actions";

export type SettingsIconName =
  | "automation"
  | "category"
  | "alarm"
  | "connection"
  | "profile"
  | "privacy";

export function SettingsIcon({ name }: { name: SettingsIconName }) {
  const id = useId().replace(/:/g, "");
  const base = {
    automation: "#f7aac0",
    category: "#c9e77b",
    alarm: "#f8ecd4",
    connection: "#c9e77b",
    profile: "#f8ecd4",
    privacy: "#f7bdca",
  }[name];
  const graphic = {
    automation: <>
      <path d="M14 31c4.8-9 10.4-13.4 17-13.4" stroke="#fff5e8" strokeWidth="5" strokeLinecap="round" />
      <circle cx="14" cy="31" r="5" fill="#6a8131" />
      <path d="m32 12 1.8 4.2L38 18l-4.2 1.8L32 24l-1.8-4.2L26 18l4.2-1.8Z" fill="#fff5e8" />
    </>,
    category: <>
      {[[12, 12], [26, 12], [12, 26], [26, 26]].map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="10" height="10" rx="3.5" fill="#fff8e9" />)}
      <rect x="29" y="29" width="4" height="4" rx="2" fill="#ef8aaa" />
    </>,
    alarm: <>
      <circle cx="24" cy="25" r="11" fill="#ef92ad" />
      <path d="M16 13 12 17M32 13l4 4" stroke="#a63d64" strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="24" cy="25" r="7.2" fill="#fff8e9" />
      <path d="M24 20v5l3.5 2" stroke="#52672c" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m18 36-2 3M30 36l2 3" stroke="#a63d64" strokeWidth="3" strokeLinecap="round" />
    </>,
    connection: <>
      <path d="m21 29-3 3a6 6 0 0 1-8.5-8.5l5-5a6 6 0 0 1 8.5 0" stroke="#fff8e9" strokeWidth="5" strokeLinecap="round" />
      <path d="m27 19 3-3a6 6 0 0 1 8.5 8.5l-5 5a6 6 0 0 1-8.5 0" stroke="#fff8e9" strokeWidth="5" strokeLinecap="round" />
      <path d="m18.5 29.5 11-11" stroke="#6a8131" strokeWidth="3" strokeLinecap="round" />
    </>,
    profile: <>
      <circle cx="24" cy="18" r="7" fill="#ef92ad" />
      <path d="M11 37c1.2-8.2 5.6-12.3 13-12.3S35.8 28.8 37 37" fill="#6a8131" />
      <path d="M14 36c2-5.4 5.3-8 10-8s8 2.6 10 8" stroke="#fff8e9" strokeOpacity=".35" strokeWidth="2" strokeLinecap="round" />
    </>,
    privacy: <>
      <path d="M15 17h18l-1.4 21H16.4Z" fill="#fff7e9" />
      <path d="M13 15h22M20 15v-4h8v4" stroke="#aa365e" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 22v9M27 22v9" stroke="#ef8aaa" strokeWidth="3" strokeLinecap="round" />
    </>,
  }[name];
  return (
    <svg className="settings-clay-icon" viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <filter id={`${id}-shadow`} x="-35%" y="-30%" width="180%" height="190%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.2" floodColor="#6d614e" floodOpacity=".18" />
        </filter>
      </defs>
      <g filter={`url(#${id}-shadow)`}>
        <rect x="3" y="3" width="42" height="42" rx="14" fill={base} />
        <path d="M9 17C12 9.5 18 7 27 7h6c5.5 0 8 2.5 8 8" fill="none" stroke="#fff" strokeOpacity=".28" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M10 41h28" stroke="#6b604e" strokeOpacity=".08" strokeWidth="2" strokeLinecap="round" />
        {graphic}
      </g>
    </svg>
  );
}

const MENU = [
  { href: "/settings/automation", icon: "automation" as const, title: "자동화 설정" },
  { href: "/settings/schedule-types", icon: "category" as const, title: "일정 유형 관리" },
  { href: "/settings/alarms", icon: "alarm" as const, title: "알람 설정" },
  { href: "/settings/connections", icon: "connection" as const, title: "연동 설정" },
];

export function ServiceSettings() {
  const store = useServiceStore();
  const draft = useCurrentFlowStore((state) => state.onboardingDraft);
  const progress = automationEligibility({ enrolledAt: store.enrolledAt ?? serviceNow(), now: serviceNow(), consent: true, records: store.records, importance: "NORMAL", requiresApproval: false });
  const descriptions: Record<string, string> = {
    "자동화 설정": draft.automationMode === "automatic" ? "14일 학습 후 자동 적용" : "항상 확인 후 적용",
    "일정 유형 관리": `${store.scheduleTypes.length}개 유형 · AI 자동 분류`,
    "알람 설정": `${store.preferredAlarmCount}개 · ${store.alarmIntervalMinutes}분 간격`,
    "연동 설정": `캘린더 ${store.calendarConnected ? "연동됨" : "미연동"} · 건강 ${store.healthConnected ? "연동됨" : "미연동"}`,
  };

  return (
    <AppShell currentStep="결과">
      <div className="service-home settings-screen">
        <section className="mypage-profile" aria-labelledby="mypage-name">
          <div className="mypage-avatar" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="18" r="9" /><path d="M8 43c1.8-10 7.2-15 16-15s14.2 5 16 15" /></svg></div>
          <h1 id="mypage-name">깨딱이</h1>
          <p>기상 루틴 학습 {Math.max(1, progress.elapsedDays + 1)}일차</p>
        </section>

        <h2 className="mypage-list-title">마이페이지</h2>
        <nav className="mypage-links" aria-label="주요 설정">
          {MENU.map((item) => <Link href={item.href} key={item.href}><span className="mypage-menu-icon"><SettingsIcon name={item.icon} /></span><span><strong>{item.title}</strong><small>{descriptions[item.title]}</small></span><span className="mypage-chevron" aria-hidden="true">›</span></Link>)}
          <Link href="/onboarding" onClick={() => useCurrentFlowStore.getState().setOnboardingStep(0)}><span className="mypage-menu-icon"><SettingsIcon name="profile" /></span><span><strong>기본 정보 다시 설정</strong><small>기상 습관과 초기 설정 수정</small></span><span className="mypage-chevron" aria-hidden="true">›</span></Link>
          <Link className="mypage-danger-link" href="/settings/privacy"><span className="mypage-menu-icon"><SettingsIcon name="privacy" /></span><span><strong>개인정보 및 초기화</strong><small>동기화 동의 · 전체 데이터 삭제</small></span><span className="mypage-chevron" aria-hidden="true">›</span></Link>
        </nav>
      </div>
    </AppShell>
  );
}
