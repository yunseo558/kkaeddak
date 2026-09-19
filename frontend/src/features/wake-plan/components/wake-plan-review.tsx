"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { components } from "@kkaeddak/api-client";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { ApiErrorState } from "@/components/foundation/api-error-state";
import { AppShell } from "@/components/layout/app-shell";
import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { formatKoreanTime } from "@/features/tomorrow/lib/schedule-calculation";
import { getApiStatus } from "@/lib/api/api-recovery";

import {
  createWakePlan,
  createWakePlanDecisionPayload,
  createWakePlanIdempotencyKey,
  getWakePlan,
  updateWakePlanDecision,
} from "../api/wake-plan-api";
import { getVisibleReasons } from "../lib/reason-copy";
import type { WakeRecommendation } from "../lib/recommendation-engine";
import {
  createPlanEditSchema,
  koreanLocalTimeToUtc,
  type PlanEditValues,
} from "../model/plan-edit";
import { useWakeRecommendation } from "../model/use-wake-recommendation";

type WakePlanResponse = components["schemas"]["WakePlanResponse"];
type PlanDecision = components["schemas"]["PlanDecision"];
type WakePlanDecisionChanges =
  components["schemas"]["WakePlanDecisionChanges"];

const confidenceLabels = {
  LOW: "낮은 신뢰",
  MEDIUM: "보통 신뢰",
  HIGH: "높은 신뢰",
} as const;

const channelLabels: Record<string, string> = {
  WATCH_HAPTIC: "워치 진동",
  PHONE_SOUND: "휴대폰 소리",
  FINAL_SAFETY: "최종 안전 알람",
};

const statusLabels: Record<string, string> = {
  APPROVED: "승인됨",
  DECLINED: "거절됨",
  EDITED: "수정 저장됨",
  PROPOSED: "검토 중",
};

function localPlanResponse(): WakePlanResponse {
  return {
    id: "00000000-0000-4000-8000-000000000030",
    revision: 1,
    status: "PROPOSED",
  };
}

function WakePlanEditor({
  mode,
  recommendation,
  sessionId,
}: {
  mode: "local" | "server";
  recommendation: WakeRecommendation;
  sessionId: string | null;
}) {
  const setEditingPlanId = useCurrentFlowStore(
    (state) => state.setEditingPlanId,
  );
  const setActiveWakePlan = useCurrentFlowStore(
    (state) => state.setActiveWakePlan,
  );
  const setWakeResult = useCurrentFlowStore((state) => state.setWakeResult);
  const [displayPlan, setDisplayPlan] = useState(recommendation.plan);
  const [serverPlan, setServerPlan] = useState<WakePlanResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const deadlineTime = formatKoreanTime(displayPlan.deadlineAt);
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<PlanEditValues>({
    defaultValues: {
      firstAlarmTime: formatKoreanTime(displayPlan.firstAlarmAt),
      finalAlarmTime: formatKoreanTime(displayPlan.finalAlarmAt),
    },
    resolver: zodResolver(createPlanEditSchema(deadlineTime)),
  });

  const mutation = useMutation({
    mutationFn: async ({
      changes,
      createdPlan,
      decision,
    }: {
      changes?: WakePlanDecisionChanges;
      createdPlan?: WakePlanResponse;
      decision: PlanDecision;
    }) => {
      let created = createdPlan ?? serverPlan;
      if (!created) {
        created =
          mode === "local"
            ? localPlanResponse()
            : await createWakePlan(
                sessionId as string,
                recommendation.plan,
                createWakePlanIdempotencyKey(recommendation.plan),
              );
      }

      const payload = createWakePlanDecisionPayload(
        decision,
        created.revision,
        changes,
      );
      const decisionResult =
        mode === "local"
          ? {
              revision: created.revision + 1,
              status:
                decision === "APPROVE"
                  ? ("APPROVED" as const)
                  : decision === "EDIT"
                    ? ("EDITED" as const)
                    : ("DECLINED" as const),
            }
          : await updateWakePlanDecision(
              sessionId as string,
              created.id,
              payload,
            );

      return { changes, created, decisionResult };
    },
    onSuccess: ({ changes, created, decisionResult }) => {
      const acceptedPlan = changes
        ? {
            ...displayPlan,
            firstAlarmAt: changes.firstAlarmAt ?? displayPlan.firstAlarmAt,
            finalAlarmAt: changes.finalAlarmAt ?? displayPlan.finalAlarmAt,
          }
        : displayPlan;
      setServerPlan({ ...created, ...decisionResult });
      setEditingPlanId(created.id);
      setWakeResult(null);
      setActiveWakePlan(
        decisionResult.status === "DECLINED"
          ? null
          : { ...acceptedPlan, id: created.id },
      );
      if (changes) {
        setDisplayPlan(acceptedPlan);
      }
      setEditing(false);
    },
  });

  const submitEdit = handleSubmit((values) => {
    mutation.mutate({
      decision: "EDIT",
      changes: {
        firstAlarmAt: koreanLocalTimeToUtc(
          displayPlan.localDate,
          values.firstAlarmTime,
        ),
        finalAlarmAt: koreanLocalTimeToUtc(
          displayPlan.localDate,
          values.finalAlarmTime,
        ),
      },
    });
  });
  const visibleReasons = getVisibleReasons(displayPlan.reasonCodes);
  const decisionComplete =
    serverPlan && ["APPROVED", "EDITED", "DECLINED"].includes(serverPlan.status);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-brand">로컬 추천 결과</p>
          <h1 className="display-title mt-2 text-3xl font-bold tracking-tight">내일 기상 계획</h1>
          <p className="mt-2 text-muted">
            최소한의 알람으로 {deadlineTime}까지 기상을 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm font-semibold">
          <span className="status-pill text-brand">
            {confidenceLabels[recommendation.confidenceBand]}
          </span>
          <span className="status-pill">
            {displayPlan.protocolLevel}단계
          </span>
          {displayPlan.requiresApproval ? (
            <span className="status-pill bg-warning/15 text-warning">
              승인 필요
            </span>
          ) : null}
        </div>
      </header>

      <section className="grid gap-4">
        <article className="glass-card rounded-[var(--radius-card)] p-6">
          <h2 className="text-xl font-bold">알람 타임라인</h2>
          <ol className="alarm-timeline mt-5 space-y-3">
            {displayPlan.steps.map((step, index) => {
              const isFinal = index === displayPlan.steps.length - 1;
              const alarmAt = isFinal
                ? displayPlan.finalAlarmAt
                : new Date(
                    new Date(displayPlan.firstAlarmAt).getTime() +
                      step.offsetMin * 60_000,
                  ).toISOString();
              return (
                <li className="alarm-step flex gap-4" key={step.order}>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white shadow-[0_6px_14px_rgba(184,32,90,0.2)]">
                    {step.order}
                  </span>
                  <div>
                    <p className="text-xl font-bold">
                      {formatKoreanTime(alarmAt)}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {channelLabels[step.channel] ?? step.channel}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </article>

        <aside className="soft-card rounded-[var(--radius-card)] p-6">
          <h2 className="text-lg font-bold">이렇게 제안한 이유</h2>
          {visibleReasons.length > 0 ? (
            <ul className="mt-4 space-y-3 text-sm leading-6 text-muted">
              {visibleReasons.map((reason) => (
                <li key={reason}>• {reason}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm leading-6 text-muted">
              일정 시각과 평소 범위의 로컬 입력을 기준으로 최소 단계를 선택했습니다.
            </p>
          )}
          <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted">
            수면·활동·컨디션 원본은 서버로 전송하지 않습니다.
          </p>
        </aside>
      </section>

      {editing ? (
        <form
          className="glass-card rounded-[var(--radius-card)] p-6"
          onSubmit={submitEdit}
        >
          <h2 className="text-lg font-bold">알람 시각 수정</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="font-semibold">
              첫 알람
              <input
                className="field-control mt-2 min-h-11 w-full px-3 py-2"
                type="time"
                {...register("firstAlarmTime")}
              />
              {errors.firstAlarmTime ? (
                <span className="mt-1 block text-sm text-danger">
                  {errors.firstAlarmTime.message}
                </span>
              ) : null}
            </label>
            <label className="font-semibold">
              최종 알람
              <input
                className="field-control mt-2 min-h-11 w-full px-3 py-2"
                type="time"
                {...register("finalAlarmTime")}
              />
              {errors.finalAlarmTime ? (
                <span className="mt-1 block text-sm text-danger">
                  {errors.finalAlarmTime.message}
                </span>
              ) : null}
            </label>
          </div>
          <div className="mt-5 flex gap-3">
            <button
              className="action-primary min-h-11 px-5 py-3 disabled:opacity-60"
              disabled={mutation.isPending}
              type="submit"
            >
              수정 저장
            </button>
            <button
              className="action-ghost min-h-11 px-5 py-3"
              onClick={() => setEditing(false)}
              type="button"
            >
              취소
            </button>
          </div>
        </form>
      ) : null}

      {!editing && !decisionComplete ? (
        <div className="glass-card flex flex-wrap gap-3 rounded-[var(--radius-card)] p-5">
          <button
            className="action-primary min-h-11 px-5 py-3 disabled:opacity-60"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ decision: "APPROVE" })}
            type="button"
          >
            이 계획 승인
          </button>
          <button
            className="action-secondary min-h-11 px-5 py-3 disabled:opacity-60"
            disabled={mutation.isPending}
            onClick={() => setEditing(true)}
            type="button"
          >
            시각 수정
          </button>
          <button
            className="action-ghost min-h-11 px-5 py-3 text-muted disabled:opacity-60"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ decision: "DECLINE" })}
            type="button"
          >
            사용하지 않기
          </button>
        </div>
      ) : null}

      {serverPlan ? (
        <div className="accent-panel p-5">
          <p aria-live="polite" className="font-semibold text-brand">
            계획 상태: {statusLabels[serverPlan.status] ?? serverPlan.status}
          </p>
          {serverPlan.status === "APPROVED" || serverPlan.status === "EDITED" ? (
            <Link
              className="action-primary mt-3 inline-flex min-h-11 items-center px-5 py-3"
              href="/wake"
            >
              기상 실행 시작
            </Link>
          ) : null}
        </div>
      ) : null}
      {mutation.isError ? (
        <ApiErrorState
          error={mutation.error}
          onRetry={async () => {
            if (!mutation.variables) {
              return;
            }
            if (
              mode === "server" &&
              sessionId &&
              getApiStatus(mutation.error) === 409
            ) {
              const latest = await getWakePlan(
                sessionId,
                recommendation.plan.localDate,
              );
              const refreshedPlan = {
                id: latest.id,
                revision: latest.revision,
                status: latest.status,
              };
              setServerPlan(refreshedPlan);
              setDisplayPlan({
                deadlineAt: latest.deadlineAt,
                finalAlarmAt: latest.finalAlarmAt,
                firstAlarmAt: latest.firstAlarmAt,
                importance: latest.importance,
                localDate: latest.localDate,
                modelVersion: latest.modelVersion,
                protocolLevel: latest.protocolLevel,
                reasonCodes: latest.reasonCodes,
                requiresApproval: latest.requiresApproval,
                steps: latest.steps,
                timezone: latest.timezone,
              });
              mutation.mutate({
                ...mutation.variables,
                createdPlan: refreshedPlan,
              });
            } else {
              mutation.mutate(mutation.variables);
            }
          }}
          title="기상 계획을 저장하지 못했습니다"
        />
      ) : null}

      <Link className="action-ghost inline-flex min-h-11 items-center px-5 py-3 font-semibold text-brand" href="/prepare">
        전날 준비로 돌아가기
      </Link>
    </div>
  );
}

export function WakePlanReview() {
  const {
    mode,
    overview,
    preparationQuery,
    query: overviewQuery,
    ready,
    recommendationQuery,
    sessionId,
  } = useWakeRecommendation();

  if (!ready) {
    return (
      <AppShell currentStep="계획">
        <section className="glass-card rounded-[var(--radius-card)] p-6">
          <h1 className="text-2xl font-bold">먼저 데모 상황을 선택해 주세요</h1>
          <Link className="mt-6 inline-flex min-h-11 items-center text-brand" href="/">
            데모 선택으로 이동
          </Link>
        </section>
      </AppShell>
    );
  }

  if (
    overviewQuery.isPending ||
    preparationQuery.isPending ||
    recommendationQuery.isPending
  ) {
    return (
      <AppShell currentStep="계획" eyebrow="기상 계획">
        <p aria-live="polite" className="soft-card rounded-[var(--radius-card)] p-6 text-muted">
          로컬 입력으로 최소 유효 알람을 계산하는 중입니다.
        </p>
      </AppShell>
    );
  }

  if (
    overviewQuery.isError ||
    preparationQuery.isError ||
    recommendationQuery.isError ||
    !overview?.event ||
    !recommendationQuery.data ||
    !mode
  ) {
    return (
      <AppShell currentStep="계획" eyebrow="기상 계획">
        <ApiErrorState
          error={
            overviewQuery.error ??
            preparationQuery.error ??
            recommendationQuery.error
          }
          onRetry={() => {
            void overviewQuery.refetch();
            void preparationQuery.refetch();
            void recommendationQuery.refetch();
          }}
          title="기상 계획을 계산하지 못했습니다"
        />
      </AppShell>
    );
  }

  return (
    <AppShell currentStep="계획" eyebrow="기상 계획">
      <WakePlanEditor
        mode={mode}
        recommendation={recommendationQuery.data}
        sessionId={sessionId}
      />
    </AppShell>
  );
}
