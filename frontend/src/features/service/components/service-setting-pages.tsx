"use client";

import Link from "next/link";
import { useState } from "react";
import { demoSessionHeaders } from "@kkaeddak/api-client";
import { AppShell } from "@/components/layout/app-shell";
import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";
import { apiClient } from "@/lib/api/client";
import { automationEligibility } from "../model/service-policy";
import { useServiceStore, type ScheduleTypeRule } from "../model/service-store";
import {
  connectCalendar,
  connectHealth,
  saveCalendarEvents,
  saveServicePreferences,
  serviceAction,
  serviceNow,
} from "../lib/service-actions";
import {
  enableWebAlarmNotifications,
  webAlarmPermission,
  type WebAlarmPermission,
} from "../lib/alarm-audio";

function SettingsHeader({ title, description }: { title: string; description: string }) {
  return <header className="settings-detail-header"><Link aria-label="마이페이지로 돌아가기" href="/settings">‹</Link><div><h1>{title}</h1><p>{description}</p></div></header>;
}

function Feedback({ saved, message }: { saved: boolean; message: string | null }) {
  return <>{saved && <p role="status" className="service-feedback">저장했어요. 다음 기상 계획부터 반영해요.</p>}{message && <p role="alert" className="service-error">{message}</p>}</>;
}

export function AutomationSettings() {
  const store = useServiceStore();
  const draft = useCurrentFlowStore((state) => state.onboardingDraft);
  const [mode, setMode] = useState<"human" | "automatic">(draft.automationMode === "automatic" ? "automatic" : "human");
  const [early, setEarly] = useState(store.earlyAutomationEnabled);
  const [saved, setSaved] = useState(false);
  const progress = automationEligibility({ enrolledAt: store.enrolledAt ?? serviceNow(), now: serviceNow(), consent: true, records: store.records, importance: "NORMAL", requiresApproval: false });
  const before14Days = progress.elapsedDays < 14;

  const save = async () => {
    const nextDraft = { ...draft, automationMode: mode === "automatic" ? "automatic" as const : "suggest" as const };
    useCurrentFlowStore.getState().setOnboardingDraft(nextDraft);
    store.set({ earlyAutomationEnabled: mode === "automatic" && before14Days ? early : false });
    const id = useDemoSessionStore.getState().sessionId;
    if (id) {
      const headers = demoSessionHeaders(id);
      const profile = await apiClient.GET("/api/v1/profile", { headers });
      if (!profile.data) throw new Error("설정을 불러오지 못했어요.");
      const result = await apiClient.PUT("/api/v1/profile", { headers, body: { timezone: profile.data.timezone, locale: profile.data.locale, revision: profile.data.revision, automationMode: mode === "automatic" ? "AUTO_ROUTINE_DAYS" : "RECOMMEND_ONLY", allowImportantEventDetection: profile.data.allowImportantEventDetection, allowAggregateOutcomeSync: profile.data.allowAggregateOutcomeSync } });
      if (!result.data || result.error) throw new Error("자동화 설정을 저장하지 못했어요.");
    }
    setSaved(true);
  };

  return <AppShell currentStep="결과"><div className="service-home settings-detail"><SettingsHeader title="자동화 설정" description="AI 제안을 확인할지, 자동으로 반영할지 설정해요." /><form className="settings-detail-form" onSubmit={(event) => { event.preventDefault(); void serviceAction(save); }}>
    <section><h2>계획 적용 방식</h2><label className="settings-choice"><input type="radio" name="automation" checked={mode === "human"} onChange={() => { setMode("human"); setEarly(false); setSaved(false); }} /><span><strong>항상 확인 후 적용</strong><small>기본 설정 · 매일 추천된 알람을 승인한 뒤 적용해요.</small></span></label><label className="settings-choice"><input type="radio" name="automation" checked={mode === "automatic"} onChange={() => { setMode("automatic"); setSaved(false); }} /><span><strong>자동 적용</strong><small>14일 동안 기상 패턴을 학습한 뒤 일반 일정에 자동으로 반영해요.</small></span></label></section>
    {mode === "automatic" && before14Days && <section className="settings-warning"><strong>아직 AI가 기상 패턴을 학습 중이에요</strong><p>14일 전에는 판별 기록이 적어 오차가 많을 수 있어요. 자동 적용 전 시각을 꼭 확인해 주세요.</p><label className="service-checkbox"><input type="checkbox" checked={early} onChange={(event) => { setEarly(event.target.checked); setSaved(false); }} />14일 전부터 자동 적용 시작</label></section>}
    <p className="service-footnote">{mode === "human" ? "Human-in-the-loop 방식으로 사용 중이에요." : early && before14Days ? "조기 자동 적용을 선택했어요." : before14Days ? `${14 - progress.elapsedDays}일 뒤 자동 적용할 수 있어요.` : "자동 적용 중이며 언제든 확인 방식으로 돌아갈 수 있어요."}</p>
    <p className="settings-human-loop"><strong>14일 이후에도 선택권은 계속 남아요.</strong><br />언제든 Human-in-the-loop, 즉 승인 후 적용 방식으로 돌아가거나 자동 적용된 계획을 수정·취소할 수 있어요.</p><button disabled={store.busy} className="service-primary">설정 저장</button><Feedback saved={saved} message={store.message} />
  </form></div></AppShell>;
}

export function ScheduleTypeSettings() {
  const store = useServiceStore();
  const [types, setTypes] = useState<ScheduleTypeRule[]>(store.scheduleTypes);
  const [newLabel, setNewLabel] = useState("");
  const [newMinutes, setNewMinutes] = useState(60);
  const [saved, setSaved] = useState(false);
  const update = (code: string, patch: Partial<ScheduleTypeRule>) => { setTypes((current) => current.map((item) => item.code === code ? { ...item, ...patch } : item)); setSaved(false); };
  const save = async () => {
    const fallback = types.find((item) => item.isFallback);
    if (!fallback) throw new Error("기타 유형은 반드시 필요해요.");
    const removed = new Set(store.scheduleTypes.filter((item) => !types.some((next) => next.code === item.code)).map((item) => item.code));
    const events = store.events.map((item) => removed.has(item.category) ? { ...item, category: fallback.code } : item);
    store.set({ scheduleTypes: types, events });
    await saveServicePreferences();
    if (removed.size) await saveCalendarEvents(events);
    setSaved(true);
  };
  return <AppShell currentStep="결과"><div className="service-home settings-detail"><SettingsHeader title="일정 유형 관리" description="AI가 일정 이름을 분류할 기준과 기상 시간을 관리해요." /><form className="settings-detail-form" onSubmit={(event) => { event.preventDefault(); void serviceAction(save); }}><div className="schedule-type-settings">{types.map((item) => <div className="schedule-type-row" key={item.code}><label>유형 이름<input value={item.label} maxLength={30} required onChange={(event) => update(item.code, { label: event.target.value })} />{item.isFallback && <small className="schedule-type-fallback">AI가 일정명을 구별하지 못할 때 적용</small>}</label><label>분 전<input type="number" min={15} max={300} required value={item.wakeLeadMin} onChange={(event) => update(item.code, { wakeLeadMin: Math.max(15, Math.min(300, Number(event.target.value))) })} /></label><button type="button" className="service-text-button danger-text" disabled={item.isFallback} onClick={() => { if (window.confirm(`${item.label} 유형을 삭제할까요? 해당 일정은 기타로 이동해요.`)) { setTypes((current) => current.filter((type) => type.code !== item.code)); setSaved(false); } }}>{item.isFallback ? "필수" : "삭제"}</button></div>)}</div><div className="schedule-type-add"><input aria-label="새 유형 이름" placeholder="새 유형 이름" value={newLabel} onChange={(event) => setNewLabel(event.target.value)} /><input aria-label="새 유형 기상 시간" type="number" min={15} max={300} value={newMinutes} onChange={(event) => setNewMinutes(Number(event.target.value))} /><button type="button" className="service-secondary" disabled={!newLabel.trim() || types.length >= 20} onClick={() => { setTypes((current) => [...current, { code: `CUSTOM_${Date.now().toString(36).toUpperCase()}`, label: newLabel.trim(), wakeLeadMin: Math.max(15, Math.min(300, newMinutes)), isFallback: false }]); setNewLabel(""); setNewMinutes(60); setSaved(false); }}>유형 추가</button></div><button disabled={store.busy} className="service-primary">저장</button><Feedback saved={saved} message={store.message} /></form></div></AppShell>;
}

export function AlarmSettings() {
  const store = useServiceStore();
  const [time, setTime] = useState(store.automationTime);
  const [count, setCount] = useState(store.preferredAlarmCount);
  const [interval, setInterval] = useState(store.alarmIntervalMinutes);
  const [safety, setSafety] = useState(store.keepSafetyAlarm);
  const [saved, setSaved] = useState(false);
  const [notificationPermission, setNotificationPermission] =
    useState<WebAlarmPermission>(() => webAlarmPermission());
  const save = async () => { store.set({ automationTime: time, preferredAlarmCount: count, alarmIntervalMinutes: interval, keepSafetyAlarm: safety }); await saveServicePreferences(); setSaved(true); };
  return <AppShell currentStep="결과"><div className="service-home settings-detail"><SettingsHeader title="알람 설정" description="계획을 계산할 시각과 기본 알람 방식을 설정해요." /><form className="settings-detail-form service-edit" onSubmit={(event) => { event.preventDefault(); void serviceAction(save); }}><label>매일 계획을 계산할 시각<input type="time" value={time} required onChange={(event) => { setTime(event.target.value); setSaved(false); }} /><span className="service-footnote">이 시각에 내일 일정과 수면 기록을 확인해요.</span></label><label>기본 알람 개수<select value={count} onChange={(event) => { setCount(Number(event.target.value)); setSaved(false); }}><option value={1}>1개</option><option value={2}>2개</option><option value={3}>3개</option></select></label><label>알람 간격<select value={interval} onChange={(event) => { setInterval(Number(event.target.value)); setSaved(false); }}><option value={5}>5분</option><option value={10}>10분</option><option value={15}>15분</option><option value={20}>20분</option></select></label><label className="service-checkbox"><input type="checkbox" checked={safety} onChange={(event) => { setSafety(event.target.checked); setSaved(false); }} />피곤하거나 중요한 날에는 안전 알람 추가</label><section className="connection-card"><div className="connection-card-heading"><span aria-hidden="true">🔔</span><div><h2>웹 시스템 알람</h2><p>알람 시각에 소리와 브라우저 알림을 같이 보내요.</p></div><b data-connected={notificationPermission === "granted"}>{notificationPermission === "granted" ? "허용됨" : notificationPermission === "denied" ? "차단됨" : "허용 필요"}</b></div>{notificationPermission !== "granted" && notificationPermission !== "unsupported" && <button type="button" className="service-secondary" onClick={() => void enableWebAlarmNotifications().then(setNotificationPermission)}>웹 알림 허용</button>}<p className="service-footnote">웹 알람은 브라우저가 열려 있을 때 작동해요. 데모에서는 ‘알람 지금 울리기’로 즉시 확인할 수 있어요.</p></section><button disabled={store.busy} className="service-primary">설정 저장</button><Feedback saved={saved} message={store.message} /></form></div></AppShell>;
}

export function ConnectionSettings() {
  const store = useServiceStore();
  return <AppShell currentStep="결과"><div className="service-home settings-detail"><SettingsHeader title="연동 설정" description="기상 계획에 사용할 일정과 수면 데이터를 관리해요." />{store.message && <p role="alert" className="service-error">{store.message}</p>}<section className="connection-card"><div className="connection-card-heading"><span aria-hidden="true">📅</span><div><h2>내 캘린더</h2><p>일정 이름과 시각으로 기상 기준을 계산해요.</p></div><b data-connected={store.calendarConnected}>{store.calendarConnected ? "연동 완료" : "미연동"}</b></div><p className="service-footnote">현재 연결 소스: 샘플 캘린더. 2026년 10월 30일까지 수업·회의·시험·면접·약속·운동 일정이 들어 있어요.</p><button disabled={store.busy} className="service-secondary" onClick={() => void serviceAction(() => connectCalendar(store.calendarConnected))}>{store.calendarConnected ? "연결 새로고침" : "캘린더 연결"}</button></section><section className="connection-card"><div className="connection-card-heading"><span aria-hidden="true">🌙</span><div><h2>Apple 건강</h2><p>수면·활동·컨디션을 예비 알람에 반영해요.</p></div><b data-connected={store.healthConnected}>{store.healthConnected ? "샘플 연동 완료" : "미연동"}</b></div><p className="service-footnote">웹 데모는 HealthKit의 HKCategorySample·HKQuantitySample 구조를 따른 샘플을 공통 어댑터로 정규화해 수면·활동·컨디션 분석을 실행해요. iOS 정식 버전에서는 같은 어댑터 경계에 HealthKit 조회 결과를 연결하면 됩니다.</p>{!store.healthConnected && <button disabled={store.busy} className="service-secondary" onClick={() => void serviceAction(connectHealth)}>HealthKit 샘플 연결</button>}</section></div></AppShell>;
}
