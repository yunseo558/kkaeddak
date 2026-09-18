"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";
import { getApiRecoveryPresentation } from "@/lib/api/api-recovery";

export function ApiErrorState({
  error,
  onRetry,
  title,
}: {
  error: unknown;
  onRetry: () => void;
  title: string;
}) {
  const queryClient = useQueryClient();
  const clearSession = useDemoSessionStore((state) => state.clear);
  const recovery = getApiRecoveryPresentation(error);

  return (
    <section
      aria-labelledby="api-error-title"
      className="rounded-[var(--radius-card)] border border-border bg-surface p-6"
    >
      <h1 className="text-2xl font-bold" id="api-error-title">
        {title}
      </h1>
      <p className="mt-3 leading-7 text-muted">{recovery.description}</p>
      {recovery.kind === "session" ? (
        <Link
          className="mt-6 inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-brand px-5 py-3 font-semibold text-white"
          href="/"
          onClick={() => {
            clearSession();
            queryClient.clear();
          }}
        >
          시나리오 다시 선택
        </Link>
      ) : recovery.kind === "consent" ? (
        <Link
          className="mt-6 inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-brand px-5 py-3 font-semibold text-white"
          href="/settings/privacy"
        >
          개인정보 설정 확인
        </Link>
      ) : (
        <button
          className="mt-6 min-h-11 rounded-[var(--radius-control)] bg-brand px-5 py-3 font-semibold text-white"
          onClick={onRetry}
          type="button"
        >
          다시 시도
        </button>
      )}
    </section>
  );
}
