"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { useServiceStore } from "../model/service-store";
import {
  atTime,
  automationEligibility,
  clockTime,
  localDate,
} from "../model/service-policy";
import {
  decideServicePlan,
  generateServicePlan,
  saveServiceOutcome,
  serviceAction,
  serviceNow,
} from "../lib/service-actions";
import { startAlarmSound, stopAlarmSound } from "../lib/alarm-audio";

const subscribeHydration = () => () => {};

export function ServiceHome() {
  const ready = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const [edit, setEdit] = useState(false);
  const [time, setTime] = useState("");
  const store = useServiceStore();
  const completed = useCurrentFlowStore((s) => s.onboardingCompleted);
  const survey = useCurrentFlowStore((s) => s.onboardingDraft);
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

  if (!ready)
    return (
      <AppShell currentStep="소개">
        <p className="service-muted">불러오는 중…</p>
      </AppShell>
    );
  if (!completed)
    return (
      <AppShell currentStep="소개">
        <div className="welcome-screen">
          <div className="morning-mark" aria-hidden="true">
            <Image
              alt=""
              height={560}
              priority
              src="/brand/kkaeddak-alarm-clock.png"
              width={600}
            />
          </div>
          <p className="service-kicker">나에게 맞는 아침</p>
          <h1>
            몇 시에 일어나야 할지,
            <br />
            매일 고민하지 않도록.
          </h1>
          <p className="service-muted">
            준비하는 시간과 일정을 알려주세요.
            <br />
            내일 필요한 알람을 함께 정할게요.
          </p>
          <div className="welcome-steps">
            <span>
              01 <b>기상 습관 설정</b>
            </span>
            <span>
              02 <b>캘린더 연결</b>
            </span>
            <span>
              03 <b>첫 기상 계획 확인</b>
            </span>
          </div>
          <Link className="service-primary" href="/onboarding">
            시작하기
          </Link>
          <p className="service-footnote">약 1분이면 설정할 수 있어요</p>
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
            첫 일정에 늦지 않도록 준비 시간까지 계산할게요.
          </p>
          <Link className="service-primary" href="/calendar">
            캘린더 연결하기
          </Link>
        </section>
      </AppShell>
    );
  const plan = store.plan;
  const eligibility = automationEligibility({
    enrolledAt: store.enrolledAt!,
    now: serviceNow(),
    consent: survey.automationMode === "automatic",
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
      <div className="service-home">
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
              <span className="service-dot" />
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
          <section className="service-section">
            <h2>이렇게 정했어요</h2>
            <p className="service-muted">{plan.reason}</p>
            {!approved && plan.status === "PROPOSED" && (
              <p className="service-footnote">
                처음에는 함께 확인해요. 충분한 기록이 쌓이면 동의한 일반 일정은
                자동으로 설정돼요.
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
                  ? `${clockTime(plan.eventAt)} 시작 · 이동 ${store.commuteMinutes}분`
                  : "캘린더에서 확인하세요"}
              </p>
            </div>
          </div>
        </section>
        <section className="service-section">
          <div className="service-row">
            <h2>나의 수면</h2>
            <Link href="/calendar">연결 관리</Link>
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
            자동 적용{" "}
            {survey.automationMode === "automatic" ? "동의함" : "사용 안 함"} ·
            중요한 일정은 항상 확인받아요.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
