"use client";
import Link from "next/link";
import { useState } from "react";
import { demoSessionHeaders } from "@kkaeddak/api-client";
import { AppShell } from "@/components/layout/app-shell";
import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";
import { apiClient } from "@/lib/api/client";
import { useServiceStore } from "../model/service-store";
import { serviceAction } from "../lib/service-actions";

export function ServiceSettings() {
  const store = useServiceStore();
  const draft = useCurrentFlowStore((s) => s.onboardingDraft);
  const [automatic, setAutomatic] = useState(
    draft.automationMode === "automatic",
  );
  const [time, setTime] = useState(store.automationTime);
  const [saved, setSaved] = useState(false);
  return (
    <AppShell currentStep="결과">
      <div className="service-home">
        <h1>설정</h1>
        <form
          className="service-edit"
          onSubmit={(e) => {
            e.preventDefault();
            void serviceAction(async () => {
              const id = useDemoSessionStore.getState().sessionId;
              if (id) {
                const headers = demoSessionHeaders(id);
                const profile = await apiClient.GET("/api/v1/profile", {
                  headers,
                });
                if (!profile.data) throw new Error("설정을 불러오지 못했어요.");
                const { updatedAt: _updated, ...body } = profile.data;
                void _updated;
                const result = await apiClient.PUT("/api/v1/profile", {
                  headers,
                  body: {
                    ...body,
                    automationMode: automatic
                      ? "AUTO_ROUTINE_DAYS"
                      : "RECOMMEND_ONLY",
                  },
                });
                if (!result.data || result.error)
                  throw new Error("설정을 저장하지 못했어요.");
              }
              useCurrentFlowStore
                .getState()
                .setOnboardingDraft({
                  ...draft,
                  automationMode: automatic ? "automatic" : "suggest",
                });
              store.set({ automationTime: time });
              setSaved(true);
            });
          }}
        >
          <label>
            매일 알람을 정할 시각
            <input
              type="time"
              value={time}
              required
              onChange={(e) => {
                setTime(e.target.value);
                setSaved(false);
              }}
            />
          </label>
          <label className="service-checkbox">
            <input
              type="checkbox"
              checked={automatic}
              onChange={(e) => {
                setAutomatic(e.target.checked);
                setSaved(false);
              }}
            />
            적응 기간 후 자동 적용
          </label>
          <p className="service-muted">
            14일 이상 함께하고, 10일 이상 기록하며, 최근 5회 중 4회 제시간에
            일어나면 일반 일정에 자동 적용해요. 중요한 일정·수면 부족·불확실한
            날은 확인받아요.
          </p>
          <button disabled={store.busy} className="service-primary">
            설정 저장
          </button>
          {saved && (
            <p role="status" className="service-kicker">
              다음 계획부터 반영해요.
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
          <Link className="service-secondary" href="/settings/privacy">
            개인정보 및 데이터 삭제
          </Link>
          <p className="service-footnote">
            현재는 이 기기의 익명 프로필로 이용해요. 외부 계정 로그인과 Apple
            건강 연결은 제공되지 않아요. 자동 계획 확인은 앱을 열어 둔 동안
            동작해요.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
