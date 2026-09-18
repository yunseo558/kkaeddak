"use client";

import { useState, useSyncExternalStore } from "react";

function subscribe() {
  return () => undefined;
}

export function TimezoneNotice({
  browserTimezone,
  scheduleTimezone,
}: {
  browserTimezone?: string;
  scheduleTimezone: string;
}) {
  const detectedTimezone = useSyncExternalStore(
    subscribe,
    () =>
      browserTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => browserTimezone ?? scheduleTimezone,
  );
  const [confirmed, setConfirmed] = useState(false);

  if (detectedTimezone === scheduleTimezone) {
    return null;
  }

  return (
    <section
      aria-labelledby="timezone-notice-title"
      className="rounded-[var(--radius-card)] border border-warning/40 bg-surface p-5"
    >
      <h2 className="font-bold" id="timezone-notice-title">
        기기와 일정의 시간대가 다릅니다
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        현재 기기 {detectedTimezone} · 일정 기준 {scheduleTimezone}
      </p>
      <p className="mt-1 text-sm leading-6 text-muted">
        일정 기준 시각으로 기상 마감을 계산합니다. 이동 중이라면 계산 기준을 확인해
        주세요.
      </p>
      {confirmed ? (
        <p aria-live="polite" className="mt-3 text-sm font-semibold text-success">
          일정 시간대 기준 계산을 확인했습니다.
        </p>
      ) : (
        <button
          className="mt-4 min-h-11 rounded-[var(--radius-control)] border border-warning px-4 py-3 font-semibold text-warning"
          onClick={() => setConfirmed(true)}
          type="button"
        >
          시간대 차이 확인
        </button>
      )}
    </section>
  );
}
