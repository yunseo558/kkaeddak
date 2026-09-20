"use client";

import Image from "next/image";
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

const SETTINGS_ICON_SRC: Record<SettingsIconName, string> = {
  automation: "/brand/settings/automation.png",
  category: "/brand/settings/category.png",
  alarm: "/brand/settings/alarm.png",
  connection: "/brand/settings/connection.png",
  profile: "/brand/settings/profile.png",
  privacy: "/brand/settings/privacy.png",
};

export function SettingsIcon({ name }: { name: SettingsIconName }) {
  return (
    <Image
      alt=""
      className="settings-clay-icon"
      draggable={false}
      height={56}
      src={SETTINGS_ICON_SRC[name]}
      width={56}
    />
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
          <div className="mypage-avatar" aria-hidden="true">
            <Image
              alt=""
              className="mypage-avatar-image"
              height={112}
              priority
              sizes="112px"
              src="/brand/kkaeddak-profile-writing.png"
              width={112}
            />
          </div>
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
