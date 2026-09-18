"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { AppShell } from "@/components/layout/app-shell";
import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import {
  localDataStore,
  type LocalStorageMode,
} from "@/lib/storage/local-data";

import {
  onboardingSchema,
  type OnboardingValues,
} from "../model/onboarding-schema";

const STEP_LABELS = ["기상 습관", "준비 루틴", "알람 선호", "개인정보"];

const STEP_FIELDS: Array<Array<keyof OnboardingValues>> = [
  ["usualWakeTime", "recentFirstAlarmSucceeded"],
  ["washMinutes", "breakfastMinutes", "bagMinutes"],
  ["preferredAlarmCount", "keepSafetyAlarm"],
  ["automationMode", "outcomeSync"],
];

const inputClassName =
  "mt-2 min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2";

export function OnboardingFlow() {
  const router = useRouter();
  const draft = useCurrentFlowStore((state) => state.onboardingDraft);
  const storedStep = useCurrentFlowStore((state) => state.onboardingStep);
  const setCompleted = useCurrentFlowStore(
    (state) => state.setOnboardingCompleted,
  );
  const setDraft = useCurrentFlowStore((state) => state.setOnboardingDraft);
  const setStoredStep = useCurrentFlowStore((state) => state.setOnboardingStep);
  const [step, setStep] = useState(Math.min(Math.max(storedStep, 0), 3));
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
    setDraft(values);
    setCompleted(true);
    setStoredStep(0);
    router.push("/tomorrow");
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
            추천 계산에 필요한 기본 설정만 입력합니다. 건강 원본은 서버로 보내지
            않습니다.
          </p>
        </header>

        <ol
          aria-label="초기 설정 진행률"
          className="mt-6 grid grid-cols-4 gap-2"
        >
          {STEP_LABELS.map((label, index) => (
            <li
              aria-current={index === step ? "step" : undefined}
              className={`rounded-full px-2 py-2 text-center text-xs ${
                index === step
                  ? "bg-brand font-semibold text-white"
                  : "bg-surface text-muted"
              }`}
              key={label}
            >
              {label}
            </li>
          ))}
        </ol>

        <form
          className="mt-6 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[0_8px_24px_rgba(20,32,43,0.08)] sm:p-7"
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
                      <label className="rounded-xl border border-border p-3">
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
                      <label className="rounded-xl border border-border p-3">
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
            <div className="grid gap-5 sm:grid-cols-3">
              {[
                ["washMinutes", "씻기"],
                ["breakfastMinutes", "아침 식사"],
                ["bagMinutes", "가방 챙기기"],
              ].map(([name, label]) => (
                <label className="font-semibold" key={name}>
                  {label}
                  <span className="mt-1 block text-xs font-normal text-muted">
                    소요 시간(분)
                  </span>
                  <input
                    className={inputClassName}
                    min={0}
                    max={180}
                    type="number"
                    {...register(name as keyof OnboardingValues, {
                      valueAsNumber: true,
                    })}
                  />
                </label>
              ))}
              {errors.washMinutes ||
              errors.breakfastMinutes ||
              errors.bagMinutes ? (
                <p className="text-sm text-danger sm:col-span-3">
                  준비 시간은 0분에서 180분 사이로 입력해 주세요.
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-6">
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
              <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border p-3">
                <input type="checkbox" {...register("keepSafetyAlarm")} />
                중요한 일정에는 최종 안전 알람 유지
              </label>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-6">
              <fieldset>
                <legend className="font-semibold">계획 적용 방식</legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="rounded-xl border border-border p-4">
                    <input
                      className="mr-2"
                      type="radio"
                      value="suggest"
                      {...register("automationMode")}
                    />
                    먼저 제안받기
                  </label>
                  <label className="rounded-xl border border-border p-4">
                    <input
                      className="mr-2"
                      type="radio"
                      value="automatic"
                      {...register("automationMode")}
                    />
                    자동 적용
                  </label>
                </div>
              </fieldset>

              <div className="rounded-xl bg-brand-soft p-4 text-sm leading-6">
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

              <label className="flex items-start gap-3 rounded-xl border border-border p-4">
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
                className="min-h-11 rounded-[var(--radius-control)] border border-border px-5 py-3 font-semibold"
                onClick={() => moveToStep(step - 1)}
                type="button"
              >
                이전
              </button>
            ) : null}
            {step < 3 ? (
              <button
                className="min-h-11 flex-1 rounded-[var(--radius-control)] bg-brand px-5 py-3 font-semibold text-white"
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
                className="min-h-11 flex-1 rounded-[var(--radius-control)] bg-brand px-5 py-3 font-semibold text-white"
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
