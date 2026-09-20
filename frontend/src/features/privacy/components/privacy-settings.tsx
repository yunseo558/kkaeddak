"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";
import {
  localDataStore,
  type LocalStorageMode,
} from "@/lib/storage/local-data";

import { resetLocalData } from "../lib/reset-local-data";
import { updateOutcomeSyncConsent } from "../api/privacy-api";

export function PrivacySettings() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const draft = useCurrentFlowStore((state) => state.onboardingDraft);
  const setDraft = useCurrentFlowStore((state) => state.setOnboardingDraft);
  const mode = useDemoSessionStore((state) => state.mode);
  const sessionId = useDemoSessionStore((state) => state.sessionId);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [storageMode, setStorageMode] =
    useState<LocalStorageMode>("persistent");
  const consentMutation = useMutation({
    mutationFn: async () => {
      if (mode !== "server" || !sessionId) {
        return null;
      }
      return updateOutcomeSyncConsent(sessionId, draft.outcomeSync);
    },
  });

  useEffect(() => {
    void localDataStore.resolveMode().then(setStorageMode);
  }, []);

  const deleteLocalData = async () => {
    setDeleting(true);
    setMessage("로컬 데이터를 삭제하는 중입니다.");

    try {
      await resetLocalData();
      queryClient.clear();
      router.replace("/");
    } catch {
      setDeleting(false);
      setMessage("삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  return (
    <AppShell currentStep="결과" eyebrow="개인정보 설정">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="display-title text-3xl font-bold tracking-tight">내 데이터 관리</h1>
          <p className="mt-3 leading-7 text-muted">
            건강 입력, 개인 모델, 기상 이벤트 원본은 서버가 아니라 이 브라우저에만
            보관합니다.
          </p>
        </header>

        <section className="soft-card rounded-[var(--radius-card)] p-5 sm:p-6">
          <h2 className="text-lg font-bold">현재 저장 방식</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {storageMode === "persistent"
              ? "브라우저 로컬 저장소를 사용하고 있습니다."
              : "브라우저 저장소가 차단되어, 창을 닫으면 사라지는 일회성 모드입니다."}
          </p>
        </section>

        <section className="glass-card rounded-[var(--radius-card)] p-5 sm:p-6">
          <h2 className="text-lg font-bold">AI 개인화 분석</h2>
          <label className="choice-card mt-4 flex min-h-11 items-start gap-3 rounded-[var(--radius-control)] p-4">
            <input
              checked={draft.aiPersonalizationConsent}
              className="mt-1"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  aiPersonalizationConsent: event.target.checked,
                })
              }
              type="checkbox"
            />
            <span>
              <strong className="block">Gemini 개인화 분석 허용</strong>
              <span className="text-sm leading-6 text-muted">
                수면 시간, 활동·컨디션 수준, 최근 기상 결과의 요약값만 보내며
                일정 제목과 건강 원본은 전송하지 않습니다. 끄면 로컬 기본 분석을
                사용합니다.
              </span>
            </span>
          </label>
        </section>

        <section className="glass-card rounded-[var(--radius-card)] p-5 sm:p-6">
          <h2 className="text-lg font-bold">선택적 결과 동기화</h2>
          <label className="choice-card mt-4 flex min-h-11 items-start gap-3 rounded-[var(--radius-control)] p-4">
            <input
              checked={draft.outcomeSync}
              className="mt-1"
              onChange={(event) =>
                setDraft({ ...draft, outcomeSync: event.target.checked })
              }
              type="checkbox"
            />
            <span>
              <strong className="block">집계 결과 서버 동기화 허용</strong>
              <span className="text-sm text-muted">
                건강 원본과 개인 모델은 이 설정과 관계없이 전송하지 않습니다.
              </span>
            </span>
          </label>
          <button
            className="action-primary mt-4 min-h-11 px-5 py-3 disabled:opacity-60"
            disabled={consentMutation.isPending}
            onClick={() => consentMutation.mutate()}
            type="button"
          >
            {consentMutation.isPending ? "설정 저장 중…" : "동기화 설정 저장"}
          </button>
          {consentMutation.isSuccess ? (
            <p aria-live="polite" className="mt-3 text-sm text-success">
              {mode === "server"
                ? "서버 집계 동의 설정을 저장했습니다."
                : "로컬 동의 설정을 저장했습니다."}
            </p>
          ) : null}
          {consentMutation.isError ? (
            <p aria-live="polite" className="mt-3 text-sm text-danger">
              서버 설정을 저장하지 못했습니다. 로컬 설정은 유지됩니다.
            </p>
          ) : null}
        </section>

        <section className="glass-card rounded-[var(--radius-card)] border-danger/40 p-5 sm:p-6">
          <h2 className="text-lg font-bold text-danger">로컬 데이터 삭제</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            건강 입력, 개인 모델, 기상 이벤트와 현재 진행 상태를 모두 지우고 처음
            화면으로 돌아갑니다.
          </p>

          {confirming ? (
            <div className="mt-5 rounded-[var(--radius-control)] bg-[#fff5f6] p-4">
              <p className="font-semibold">정말 모두 삭제할까요?</p>
              <p className="mt-1 text-sm text-muted">이 작업은 되돌릴 수 없습니다.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="min-h-11 rounded-[var(--radius-control)] bg-danger px-5 py-3 font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                  disabled={deleting}
                  onClick={deleteLocalData}
                  type="button"
                >
                  {deleting ? "삭제 중…" : "모두 삭제"}
                </button>
                <button
                  className="action-ghost min-h-11 px-5 py-3 disabled:opacity-60"
                  disabled={deleting}
                  onClick={() => setConfirming(false)}
                  type="button"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <button
              className="mt-5 min-h-11 rounded-[var(--radius-control)] border border-danger px-5 py-3 font-semibold text-danger"
              onClick={() => setConfirming(true)}
              type="button"
            >
              로컬 데이터 삭제
            </button>
          )}

          {message ? (
            <p aria-live="polite" className="mt-4 text-sm text-muted">
              {message}
            </p>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
