"use client";

import type { components } from "@kkaeddak/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { ApiErrorState } from "@/components/foundation/api-error-state";
import { AppShell } from "@/components/layout/app-shell";
import {
  updatePreparationTask,
} from "@/features/tomorrow/api/tomorrow-api";
import {
  calculateWakeDeadline,
  formatKoreanTime,
  sumCompletedPreparationMinutes,
  sumRoutineMinutes,
} from "@/features/tomorrow/lib/schedule-calculation";
import type { PreparationSuggestions } from "@/features/tomorrow/model/tomorrow-data";
import { useTomorrowOverview } from "@/features/tomorrow/model/use-tomorrow-overview";
import { getApiStatus } from "@/lib/api/api-recovery";

import {
  preparationQueryKey,
  usePreparationSuggestions,
} from "../model/use-preparation-suggestions";

type PrepStatus = components["schemas"]["PrepStatus"];
type PreparationSuggestion = components["schemas"]["PreparationSuggestion"];

export function PreparationPlanner() {
  const queryClient = useQueryClient();
  const {
    mode,
    query: overviewQuery,
    ready,
    sessionId,
  } = useTomorrowOverview();
  const overview = overviewQuery.data;
  const eventId = overview?.event?.id ?? null;
  const queryKey = preparationQueryKey(mode, sessionId, eventId);
  const suggestionsQuery = usePreparationSuggestions({
    mode,
    overview,
    sessionId,
  });

  const mutation = useMutation({
    mutationFn: async ({
      status,
      suggestion,
    }: {
      status: PrepStatus;
      suggestion: PreparationSuggestion;
    }) => {
      if (mode === "local") {
        return {
          id: suggestion.id,
          status,
          revision: suggestion.revision + 1,
          updatedAt: new Date().toISOString(),
        };
      }
      if (!sessionId) {
        throw new Error("A demo session is required");
      }
      return updatePreparationTask(
        sessionId,
        suggestion.id,
        status,
        suggestion.revision,
      );
    },
    onMutate: async ({ status, suggestion }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PreparationSuggestions>(queryKey);
      queryClient.setQueryData<PreparationSuggestions>(queryKey, (current) =>
        current
          ? {
              ...current,
              suggestions: current.suggestions.map((item) =>
                item.id === suggestion.id ? { ...item, status } : item,
              ),
            }
          : current,
      );
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      if (getApiStatus(error) === 409) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData<PreparationSuggestions>(queryKey, (current) =>
        current
          ? {
              ...current,
              suggestions: current.suggestions.map((item) =>
                item.id === result.id
                  ? {
                      ...item,
                      status: result.status,
                      revision: result.revision,
                    }
                  : item,
              ),
            }
          : current,
      );
    },
  });

  if (!ready) {
    return (
      <AppShell currentStep="준비">
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-6">
          <h1 className="text-2xl font-bold">먼저 데모 상황을 선택해 주세요</h1>
          <Link className="mt-6 inline-flex min-h-11 items-center text-brand" href="/">
            데모 선택으로 이동
          </Link>
        </section>
      </AppShell>
    );
  }

  if (overviewQuery.isPending || suggestionsQuery.isPending) {
    return (
      <AppShell currentStep="준비" eyebrow="전날 준비">
        <p aria-live="polite" className="rounded-xl bg-surface p-6 text-muted">
          옮길 수 있는 준비 작업을 찾는 중입니다.
        </p>
      </AppShell>
    );
  }

  if (
    overviewQuery.isError ||
    suggestionsQuery.isError ||
    !overview?.event ||
    !suggestionsQuery.data
  ) {
    return (
      <AppShell currentStep="준비" eyebrow="전날 준비">
        <ApiErrorState
          error={overviewQuery.error ?? suggestionsQuery.error}
          onRetry={() => {
            void overviewQuery.refetch();
            void suggestionsQuery.refetch();
          }}
          title="준비 작업을 불러오지 못했습니다"
        />
      </AppShell>
    );
  }

  const routineMinutes = sumRoutineMinutes(overview.routine.routineTasks);
  const completedMinutes = sumCompletedPreparationMinutes(
    suggestionsQuery.data.suggestions,
  );
  const baseDeadline = calculateWakeDeadline({
    eventStartsAt: overview.event.startsAt,
    routineMinutes,
    wakeBufferMinutes: overview.routine.wakeBufferMin,
  });
  const adjustedDeadline = calculateWakeDeadline({
    eventStartsAt: overview.event.startsAt,
    routineMinutes,
    wakeBufferMinutes: overview.routine.wakeBufferMin,
    completedPreparationMinutes: completedMinutes,
  });

  return (
    <AppShell currentStep="준비" eyebrow="전날 준비">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">
            오늘 밤 미리 끝낼 수 있는 일
          </h1>
          <p className="mt-3 leading-7 text-muted">
            완료 표시한 시간만 내일 아침 준비시간에서 빠집니다.
          </p>
        </header>

        <section className="grid grid-cols-2 gap-3 rounded-[var(--radius-card)] bg-brand-soft p-5 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold text-brand">기본 기상 마감</p>
            <p className="mt-1 text-2xl font-bold">{formatKoreanTime(baseDeadline)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-brand">확보한 시간</p>
            <p className="mt-1 text-2xl font-bold">{completedMinutes}분</p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="text-xs font-semibold text-brand">조정된 마감</p>
            <p className="mt-1 text-2xl font-bold">
              {formatKoreanTime(adjustedDeadline)}
            </p>
          </div>
        </section>

        <section aria-labelledby="preparation-list-title">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-xl font-bold" id="preparation-list-title">
              준비 작업
            </h2>
            <span className="text-sm text-muted">
              최대 {suggestionsQuery.data.totalPotentialMinutes}분
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {suggestionsQuery.data.suggestions.map((suggestion) => {
              const completed = suggestion.status === "COMPLETED";
              const pending =
                mutation.isPending &&
                mutation.variables?.suggestion.id === suggestion.id;
              return (
                <label
                  className={`flex min-h-14 cursor-pointer items-center gap-4 rounded-[var(--radius-card)] border p-4 transition-colors ${
                    completed
                      ? "border-success bg-brand-soft"
                      : "border-border bg-surface"
                  }`}
                  key={suggestion.id}
                >
                  <input
                    checked={completed}
                    disabled={pending}
                    onChange={(event) =>
                      mutation.mutate({
                        suggestion,
                        status: event.target.checked ? "COMPLETED" : "SUGGESTED",
                      })
                    }
                    type="checkbox"
                  />
                  <span className="min-w-0 flex-1">
                    <strong className="block">{suggestion.label}</strong>
                    <span className="mt-1 block text-sm text-muted">
                      {completed ? "완료됨" : "완료하면 아침 시간이 줄어요"}
                    </span>
                  </span>
                  <span className="font-semibold text-brand">
                    {suggestion.minutesSaved}분
                  </span>
                </label>
              );
            })}
          </div>

          {suggestionsQuery.data.suggestions.length === 0 ? (
            <p className="mt-4 rounded-xl bg-surface p-5 text-muted">
              전날로 옮길 수 있는 준비 작업이 없습니다.
            </p>
          ) : null}
        </section>

        {mutation.isError ? (
          <ApiErrorState
            error={mutation.error}
            onRetry={() => {
              if (getApiStatus(mutation.error) === 409) {
                void suggestionsQuery.refetch();
              } else if (mutation.variables) {
                mutation.mutate(mutation.variables);
              }
            }}
            title="준비 작업 상태를 저장하지 못했습니다"
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-4">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-brand px-5 py-3 font-semibold text-white"
            href="/plan"
          >
            기상 계획 만들기
          </Link>
          <Link
            className="inline-flex min-h-11 items-center font-semibold text-brand"
            href="/tomorrow"
          >
            내일 대시보드로 돌아가기
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
