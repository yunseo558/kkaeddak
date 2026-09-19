"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { AppShell } from "@/components/layout/app-shell";
import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { useOnlineStatus } from "@/lib/network/use-online-status";

import { createDemoSession } from "../api/create-demo-session";
import { useDemoSessionStore } from "../model/demo-session-store";
import { saveScenarioHealthInput } from "../model/scenario-health-input";
import { scenarioIdSchema, scenarios } from "../model/scenarios";

const formSchema = z.object({
  scenarioId: scenarioIdSchema,
});

type FormValues = z.infer<typeof formSchema>;

export function DemoStart() {
  const router = useRouter();
  const onboardingCompleted = useCurrentFlowStore(
    (state) => state.onboardingCompleted,
  );
  const startLocal = useDemoSessionStore((state) => state.startLocal);
  const startServer = useDemoSessionStore((state) => state.startServer);
  const online = useOnlineStatus();
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);
  const { control, handleSubmit, register } = useForm<FormValues>({
    defaultValues: { scenarioId: "exam-morning" },
    resolver: zodResolver(formSchema),
  });
  const selectedScenario = useWatch({ control, name: "scenarioId" });

  const mutation = useMutation({
    mutationFn: createDemoSession,
    networkMode: "always",
  });

  const onSubmit = handleSubmit(async ({ scenarioId }) => {
    setFallbackMessage(null);
    await saveScenarioHealthInput(scenarioId);

    if (!online) {
      startLocal(scenarioId);
      setFallbackMessage(
        "오프라인 상태입니다. 저장된 정보로 기상 계획을 계속 만듭니다.",
      );
      router.push(onboardingCompleted ? "/tomorrow" : "/onboarding");
      return;
    }

    try {
      const session = await mutation.mutateAsync(scenarioId);
      startServer({
        expiresAt: session.expiresAt,
        scenarioId,
        sessionId: session.sessionId,
      });
    } catch {
      startLocal(scenarioId);
      setFallbackMessage(
        "서버에 연결하지 못했습니다. 저장된 정보로 기상 계획을 계속 만듭니다.",
      );
    }

    router.push(onboardingCompleted ? "/tomorrow" : "/onboarding");
  });

  return (
    <AppShell currentStep="소개" eyebrow="오늘의 기상 준비">
      <div className="space-y-7">
        <section className="hero-copy pt-2">
          <h1 className="max-w-3xl text-3xl font-bold leading-[1.15] tracking-tight sm:text-5xl">
            내일 일정과 오늘 상태에 맞춰
            <strong className="block">필요한 만큼만 깨웁니다</strong>
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted">
            내일 일정과 준비 루틴을 분석해 수면을 더 지키고, 필요한
            순간에만 알람을 울립니다.
          </p>
        </section>

        <form
          className="glass-card rounded-[var(--radius-card)] p-5 sm:p-7"
          onSubmit={onSubmit}
        >
          <fieldset>
            <legend className="text-xl font-bold">내일의 상황을 선택하세요</legend>
            <div className="mt-5 grid gap-3">
              {scenarios.map((scenario) => {
                const checked = selectedScenario === scenario.id;
                return (
                  <label
                    className="choice-card cursor-pointer rounded-[var(--radius-control)] p-4"
                    data-selected={checked}
                    key={scenario.id}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      value={scenario.id}
                      {...register("scenarioId")}
                    />
                    <span className="block font-semibold">{scenario.name}</span>
                    <span className="mt-1 block text-sm text-muted">
                      {scenario.summary}
                    </span>
                    <span className="mt-2 block text-sm leading-6">
                      {scenario.detail}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {fallbackMessage ? (
            <p aria-live="polite" className="mt-4 text-sm text-warning">
              {fallbackMessage}
            </p>
          ) : null}

          <button
            className="action-primary mt-5 min-h-12 w-full px-5 py-3 disabled:cursor-wait disabled:opacity-60"
            disabled={mutation.isPending}
            type="submit"
          >
            {mutation.isPending ? "기상 계획을 만드는 중…" : "내일 기상 계획 만들기"}
          </button>
        </form>

        <ul className="feature-list text-sm leading-6 text-muted">
          <li>일정과 수면 패턴을 바탕으로 기상 시간을 계산합니다.</li>
          <li>필요할 때만 예비 알람을 추가해 불필요한 기상을 줄입니다.</li>
          <li>네트워크가 끊겨도 저장된 계획은 계속 확인할 수 있습니다.</li>
        </ul>
      </div>
    </AppShell>
  );
}
