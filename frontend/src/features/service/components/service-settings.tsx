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
  saveCalendarEvents,
  saveServicePreferences,
  serviceAction,
  serviceNow,
} from "../lib/service-actions";

export function ServiceSettings() {
  const store = useServiceStore();
  const draft = useCurrentFlowStore((state) => state.onboardingDraft);
  const [mode, setMode] = useState<"human" | "automatic">(
    draft.automationMode === "automatic" ? "automatic" : "human",
  );
  const [earlyAutomation, setEarlyAutomation] = useState(
    store.earlyAutomationEnabled,
  );
  const [time, setTime] = useState(store.automationTime);
  const [alarmCount, setAlarmCount] = useState(store.preferredAlarmCount);
  const [interval, setInterval] = useState(store.alarmIntervalMinutes);
  const [safety, setSafety] = useState(store.keepSafetyAlarm);
  const [types, setTypes] = useState<ScheduleTypeRule[]>(store.scheduleTypes);
  const [newLabel, setNewLabel] = useState("");
  const [newMinutes, setNewMinutes] = useState(60);
  const [saved, setSaved] = useState(false);
  const progress = automationEligibility({
    enrolledAt: store.enrolledAt ?? serviceNow(),
    now: serviceNow(),
    consent: true,
    records: store.records,
    importance: "NORMAL",
    requiresApproval: false,
  });
  const beforeLearningPeriod = progress.elapsedDays < 14;

  const updateType = (code: string, patch: Partial<ScheduleTypeRule>) => {
    setTypes((current) =>
      current.map((item) =>
        item.code === code ? { ...item, ...patch } : item,
      ),
    );
    setSaved(false);
  };

  return (
    <AppShell currentStep="결과">
      <div className="service-home settings-screen">
        <h1>설정</h1>
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            void serviceAction(async () => {
              const fallback = types.find((item) => item.isFallback);
              if (!fallback) throw new Error("기타 유형은 반드시 필요해요.");
              const removedCodes = new Set(
                store.scheduleTypes
                  .filter(
                    (item) => !types.some((next) => next.code === item.code),
                  )
                  .map((item) => item.code),
              );
              const events = store.events.map((item) =>
                removedCodes.has(item.category)
                  ? { ...item, category: fallback.code }
                  : item,
              );
              const classifications = Object.fromEntries(
                Object.entries(store.classifications).map(
                  ([clientId, value]) => [
                    clientId,
                    removedCodes.has(value.categoryCode)
                      ? { ...value, categoryCode: fallback.code, confidence: 0 }
                      : value,
                  ],
                ),
              );
              store.set({
                automationTime: time,
                earlyAutomationEnabled:
                  mode === "automatic" && beforeLearningPeriod
                    ? earlyAutomation
                    : false,
                preferredAlarmCount: alarmCount,
                alarmIntervalMinutes: interval,
                keepSafetyAlarm: safety,
                scheduleTypes: types,
                events,
                classifications,
              });
              useCurrentFlowStore.getState().setOnboardingDraft({
                ...draft,
                preferredAlarmCount: alarmCount,
                keepSafetyAlarm: safety,
                automationMode: mode === "automatic" ? "automatic" : "suggest",
              });
              const id = useDemoSessionStore.getState().sessionId;
              if (id) {
                const headers = demoSessionHeaders(id);
                const profile = await apiClient.GET("/api/v1/profile", {
                  headers,
                });
                if (!profile.data) throw new Error("설정을 불러오지 못했어요.");
                const result = await apiClient.PUT("/api/v1/profile", {
                  headers,
                  body: {
                    timezone: profile.data.timezone,
                    locale: profile.data.locale,
                    revision: profile.data.revision,
                    automationMode:
                      mode === "automatic"
                        ? "AUTO_ROUTINE_DAYS"
                        : "RECOMMEND_ONLY",
                    allowImportantEventDetection:
                      profile.data.allowImportantEventDetection,
                    allowAggregateOutcomeSync:
                      profile.data.allowAggregateOutcomeSync,
                  },
                });
                if (!result.data || result.error)
                  throw new Error("자동화 설정을 저장하지 못했어요.");
                await saveServicePreferences();
                if (removedCodes.size) await saveCalendarEvents(events);
              }
              setSaved(true);
            });
          }}
        >
          <section className="service-section">
            <h2>계획 적용 방식</h2>
            <label className="settings-choice">
              <input
                type="radio"
                name="automation"
                checked={mode === "human"}
                onChange={() => {
                  setMode("human");
                  setEarlyAutomation(false);
                  setSaved(false);
                }}
              />
              <span>
                <strong>항상 확인 후 적용</strong>
                <small>매일 승인한 뒤 알람을 설정해요.</small>
              </span>
            </label>
            <label className="settings-choice">
              <input
                type="radio"
                name="automation"
                checked={mode === "automatic"}
                onChange={() => {
                  setMode("automatic");
                  setSaved(false);
                }}
              />
              <span>
                <strong>학습 후 자동 적용</strong>
                <small>자동 적용 뒤에도 언제든 수정·취소할 수 있어요.</small>
              </span>
            </label>
            {mode === "automatic" && beforeLearningPeriod && (
              <div className="settings-warning">
                <strong>아직 AI가 기상 패턴을 학습 중이에요</strong>
                <p>
                  14일 전에는 판별 기록이 적어 오차가 많을 수 있어요. 자동으로
                  적용된 시간은 꼭 확인해 주세요.
                </p>
                <label className="service-checkbox">
                  <input
                    type="checkbox"
                    checked={earlyAutomation}
                    onChange={(event) => {
                      setEarlyAutomation(event.target.checked);
                      setSaved(false);
                    }}
                  />
                  14일 전부터 자동 적용 시작
                </label>
              </div>
            )}
            <p className="service-footnote">
              {mode === "human"
                ? "Human-in-the-loop 방식으로 사용 중이에요."
                : earlyAutomation && beforeLearningPeriod
                  ? "조기 자동 적용을 선택했어요."
                  : beforeLearningPeriod
                    ? `${14 - progress.elapsedDays}일 뒤 자동 적용할 수 있어요.`
                    : "자동 적용 중이며 언제든 확인 방식으로 돌아갈 수 있어요."}
            </p>
          </section>

          <section className="service-section">
            <div className="service-row">
              <h2>일정 유형</h2>
              <span className="service-tag">{types.length}개</span>
            </div>
            <p className="service-muted">
              AI가 일정 이름을 보고 유형을 고르고, 유형별 시각까지 기상을
              마치도록 계획을 만들어요.
            </p>
            <div className="schedule-type-settings">
              {types.map((item) => (
                <div className="schedule-type-row" key={item.code}>
                  <label>
                    유형 이름
                    <input
                      value={item.label}
                      maxLength={30}
                      required
                      onChange={(event) =>
                        updateType(item.code, { label: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    기상 완료 기준
                    <input
                      type="number"
                      min={15}
                      max={300}
                      required
                      value={item.wakeLeadMin}
                      onChange={(event) =>
                        updateType(item.code, {
                          wakeLeadMin: Math.max(
                            15,
                            Math.min(300, Number(event.target.value)),
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="service-text-button danger-text"
                    disabled={item.isFallback}
                    onClick={() => {
                      if (
                        window.confirm(
                          `${item.label} 유형을 삭제할까요? 해당 일정은 기타로 이동해요.`,
                        )
                      ) {
                        setTypes((current) =>
                          current.filter((type) => type.code !== item.code),
                        );
                        setSaved(false);
                      }
                    }}
                  >
                    {item.isFallback ? "필수" : "삭제"}
                  </button>
                </div>
              ))}
            </div>
            <div className="schedule-type-add">
              <input
                aria-label="새 유형 이름"
                placeholder="새 유형 이름"
                maxLength={30}
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
              />
              <input
                aria-label="새 유형 기상 시간"
                type="number"
                min={15}
                max={300}
                value={newMinutes}
                onChange={(event) => setNewMinutes(Number(event.target.value))}
              />
              <button
                type="button"
                className="service-secondary"
                disabled={!newLabel.trim() || types.length >= 20}
                onClick={() => {
                  setTypes((current) => [
                    ...current,
                    {
                      code: `CUSTOM_${Date.now().toString(36).toUpperCase()}`,
                      label: newLabel.trim(),
                      wakeLeadMin: Math.max(15, Math.min(300, newMinutes)),
                      isFallback: false,
                    },
                  ]);
                  setNewLabel("");
                  setNewMinutes(60);
                  setSaved(false);
                }}
              >
                유형 추가
              </button>
            </div>
          </section>

          <section className="service-section service-edit">
            <h2>알람 설정</h2>
            <label>
              매일 계획을 계산할 시각
              <input
                type="time"
                value={time}
                required
                onChange={(event) => {
                  setTime(event.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <label>
              기본 알람 개수
              <select
                value={alarmCount}
                onChange={(event) => {
                  setAlarmCount(Number(event.target.value));
                  setSaved(false);
                }}
              >
                <option value={1}>1개</option>
                <option value={2}>2개</option>
                <option value={3}>3개</option>
              </select>
            </label>
            <label>
              알람 간격
              <select
                value={interval}
                onChange={(event) => {
                  setInterval(Number(event.target.value));
                  setSaved(false);
                }}
              >
                <option value={5}>5분</option>
                <option value={10}>10분</option>
                <option value={15}>15분</option>
                <option value={20}>20분</option>
              </select>
            </label>
            <label className="service-checkbox">
              <input
                type="checkbox"
                checked={safety}
                onChange={(event) => {
                  setSafety(event.target.checked);
                  setSaved(false);
                }}
              />
              피곤하거나 중요한 날에는 안전 알람 추가
            </label>
          </section>

          <button disabled={store.busy} className="service-primary">
            설정 저장
          </button>
          {saved && (
            <p role="status" className="service-feedback">
              저장했어요. 다음 기상 계획부터 반영해요.
            </p>
          )}
          {store.message && (
            <p role="alert" className="service-error">
              {store.message}
            </p>
          )}
        </form>

        <section className="service-section">
          <h2>연결과 데이터</h2>
          <Link className="service-secondary" href="/calendar">
            캘린더 · 수면 데이터
          </Link>
          <Link
            className="service-secondary"
            href="/onboarding"
            onClick={() => useCurrentFlowStore.getState().setOnboardingStep(0)}
          >
            초기 설정 다시 보기
          </Link>
          <Link className="service-secondary" href="/settings/privacy">
            처음부터 다시 시작 · 데이터 삭제
          </Link>
          <p className="service-footnote">
            현재 캘린더와 수면 데이터는 시연용 샘플이에요. 일정과 설정은 기존
            백엔드 세션에 저장됩니다.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
