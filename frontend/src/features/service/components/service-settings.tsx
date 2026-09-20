"use client";

import Link from "next/link";
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
  const graphic = {
    automation: <><path d="M7 16.5c1.7-3.9 3.9-6 6.5-6 1.4 0 2.6.5 3.5 1.4" /><path d="m15.5 7 .7 1.8L18 9.5l-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" /><circle cx="6.5" cy="17" r="2" /></>,
    category: <><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></>,
    alarm: <><path d="M6.5 9.5a5.5 5.5 0 0 1 11 0v3.2l1.7 2.8H4.8l1.7-2.8V9.5Z" /><path d="M10 18.5a2.2 2.2 0 0 0 4 0M5.5 5.5 3.8 7.2M18.5 5.5l1.7 1.7" /></>,
    connection: <><path d="M9.2 14.8 7.5 16.5a3.2 3.2 0 0 1-4.5-4.5l3-3a3.2 3.2 0 0 1 4.5 0" /><path d="m14.8 9.2 1.7-1.7A3.2 3.2 0 0 1 21 12l-3 3a3.2 3.2 0 0 1-4.5 0M8.5 15.5l7-7" /></>,
    profile: <><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20c.6-4.3 2.8-6.4 6.5-6.4s5.9 2.1 6.5 6.4" /></>,
    privacy: <><path d="M5 7.5h14M9 7.5V5h6v2.5M7.5 7.5l.8 12h7.4l.8-12M10 11v5M14 11v5" /></>,
  }[name];
  return <svg viewBox="0 0 24 24" aria-hidden="true">{graphic}</svg>;
}

const MENU = [
  { href: "/settings/automation", icon: "automation" as const, tone: "pink", title: "자동화 설정" },
  { href: "/settings/schedule-types", icon: "category" as const, tone: "avocado", title: "일정 유형 관리" },
  { href: "/settings/alarms", icon: "alarm" as const, tone: "cream", title: "알람 설정" },
  { href: "/settings/connections", icon: "connection" as const, tone: "avocado", title: "연동 설정" },
];

export function ServiceSettings() {
  const store = useServiceStore();
  const draft = useCurrentFlowStore((state) => state.onboardingDraft);
  const progress = automationEligibility({ enrolledAt: store.enrolledAt ?? serviceNow(), now: serviceNow(), consent: true, records: store.records, importance: "NORMAL", requiresApproval: false });
  const fatigueLabel =
    store.plan?.fatigueLevel === "HIGH"
      ? "높음"
      : store.plan?.fatigueLevel === "MEDIUM"
        ? "보통"
        : "낮음";
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

        <Link className="mypage-health" href="/sleep" aria-labelledby="health-summary-title">
          <div className="mypage-health-heading"><div><p>최근 건강 분석</p><h2 id="health-summary-title">{store.plan ? `피로도 ${fatigueLabel}으로 분석했어요` : "건강 신호를 기상 계획에 반영해요"}</h2></div><span>자세히</span></div>
          <div className="mypage-health-stats"><div><span>AI 피로도</span><strong>{store.plan ? `${store.plan.fatigueScore}점` : "분석 전"}</strong></div><div><span>제안 알람</span><strong>{store.plan ? `${store.plan.steps.length}개` : `${store.preferredAlarmCount}개`}</strong></div></div>
        </Link>

        <h2 className="mypage-list-title">마이페이지</h2>
        <nav className="mypage-links" aria-label="주요 설정">
          {MENU.map((item) => <Link href={item.href} key={item.href}><span className={`mypage-menu-icon mypage-menu-icon--${item.tone}`}><SettingsIcon name={item.icon} /></span><span><strong>{item.title}</strong><small>{descriptions[item.title]}</small></span><span className="mypage-chevron" aria-hidden="true">›</span></Link>)}
          <Link href="/onboarding" onClick={() => useCurrentFlowStore.getState().setOnboardingStep(0)}><span className="mypage-menu-icon mypage-menu-icon--cream"><SettingsIcon name="profile" /></span><span><strong>기본 정보 다시 설정</strong><small>기상 습관과 초기 설정 수정</small></span><span className="mypage-chevron" aria-hidden="true">›</span></Link>
          <Link className="mypage-danger-link" href="/settings/privacy"><span className="mypage-menu-icon mypage-menu-icon--danger"><SettingsIcon name="privacy" /></span><span><strong>개인정보 및 초기화</strong><small>동기화 동의 · 전체 데이터 삭제</small></span><span className="mypage-chevron" aria-hidden="true">›</span></Link>
        </nav>
      </div>
    </AppShell>
  );
}
