"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";
import {
  listWakeHistoryReports,
  type HistoryReportListItem,
} from "@/features/wake-report/api/wake-report-api";
import {
  getLocalWakeReports,
  localReportListItem,
} from "@/features/wake-report/lib/local-wake-reports";
import { getApiStatus } from "@/lib/api/api-recovery";
import {
  ensureFreshDemoSession,
  recoverDemoSession,
  serviceNow,
} from "../lib/service-actions";
import { addDays, localDate } from "../model/service-policy";
import { useServiceStore } from "../model/service-store";
import { SetupGuidanceScene } from "./home-alarm-scene";

function outcomeCopy(outcome: HistoryReportListItem["outcome"]) {
  if (outcome === "CONFIRMED_ON_TIME") return "제시간에 일어났어요";
  if (outcome === "CONFIRMED_LATE") return "조금 늦게 일어났어요";
  if (outcome === "UNCONFIRMED") return "기상을 확인하지 못했어요";
  if (outcome === "USER_CANCELLED") return "사용자가 계획을 취소했어요";
  return "기상 결과를 기다리고 있어요";
}

export function ServiceHistory() {
  const store = useServiceStore();
  const completed = useCurrentFlowStore((state) => state.onboardingCompleted);

  const loadReports = useCallback(async () => {
    const now = localDate(serviceNow());
    const from = addDays(now, -29);
    const localReports = await getLocalWakeReports();
    let serverItems: HistoryReportListItem[] = [];
    let serverUnavailable = false;
    try {
      await ensureFreshDemoSession();
      let id = useDemoSessionStore.getState().sessionId;
      if (!id) throw new Error("데모 연결이 필요해요.");
      try {
        serverItems = (await listWakeHistoryReports(id, from, now)).items;
      } catch (requestError) {
        if (getApiStatus(requestError) !== 401) throw requestError;
        await recoverDemoSession();
        id = useDemoSessionStore.getState().sessionId;
        if (!id) throw requestError;
        serverItems = (await listWakeHistoryReports(id, from, now)).items;
      }
    } catch {
      serverUnavailable = true;
    }

    const merged = new Map<string, HistoryReportListItem>();
    for (const report of localReports) {
      if (report.localDate < from || report.localDate > now) continue;
      merged.set(report.localDate, localReportListItem(report));
    }
    for (const report of serverItems) {
      const local = merged.get(report.localDate);
      merged.set(report.localDate, {
        ...report,
        outcome: report.outcome ?? local?.outcome ?? null,
        eventTitle: report.eventTitle ?? local?.eventTitle ?? null,
        reportReady: report.reportReady || Boolean(local?.reportReady),
      });
    }
    for (const record of store.records) {
      if (merged.has(record.date)) continue;
      merged.set(record.date, {
        localDate: record.date,
        planId: `legacy:${record.date}`,
        status: "COMPLETED",
        eventTitle: null,
        firstAlarmAt: `${record.date}T00:00:00.000Z`,
        finalAlarmAt: `${record.date}T00:00:00.000Z`,
        alarmCount: record.alarmStepsUsed ?? 0,
        outcome: record.outcome,
        reportReady: false,
      });
    }
    return {
      reports: Array.from(merged.values())
        .sort((a, b) => b.localDate.localeCompare(a.localDate))
        .slice(0, 30),
      serverUnavailable,
    };
  }, [store.records]);

  const historyQuery = useQuery({
    queryKey: [
      "wake-history-reports",
      store.records.map((record) => `${record.date}:${record.outcome}`).join(","),
    ],
    queryFn: loadReports,
    enabled: completed && store.calendarConnected,
  });
  const reports = historyQuery.data?.reports ?? [];
  const loading = historyQuery.isPending;
  const error = Boolean(historyQuery.data?.serverUnavailable);

  const successes = reports.filter(
    (report) => report.outcome === "CONFIRMED_ON_TIME",
  ).length;

  if (!completed || !store.calendarConnected)
    return (
      <AppShell currentStep="결과" homeScene>
        <div className="service-home">
          <header className="service-heading"><div><p className="service-kicker">기상 학습</p><h1>기록</h1></div><span className="service-tag">기록 전</span></header>
          <SetupGuidanceScene
            description="첫 기상 계획을 만들면 알람을 끈 뒤 실제로 일어났는지를 확인해요. 실패한 경우에만 다음 알람을 실행하고, 결과를 다음 계획에 학습할게요."
            href="/onboarding"
            label="첫 계획 설정하기"
            title="첫 아침을 기록할 준비를 해요"
          />
        </div>
      </AppShell>
    );

  return (
    <AppShell currentStep="결과" homeScene>
      <div className="service-home">
        <header className="service-heading">
          <h1>나의 아침 기록</h1>
          <span className="service-tag">최근 30회</span>
        </header>
        <section className="service-plan">
          <p className="service-kicker">제시간에 시작한 아침</p>
          <p className="service-clock">
            {successes}
            <small className="text-lg"> / {reports.length}일</small>
          </p>
          <p className="service-muted">
            날짜를 누르면 알람을 정한 이유와 다음 계획의 변화를 볼 수 있어요.
          </p>
        </section>

        {error && (
          <div className="history-load-notice" role="status">
            <p>서버 기록을 불러오지 못해 기기에 남은 기록을 보여드려요.</p>
            <button className="action-ghost" onClick={() => void historyQuery.refetch()}>
              다시 불러오기
            </button>
          </div>
        )}

        {loading ? (
          <div className="history-skeleton" aria-label="기상 기록 불러오는 중">
            {[0, 1, 2].map((item) => <span key={item} />)}
          </div>
        ) : reports.length ? (
          <div className="calendar-list">
            {reports.map((report) => (
              <Link
                className="calendar-event history-report-link"
                href={`/history/${report.localDate}`}
                key={report.localDate}
              >
                <span className="calendar-date">{report.localDate.slice(-2)}</span>
                <span>
                  <strong>{outcomeCopy(report.outcome)}</strong>
                  <small>
                    {report.eventTitle ?? report.localDate}
                    {!report.reportReady ? " · 이전 기록" : ""}
                  </small>
                </span>
                <span className="history-row-chevron" aria-hidden="true">›</span>
              </Link>
            ))}
          </div>
        ) : (
          <section className="service-section">
            <h2>첫 아침을 기다리고 있어요</h2>
            <p className="service-muted">
              알람이 울린 뒤 기상 여부를 알려주면 이곳에 기록돼요.
            </p>
          </section>
        )}
      </div>
    </AppShell>
  );
}
