"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { AppShell } from "@/components/layout/app-shell";
import { useServiceStore } from "@/features/service/model/service-store";
import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import {
  localDataStore,
  type LocalStorageMode,
} from "@/lib/storage/local-data";

import {
  onboardingSchema,
  type OnboardingValues,
} from "../model/onboarding-schema";
import {
  connectCalendar,
  connectHealth,
  serviceAction,
} from "@/features/service/lib/service-actions";

const STEP_LABELS = ["기상 습관", "일정 유형", "알람 설정", "데이터 연동", "개인정보"];

const STEP_FIELDS: Array<Array<keyof OnboardingValues>> = [
  ["usualWakeTime", "recentFirstAlarmSucceeded"],
  [],
  ["preferredAlarmCount", "keepSafetyAlarm"],
  [],
  ["outcomeSync"],
];

const inputClassName = "field-control mt-2 min-h-12 w-full px-4 py-3";

export function OnboardingFlow() {
  const router = useRouter();
  const service = useServiceStore();
  const draft = useCurrentFlowStore((state) => state.onboardingDraft);
  const storedStep = useCurrentFlowStore((state) => state.onboardingStep);
  const setCompleted = useCurrentFlowStore(
    (state) => state.setOnboardingCompleted,
  );
  const setDraft = useCurrentFlowStore((state) => state.setOnboardingDraft);
  const setStoredStep = useCurrentFlowStore((state) => state.setOnboardingStep);
  const [step, setStep] = useState(Math.min(Math.max(storedStep, 0), 4));
  const [storageMode, setStorageMode] =
    useState<LocalStorageMode>("persistent");
  const {
    control,
    formState: { errors },
    getValues,
    handleSubmit,
    register,
    trigger,
  } = useForm<OnboardingValues>({
    defaultValues: draft,
    resolver: zodResolver(onboardingSchema),
  });

  useEffect(() => {
    void localDataStore.resolveMode().then(setStorageMode);
  }, []);

  const moveToStep = (nextStep: number) => {
    setDraft(getValues());
    setStoredStep(nextStep);
    setStep(nextStep);
  };

  const moveForward = async () => {
    const valid = await trigger(STEP_FIELDS[step]);
    if (valid) {
      moveToStep(step + 1);
    }
  };

  const complete = handleSubmit((values) => {
    const nextValues = { ...values, automationMode: "suggest" as const };
    setDraft(nextValues);
    service.set({
      preferredAlarmCount: nextValues.preferredAlarmCount,
      keepSafetyAlarm: nextValues.keepSafetyAlarm,
    });
    useCurrentFlowStore.getState().setDemoAuthenticated(true);
    setCompleted(true);
    setStoredStep(0);
    router.push("/");
  });

  return (
    <AppShell currentStep="소개" eyebrow="초기 설정">
      <div className="mx-auto max-w-2xl">
        <header>
          <p className="text-sm font-semibold text-brand">
            {step + 1} / {STEP_LABELS.length}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            {STEP_LABELS[step]}
          </h1>
          <p className="mt-3 text-muted">
            평소 아침에 맞춰 설정해 주세요. 나중에 바꿀 수 있어요.
          </p>
        </header>

        <ol
          aria-label="초기 설정 진행률"
          className="progress-rail mt-6 grid grid-cols-5 gap-1"
        >
          {STEP_LABELS.map((label, index) => (
            <li
              aria-current={index === step ? "step" : undefined}
              className="progress-step text-center text-xs"
              data-state={
                index === step
                  ? "active"
                  : index < step
                    ? "complete"
                    : "pending"
              }
              key={label}
            >
              {label}
            </li>
          ))}
        </ol>

        <form
          className="glass-card mt-6 rounded-[var(--radius-card)] p-5 sm:p-8"
          onSubmit={complete}
        >
          {step === 0 ? (
            <div className="space-y-6">
              <label className="block font-semibold">
                평소 기상 시각
                <input
                  className={inputClassName}
                  type="time"
                  {...register("usualWakeTime")}
                />
                {errors.usualWakeTime ? (
                  <span className="mt-1 block text-sm text-danger">
                    {errors.usualWakeTime.message}
                  </span>
                ) : null}
              </label>
              <fieldset>
                <legend className="font-semibold">
                  최근 첫 알람으로 일어났나요?
                </legend>
                <Controller
                  control={control}
                  name="recentFirstAlarmSucceeded"
                  render={({ field }) => (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <label className="choice-card rounded-[var(--radius-control)] p-4">
                        <input
                          checked={field.value}
                          className="mr-2"
                          name={field.name}
                          onBlur={field.onBlur}
                          onChange={() => field.onChange(true)}
                          ref={field.ref}
                          type="radio"
                        />
                        예
                      </label>
                      <label className="choice-card rounded-[var(--radius-control)] p-4">
                        <input
                          checked={!field.value}
                          className="mr-2"
                          name={field.name}
                          onBlur={field.onBlur}
                          onChange={() => field.onChange(false)}
                          type="radio"
                        />
                        아니요
                      </label>
                    </div>
                  )}
                />
              </fieldset>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-5">
              <p className="text-sm leading-6 text-muted">
                AI가 일정 이름을 보고 아래 유형 중 하나로 분류해요. 시간은 일정
                시작 전에 기상을 완료할 기준을 뜻해요.
              </p>
              {service.scheduleTypes.map((scheduleType) => (
                <label className="font-semibold" key={scheduleType.code}>
                  {scheduleType.label}
                  <span className="mt-1 block text-xs font-normal text-muted">
                    일정 시작 전 기상 완료 기준(분)
                  </span>
                  {scheduleType.isFallback ? (
                    <span className="mt-1 block text-xs font-normal leading-5 text-muted">
                      AI가 캘린더 일정명을 다른 유형으로 구별하지 못했을 때
                      적용하는 기본 유형이에요.
                    </span>
                  ) : null}
                  <input
                    className={inputClassName}
                    min={15}
                    max={300}
                    type="number"
                    value={scheduleType.wakeLeadMin}
                    onChange={(event) =>
                      service.set({
                        scheduleTypes: service.scheduleTypes.map((item) =>
                          item.code === scheduleType.code
                            ? {
                                ...item,
                                wakeLeadMin: Math.max(
                                  15,
                                  Math.min(300, Number(event.target.value)),
                                ),
                              }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
              ))}
              <p className="text-sm text-muted">
                유형 추가·이름 변경·삭제는 설정에서 언제든 할 수 있어요.
              </p>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-6">
              <label className="block font-semibold">
                매일 알람을 정할 시각
                <input
                  className={inputClassName}
                  type="time"
                  required
                  value={service.automationTime}
                  onChange={(e) => {
                    if (e.target.value)
                      service.set({ automationTime: e.target.value });
                  }}
                />
                <span className="mt-2 block text-sm font-normal text-muted">
                  이 시각에 내일 일정과 수면 기록을 확인해요.
                </span>
              </label>
              <label className="block font-semibold">
                알람 간격
                <select
                  className={inputClassName}
                  value={service.alarmIntervalMinutes}
                  onChange={(event) =>
                    service.set({
                      alarmIntervalMinutes: Number(event.target.value),
                    })
                  }
                >
                  <option value={5}>5분</option>
                  <option value={10}>10분</option>
                  <option value={15}>15분</option>
                  <option value={20}>20분</option>
                </select>
              </label>
              <label className="block font-semibold">
                선호 알람 개수
                <select
                  className={inputClassName}
                  {...register("preferredAlarmCount", { valueAsNumber: true })}
                >
                  <option value={1}>1개</option>
                  <option value={2}>2개</option>
                  <option value={3}>3개</option>
                </select>
              </label>
              <label className="choice-card flex min-h-12 items-center gap-3 rounded-[var(--radius-control)] p-4">
                <input type="checkbox" {...register("keepSafetyAlarm")} />
                중요한 일정에는 최종 안전 알람 유지
              </label>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-5 onboarding-connections">
              <p className="text-sm leading-6 text-muted">
                캘린더와 수면 기록을 연결해야 내일의 기상 시각을
                계산할 수 있어요. 웹 데모에서는 샘플 데이터를 불러와요.
              </p>
              <section className="onboarding-connection-card">
                <div><span aria-hidden="true">📅</span><p><strong>캘린더</strong><small>2026년 10월 30일까지의 샘플 일정</small></p></div>
                {service.calendarConnected ? <b>연동 완료</b> : <button aria-label="캘린더 연결하기" type="button" disabled={service.busy} onClick={() => void serviceAction(connectCalendar)}>연결하기</button>}
              </section>
              <section className="onboarding-connection-card">
                <div><span aria-hidden="true">🌙</span><p><strong>수면 데이터</strong><small>Apple 건강 형식의 최근 수면 샘플</small></p></div>
                {service.healthConnected ? <b>연동 완료</b> : <button aria-label="수면 데이터 연결하기" type="button" disabled={service.busy} onClick={() => void serviceAction(connectHealth)}>연결하기</button>}
              </section>
              {service.message && <p role="alert" className="service-error">{service.message}</p>}
              <p className="text-xs leading-5 text-muted">나중에는 마이 › 연동 설정에서 상태를 확인할 수 있어요.</p>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-6">
              <div className="accent-panel p-5 text-sm leading-6">
                <strong className="block">처음에는 항상 확인받아요</strong>
                14일 동안은 계획을 승인한 뒤 알람을 설정해요. 학습이 끝나면 일반
                일정은 자동으로 적용하고, 언제든 수정·취소하거나 다시 확인
                방식으로 바꿀 수 있어요.
              </div>
              <p className="text-sm leading-6 text-muted">
                14일 전 자동 적용도 설정에서 선택할 수 있지만, 학습 기록이 적어
                AI 판단 오차가 클 수 있어요.
              </p>

              <div className="accent-panel p-5 text-sm leading-6">
                <strong className="block">로컬 처리 원칙</strong>
                수면·활동·컨디션과 개인 모델은 이 브라우저 안에서만 처리합니다.
                현재 저장 방식은
                <span className="font-semibold">
                  {storageMode === "persistent"
                    ? " 브라우저 로컬 저장"
                    : " 저장하지 않는 일회성 모드"}
                </span>
                입니다.
              </div>

              <label className="choice-card flex items-start gap-3 rounded-[var(--radius-control)] p-4">
                <input
                  className="mt-1"
                  type="checkbox"
                  {...register("outcomeSync")}
                />
                <span>
                  <strong className="block">집계 결과 서버 동기화 동의</strong>
                  <span className="text-sm text-muted">
                    선택 사항이며 건강 원본은 동의해도 전송하지 않습니다.
                  </span>
                </span>
              </label>
            </div>
          ) : null}

          <div className="mt-7 flex gap-3">
            {step > 0 ? (
              <button
                className="action-ghost min-h-11 px-5 py-3"
                onClick={() => moveToStep(step - 1)}
                type="button"
              >
                이전
              </button>
            ) : null}
            {step < 4 ? (
              <button
                className="action-primary min-h-11 flex-1 px-5 py-3"
                disabled={step === 3 && !service.calendarConnected}
                onClick={(event) => {
                  event.preventDefault();
                  void moveForward();
                }}
                type="button"
              >
                다음
              </button>
            ) : (
              <button
                className="action-primary min-h-11 flex-1 px-5 py-3"
                type="submit"
              >
                설정 완료
              </button>
            )}
          </div>
        </form>
      </div>
    </AppShell>
  );
}
