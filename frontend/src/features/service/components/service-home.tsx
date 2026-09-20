"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { BrandLogo } from "@/components/brand/brand-logo";
import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { useServiceStore } from "../model/service-store";
import {
  atTime,
  automationEligibility,
  clockTime,
} from "../model/service-policy";
import {
  confirmCurrentAlarm,
  decideServicePlan,
  dismissCurrentAlarm,
  generateServicePlan,
  serviceAction,
  serviceNow,
} from "../lib/service-actions";
import { alarmScheduledAt } from "../lib/alarm-sequence";
import { ClayIcon } from "@/components/brand/clay-icon";
import { HomeAlarmScene, SetupGuidanceScene } from "./home-alarm-scene";
import styles from "./service-home.module.css";

const subscribeHydration = () => () => {};
const SPLASH_SEEN_KEY = "kkaeddak-splash-seen";
const readSplashSeen = () =>
  window.localStorage.getItem(SPLASH_SEEN_KEY) === "1";

export function ServiceHome() {
  const ready = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const splashSeen = useSyncExternalStore(
    subscribeHydration,
    readSplashSeen,
    () => null,
  );
  const [splashDismissed, setSplashDismissed] = useState(false);
  const splashTimer = useRef<number | null>(null);
  const [edit, setEdit] = useState(false);
  const [time, setTime] = useState("");
  const store = useServiceStore();
  const authenticated = useCurrentFlowStore((s) => s.demoAuthenticated);
  const completed = useCurrentFlowStore((s) => s.onboardingCompleted);
  const survey = useCurrentFlowStore((s) => s.onboardingDraft);
  useEffect(() => {
    if (splashSeen !== false || splashDismissed) return;

    // The first entry always leads from the brand splash to login.
    useCurrentFlowStore.getState().setDemoAuthenticated(false);
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    splashTimer.current = window.setTimeout(
      () => {
        window.localStorage.setItem(SPLASH_SEEN_KEY, "1");
        setSplashDismissed(true);
      },
      reducedMotion ? 500 : 1600,
    );
    return () => {
      if (splashTimer.current !== null) {
        window.clearTimeout(splashTimer.current);
      }
    };
  }, [splashDismissed, splashSeen]);
  const dismissSplash = () => {
    if (splashTimer.current !== null) {
      window.clearTimeout(splashTimer.current);
    }
    window.localStorage.setItem(SPLASH_SEEN_KEY, "1");
    setSplashDismissed(true);
  };

  if (!ready || splashSeen === null)
    return (
      <AppShell currentStep="소개" immersive>
        <div aria-label="앱 준비 중" className="entry-boot" role="status" />
      </AppShell>
    );
  if (!splashSeen && !splashDismissed)
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
            alt="일정과 온디바이스 건강 데이터를 분석해 알람을 준비하는 깨딱"
            className="splash-artwork"
            height={1671}
            priority
            src="/brand/kkaeddak-splash-matte-bright.png"
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
      <AppShell currentStep="소개" homeScene>
        <div className={`${styles.home} setup-home`}>
          <header className={`service-heading ${styles.heading}`}>
            <div>
              <p className="service-muted">처음 오셨군요</p>
              <h1>내일 아침을 준비해볼까요?</h1>
            </div>
            <span className="service-tag">설정 전</span>
          </header>
          <SetupGuidanceScene
            description="캘린더와 온디바이스 건강 데이터를 연결하면 내일의 기상 난이도를 추정해 필요한 최소한의 알람을 제안할게요."
            href="/onboarding"
            label="설정하러 가기"
            title="먼저 기본 설정이 필요해요"
          />
          <section className="setup-preview" aria-label="설정 후 제공 기능">
            <div>
              <span>01</span>
              <p>일정·건강 데이터 연결</p>
            </div>
            <div>
              <span>02</span>
              <p>Gemini 피로도·기상 난이도 분석</p>
            </div>
            <div>
              <span>03</span>
              <p>최소 알람 전략 학습</p>
            </div>
          </section>
        </div>
      </AppShell>
    );
  if (!store.calendarConnected)
    return (
      <AppShell currentStep="소개" homeScene>
        <div className={styles.home}>
          <header className={`service-heading ${styles.heading}`}>
            <div><p className="service-muted">마지막 준비예요</p><h1>내일 아침</h1></div>
            <span className="service-tag">연동 전</span>
          </header>
          <SetupGuidanceScene
            description="캘린더를 연결하면 첫 일정의 시각과 유형을 판단하고, 건강 데이터와 함께 내일의 기상 난이도를 계산할게요."
            href="/settings/connections"
            label="연동 설정하기"
            title="내일 일정을 연결해 주세요"
          />
        </div>
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
  const activeStepOrder =
    store.alarmRuntime?.currentStepOrder ??
    store.alarmRuntime?.awaitingConfirmationStepOrder ??
    1;
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
    <AppShell currentStep="계획" homeScene>
      <div className={styles.home}>
        <header className={`service-heading ${styles.heading}`}>
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
        <HomeAlarmScene ringing={store.alarmStage === "ringing"}>
        {store.alarmStage !== "idle" ? (
          <section className={`${styles.bubble} ${styles.alarmBubble}`} aria-live="polite">
            <p className="service-kicker">
              {store.alarmStage === "ringing"
                ? "일어날 시간이에요"
                : "잠깐, 정말 일어났나요?"}
            </p>
            <p className="service-clock">
              {plan && clockTime(alarmScheduledAt(plan, activeStepOrder))}
            </p>
            {store.alarmStage === "ringing" ? (
              <button
                className="service-primary"
                onClick={() => void serviceAction(dismissCurrentAlarm)}
              >
                알람 끄기
              </button>
            ) : (
              <div className="service-stack">
                <button
                  disabled={store.busy}
                  className="service-primary"
                  onClick={() =>
                    void serviceAction(() => confirmCurrentAlarm(true))
                  }
                >
                  네, 일어났어요
                </button>
                <button
                  disabled={store.busy}
                  className="service-secondary"
                  onClick={() =>
                    void serviceAction(() => confirmCurrentAlarm(false))
                  }
                >
                  못 일어났어요
                </button>
              </div>
            )}
          </section>
        ) : (
          <section className={styles.bubble} aria-label="내일의 알람 계획" aria-busy={store.busy}>
            <div className={styles.bubbleStatus}>
              <span className={styles.statusDot} />
              <span>{status}</span>
            </div>
            <h2 className={styles.bubbleTitle}>
              {plan?.status === "PROPOSED" ? "이 시간에 깨워드릴까요?" : approved ? "내일 아침도, 깨딱과 함께" : plan?.status === "COMPLETED" ? "오늘의 아침을 기억할게요" : "여유로운 아침을 준비해요"}
            </h2>
            <div className={styles.timeRow}>
            <p className="service-clock">
              {plan ? clockTime(plan.firstAlarmAt) : "— : —"}
            </p>
            <p className={styles.timeMeta}>
              {plan
                ? `${plan.localDate.slice(5).replace("-", "/")} · ${plan.steps.length}개의 알람`
                : "내일 일정을 확인해 주세요"}
            </p>
            </div>
            {plan && (
              <div className={styles.planTarget}>
                <ClayIcon name="calendar" size={30} />
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
                      {clockTime(alarmScheduledAt(plan, step.order))}
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
        </HomeAlarmScene>
        <div className={styles.detailsHeading}>
          <span>내일을 위한 작은 준비</span>
          <span aria-hidden="true">↓</span>
        </div>
        {plan && (
          <section className={`service-section ${styles.glass}`}>
            <div className="service-row">
              <h2 className={styles.cardTitle}>
                <ClayIcon name="spark" />
                {plan.explanationSource === "MODEL"
                  ? "Gemini 피로도 분석"
                  : "피로도 안전 분석 결과예요"}
              </h2>
              <span className="home-ai-badge">
                {plan.explanationSource === "MODEL" ? "Gemini 개인화" : "안전 폴백"}
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
                ? `Gemini가 수면·활동·컨디션과 최근 기상 반응을 종합해 피로도를 판단하고 ${clockTime(plan.firstAlarmAt)}부터 ${plan.steps.length}개의 알람을 배치했어요.`
                : "Gemini 연결이 없어 이번 계획은 건강 신호와 기상 기록을 이용한 로컬 안전 기준으로 계산했어요."}
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
        <section className={`service-section ${styles.glass}`}>
          <div className="service-row">
            <h2 className={styles.cardTitle}><ClayIcon name="calendar" />내일 첫 일정</h2>
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
        <section className={`service-section ${styles.glass}`}>
          <div className="service-row">
            <h2 className={styles.cardTitle}><ClayIcon name="health" />오늘의 기상 난이도</h2>
            <Link href="/sleep">자세히</Link>
          </div>
          <strong className="sleep-summary">
            {plan
              ? `피로도 ${plan.fatigueLevel === "HIGH" ? "높음" : plan.fatigueLevel === "MEDIUM" ? "보통" : "낮음"} · ${plan.fatigueScore}점`
              : store.healthConnected
                ? "건강 데이터 분석 대기 중"
                : "아직 연결하지 않았어요"}
          </strong>
          <p className="service-muted">
            {plan
              ? `${plan.explanationSource === "MODEL" ? "Gemini가" : "안전 모델이"} 온디바이스 건강 신호를 종합해 내일 ${plan.steps.length}개의 알람이 필요하다고 판단했어요.`
              : store.healthConnected
                ? "수면·걸음·활동·컨디션을 다음 기상 계획에 함께 반영해요."
                : "Apple 건강 데이터를 연결하면 피로도와 필요한 알람 개수를 더 알맞게 추정할 수 있어요."}
          </p>
        </section>
        <section className={`service-section ${styles.glass}`}>
          <h2 className={styles.cardTitle}><ClayIcon name="chart" />매일 {store.automationTime}, 내일을 준비해요</h2>
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
