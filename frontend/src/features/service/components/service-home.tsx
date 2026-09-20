"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { BrandLogo } from "@/components/brand/brand-logo";
import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { useServiceStore } from "../model/service-store";
import {
  addDays,
  atTime,
  automationEligibility,
  clockTime,
  localDate,
} from "../model/service-policy";
import {
  decideServicePlan,
  ensureMockCalendarCoverage,
  generateServicePlan,
  saveServiceOutcome,
  serviceAction,
  serviceNow,
} from "../lib/service-actions";
import { startAlarmSound, stopAlarmSound } from "../lib/alarm-audio";

const subscribeHydration = () => () => {};
let splashShownInRuntime = false;

export function ServiceHome() {
  const ready = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const [showSplash, setShowSplash] = useState(() => !splashShownInRuntime);
  const [edit, setEdit] = useState(false);
  const [time, setTime] = useState("");
  const store = useServiceStore();
  const authenticated = useCurrentFlowStore((s) => s.demoAuthenticated);
  const completed = useCurrentFlowStore((s) => s.onboardingCompleted);
  const survey = useCurrentFlowStore((s) => s.onboardingDraft);
  useEffect(() => {
    if (!showSplash) return;
    splashShownInRuntime = true;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timer = window.setTimeout(
      () => setShowSplash(false),
      reducedMotion ? 500 : 1600,
    );
    return () => window.clearTimeout(timer);
  }, [showSplash]);
  useEffect(
    () => () => {
      stopAlarmSound();
      if (useServiceStore.getState().alarmStage === "ringing")
        useServiceStore.getState().set({ alarmStage: "confirm" });
    },
    [],
  );
  useEffect(() => {
    if (!store.calendarConnected) return;
    const tick = () => {
      const state = useServiceStore.getState();
      const now = serviceNow();
      if (
        !state.busy &&
        state.alarmStage === "idle" &&
        state.plan &&
        ["APPROVED", "EDITED"].includes(state.plan.status) &&
        Date.parse(now) >= Date.parse(state.plan.firstAlarmAt) &&
        Date.parse(now) < Date.parse(state.plan.firstAlarmAt) + 30_000
      ) {
        state.set({ alarmStage: "ringing" });
        void startAlarmSound().catch(() =>
          state.set({
            message:
              "소리 재생을 허용하려면 옆의 알람 지금 울리기를 눌러 주세요.",
          }),
        );
      }
      if (
        !state.busy &&
        state.alarmStage === "idle" &&
        clockTime(now) >= state.automationTime &&
        state.lastAutomationSlot !== localDate(now)
      ) {
        // Mark attempts too, so a failed server request cannot create a retry storm.
        state.set({ lastAutomationSlot: localDate(now) });
        void serviceAction(generateServicePlan);
      }
    };
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [store.calendarConnected]);
  useEffect(() => {
    if (!store.calendarConnected) return;
    void serviceAction(async () => {
      await ensureMockCalendarCoverage();
      const targetDate = addDays(localDate(serviceNow()), 1);
      if (useServiceStore.getState().plan?.localDate !== targetDate) {
        await generateServicePlan();
      }
    });
  }, [store.calendarConnected, store.plan?.localDate, store.virtualNow]);

  const dismissSplash = () => {
    setShowSplash(false);
  };

  if (!ready || showSplash)
    return (
      <AppShell currentStep="소개" immersive>
        <button
          aria-label="스플래시 건너뛰기"
          className="splash-screen"
          data-testid="splash-screen"
          onClick={dismissSplash}
          type="button"
        >
          <Image
            alt="일정과 수면 패턴을 분석해 알람을 준비하는 깨딱"
            className="splash-artwork"
            height={1672}
            priority
            src="/brand/kkaeddak-splash.png"
            width={941}
          />
        </button>
      </AppShell>
    );
  if (!authenticated)
    return (
      <AppShell currentStep="소개" immersive>
        <div className="auth-screen">
          <div className="auth-brand">
            <BrandLogo className="auth-logo" priority />
            <p>내일 아침을 알아서 준비하는 AI 기상 에이전트</p>
          </div>
          <div className="auth-access">
            <h1>로그인 / 회원가입</h1>
            <button
              className="auth-button"
              onClick={() =>
                useCurrentFlowStore.getState().setDemoAuthenticated(true)
              }
              type="button"
            >
              데모 버전으로 로그인
            </button>
            <p className="auth-upcoming">
              카카오 · Google · Apple 계정 연동은 준비 중이에요.
            </p>
            <p className="auth-terms">
              계속하면 깨딱의 이용약관과 개인정보 처리방침에 동의하게 됩니다.
            </p>
          </div>
        </div>
      </AppShell>
    );
  if (!completed)
    return (
      <AppShell currentStep="소개">
        <div className="setup-home">
          <header className="service-heading">
            <div>
              <p className="service-muted">처음 오셨군요</p>
              <h1>내일 아침을 준비해볼까요?</h1>
            </div>
            <span className="service-tag">설정 전</span>
          </header>
          <section className="setup-card">
            <div className="setup-icon" aria-hidden="true">
              <Image
                alt=""
                height={560}
                priority
                src="/brand/kkaeddak-alarm-clock.png"
                width={600}
              />
            </div>
            <p className="service-kicker">첫 기상 계획</p>
            <h2>먼저 기본 설정이 필요해요</h2>
            <p className="service-muted">
              평소 기상 습관과 일정 유형을 알려주면 내일 필요한 알람을
              계산할게요.
            </p>
            <Link className="service-primary" href="/onboarding">
              설정하러 가기
            </Link>
          </section>
          <section className="setup-preview" aria-label="설정 후 제공 기능">
            <div>
              <span>01</span>
              <p>캘린더 일정 유형 판단</p>
            </div>
            <div>
              <span>02</span>
              <p>맞춤 기상 시각 계산</p>
            </div>
            <div>
              <span>03</span>
              <p>기상 결과 학습</p>
            </div>
          </section>
        </div>
      </AppShell>
    );
  if (!store.calendarConnected)
    return (
      <AppShell currentStep="소개">
        <section className="service-section">
          <p className="service-kicker">마지막으로</p>
          <h1>내일 일정을 연결해 주세요</h1>
          <p className="service-muted">
            첫 일정의 유형을 판단해 필요한 기상 시각을 계산할게요.
          </p>
          <Link className="service-primary" href="/settings/connections">
            연동 설정으로 가기
          </Link>
        </section>
      </AppShell>
    );
  const plan = store.plan;
  const eligibility = automationEligibility({
    enrolledAt: store.enrolledAt!,
    now: serviceNow(),
    consent: survey.automationMode === "automatic",
    earlyOverride: store.earlyAutomationEnabled,
    records: store.records,
    importance: plan?.importance ?? "NORMAL",
    requiresApproval: false,
  });
  const approved = plan && ["APPROVED", "EDITED"].includes(plan.status);
  const status = !plan
    ? "계획 없음"
    : plan.status === "COMPLETED"
      ? "오늘 기상 기록 완료"
      : plan.status === "DECLINED"
        ? "알람 취소됨"
        : approved
          ? plan.automatic
            ? "자동으로 반영했어요"
            : "알람이 설정됐어요"
          : "확인을 기다리고 있어요";
  return (
    <AppShell currentStep="계획">
      <div className="service-home service-home-dashboard">
        <header className="service-heading">
          <div>
            <p className="service-muted">
              {new Date(serviceNow()).toLocaleDateString("ko-KR", {
                timeZone: "Asia/Seoul",
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </p>
            <h1>내일의 아침</h1>
          </div>
          <span className="service-tag">
            {eligibility.ready
              ? "맞춤 설정"
              : `함께한 지 ${eligibility.elapsedDays + 1}일`}
          </span>
        </header>
        {store.message && (
          <p className="service-error" role="alert">
            {store.message}
          </p>
        )}
        {store.alarmStage !== "idle" ? (
          <section className="service-alarm" aria-live="polite">
            <p className="service-kicker">
              {store.alarmStage === "ringing"
                ? "일어날 시간이에요"
                : "잠깐, 정말 일어났나요?"}
            </p>
            <p className="service-clock">
              {plan && clockTime(plan.firstAlarmAt)}
            </p>
            {store.alarmStage === "ringing" ? (
              <button
                className="service-primary"
                onClick={() => {
                  stopAlarmSound();
                  store.set({ alarmStage: "confirm" });
                }}
              >
                알람 끄기
              </button>
            ) : (
              <div className="service-stack">
                <button
                  disabled={store.busy}
                  className="service-primary"
                  onClick={() =>
                    void serviceAction(() => saveServiceOutcome(true))
                  }
                >
                  네, 일어났어요
                </button>
                <button
                  disabled={store.busy}
                  className="service-secondary"
                  onClick={() =>
                    void serviceAction(() => saveServiceOutcome(false))
                  }
                >
                  못 일어났어요
                </button>
              </div>
            )}
          </section>
        ) : (
          <section className="service-plan">
            <div className="service-row">
              <span className="service-kicker">{status}</span>
              <span className="home-clay-status" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M7 4.8 4.4 7.2M17 4.8l2.6 2.4" />
                  <circle cx="12" cy="13" r="6.5" />
                  <path d="M12 9.5V13l2.4 1.5M8.5 19.2 7 21M15.5 19.2 17 21" />
                </svg>
              </span>
            </div>
            <p className="service-clock">
              {plan ? clockTime(plan.firstAlarmAt) : "— : —"}
            </p>
            <p className="service-muted">
              {plan
                ? `${plan.localDate.slice(5).replace("-", "/")} · ${plan.steps.length}개의 알람`
                : "내일 일정을 확인해 주세요"}
            </p>
            {plan && (
              <div className="home-plan-target">
                <span aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <rect x="3.5" y="5.5" width="17" height="15" rx="3" />
                    <path d="M7.5 3.5v4M16.5 3.5v4M3.5 10h17" />
                  </svg>
                </span>
                <div>
                  <small>내일 첫 일정 · {plan.scheduleTypeLabel}</small>
                  <strong>{plan.eventTitle}</strong>
                </div>
                <time>{clockTime(plan.eventAt)}</time>
              </div>
            )}
            {plan && (
              <div className="alarm-times">
                {plan.steps.map((step, index) => (
                  <div key={step.order}>
                    <span>
                      {index === 0
                        ? "첫 알람"
                        : index === plan.steps.length - 1
                          ? "안전 알람"
                          : "예비 알람"}
                    </span>
                    <strong>
                      {clockTime(
                        index === plan.steps.length - 1
                          ? plan.finalAlarmAt
                          : new Date(
                              Date.parse(plan.firstAlarmAt) +
                                step.offsetMin * 60000,
                            ).toISOString(),
                      )}
                    </strong>
                  </div>
                ))}
              </div>
            )}
            {plan?.status === "PROPOSED" && (
              <button
                disabled={store.busy}
                className="service-primary"
                onClick={() =>
                  void serviceAction(() => decideServicePlan("APPROVE"))
                }
              >
                이 계획 승인
              </button>
            )}
            {approved && (
              <div className="service-actions">
                <button
                  onClick={() => {
                    setTime(clockTime(plan.firstAlarmAt));
                    setEdit(!edit);
                  }}
                >
                  시간 변경
                </button>
                <button
                  disabled={store.busy}
                  onClick={() =>
                    void serviceAction(() => decideServicePlan("DECLINE"))
                  }
                >
                  알람 취소
                </button>
              </div>
            )}
            {edit && approved && (
              <form
                className="service-edit"
                onSubmit={(e) => {
                  e.preventDefault();
                  void serviceAction(async () => {
                    await decideServicePlan(
                      "EDIT",
                      atTime(plan.localDate, time),
                    );
                    setEdit(false);
                  });
                }}
              >
                <label>
                  첫 알람 시각
                  <input
                    type="time"
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </label>
                <button className="service-secondary" disabled={store.busy}>
                  변경 저장
                </button>
              </form>
            )}
            {plan?.status === "COMPLETED" && (
              <p className="service-feedback">
                {store.records.find((r) => r.date === plan.localDate)
                  ?.outcome === "CONFIRMED_ON_TIME"
                  ? "잘 일어났어요. 다음 추천에도 반영할게요."
                  : "다음 계획에서는 예비 알람을 강화할게요."}
              </p>
            )}
            {(!plan || plan.status === "DECLINED") && (
              <button
                className="service-secondary"
                disabled={store.busy}
                onClick={() => void serviceAction(generateServicePlan)}
              >
                계획 다시 만들기
              </button>
            )}
          </section>
        )}
        {plan && (
          <section className="service-section home-reason-card">
            <div className="service-row">
              <h2>
                {plan.explanationSource === "MODEL"
                  ? "AI가 이렇게 정했어요"
                  : "기본 분석으로 정했어요"}
              </h2>
              <span className="home-ai-badge">
                {plan.explanationSource === "MODEL" ? "AI 개인화" : "안전 폴백"}
              </span>
            </div>
            <p className="service-muted">{plan.reason}</p>
            <div className="home-signal-grid" aria-label="기상 계획 판단 기준">
              <div><span>일정</span><strong>{plan.scheduleTypeLabel}</strong></div>
              <div>
                <span>AI 피로도</span>
                <strong>
                  {plan.fatigueLevel === "HIGH"
                    ? "높음"
                    : plan.fatigueLevel === "MEDIUM"
                      ? "보통"
                      : "낮음"}{" "}
                  {plan.fatigueScore ?? 0}
                </strong>
              </div>
              <div>
                <span>AI 신뢰도</span>
                <strong>{Math.round((plan.aiConfidence ?? 0) * 100)}%</strong>
              </div>
            </div>
            <p className="service-footnote">
              {plan.explanationSource === "MODEL"
                ? `AI가 피로도와 최근 기상 반응을 분석해 ${clockTime(plan.firstAlarmAt)}부터 ${plan.steps.length}개의 알람을 배치했어요.`
                : survey.aiPersonalizationConsent
                  ? "AI 연결에 실패해 이번 계획은 로컬 안전 기준으로 계산했어요."
                  : "AI 분석 동의가 꺼져 있어 이번 계획은 로컬 안전 기준으로 계산했어요."}
            </p>
            {!approved && plan.status === "PROPOSED" && (
              <p className="service-footnote">
                {survey.automationMode === "automatic"
                  ? "14일 동안은 함께 확인해요. 학습 후에도 수정·취소할 수 있어요."
                  : "현재는 매일 승인한 뒤 적용해요. 자동 적용은 마이에서 선택할 수 있어요."}
              </p>
            )}
          </section>
        )}
        <section className="service-section">
          <div className="service-row">
            <h2>내일 첫 일정</h2>
            <Link href="/calendar">수정</Link>
          </div>
          <div className="calendar-summary">
            <span className="calendar-date">
              {plan?.localDate.slice(-2) ?? "—"}
            </span>
            <div>
              <strong>{plan?.eventTitle ?? "일정 연결"}</strong>
              <p className="service-muted">
                {plan
                  ? `${clockTime(plan.eventAt)} 시작 · ${plan.scheduleTypeLabel} · ${plan.wakeLeadMinutes}분 전까지 기상`
                  : "캘린더에서 확인하세요"}
              </p>
            </div>
          </div>
        </section>
        <section className="service-section">
          <div className="service-row">
            <h2>나의 수면</h2>
            <Link href="/sleep">자세히</Link>
          </div>
          <strong className="sleep-summary">
            {store.healthConnected
              ? `${Math.floor(store.sleepMinutes / 60)}시간 ${store.sleepMinutes % 60}분`
              : "아직 연결하지 않았어요"}
          </strong>
          <p className="service-muted">
            {store.healthConnected
              ? "최근 수면 기록을 다음 알람에 반영해요."
              : "수면 기록이 있으면 더 알맞게 추천할 수 있어요."}
          </p>
        </section>
        <section className="service-section">
          <h2>매일 {store.automationTime}, 내일을 준비해요</h2>
          <p className="service-muted">
            {eligibility.count}/10일 기록 · 적응 기간{" "}
            {Math.min(14, eligibility.elapsedDays)}/14일
          </p>
          <p className="service-footnote">
            {survey.automationMode !== "automatic"
              ? "항상 확인 후 적용 중"
              : store.earlyAutomationEnabled
                ? "조기 자동 적용 중 · 적용 후 수정·취소 가능"
                : eligibility.ready
                  ? "자동 적용 중 · 언제든 확인 방식으로 변경 가능"
                  : "14일 후 자동 적용 · 그전에는 항상 확인"}
          </p>
        </section>
      </div>
    </AppShell>
  );
}
