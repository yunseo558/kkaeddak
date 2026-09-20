"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/layout/app-shell";
import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";
import {
  getWakeHistoryReport,
  type HistoryReportDetail,
} from "@/features/wake-report/api/wake-report-api";
import {
  getLocalWakeReport,
  mergeHistoryReportDetail,
} from "@/features/wake-report/lib/local-wake-reports";
import { getApiStatus } from "@/lib/api/api-recovery";
import {
  ensureFreshDemoSession,
  recoverDemoSession,
} from "../lib/service-actions";
import { clockTime } from "../model/service-policy";

function outcomeCopy(outcome: HistoryReportDetail["outcome"]) {
  if (!outcome) return "기기에 남은 결과가 없어요";
  if (outcome.outcome === "CONFIRMED_ON_TIME") return "제시간에 일어났어요";
  if (outcome.outcome === "CONFIRMED_LATE") return "조금 늦게 일어났어요";
  if (outcome.outcome === "UNCONFIRMED") return "마지막까지 기상을 확인하지 못했어요";
  return "사용자가 계획을 취소했어요";
}

function signalCopy(value: string | null | undefined) {
  if (value === "high") return "높음";
  if (value === "moderate" || value === "normal") return "보통";
  if (value === "low") return "낮음";
  return "연결 전";
}

export function analysisBadgeCopy(source: "MODEL" | "TEMPLATE") {
  return source === "MODEL" ? "Gemini 분석" : "안전 폴백";
}

function timelineStatus(step: HistoryReportDetail["alarmTimeline"][number]) {
  const types = new Set(step.events.map((event) => event.eventType));
  if (types.has("CONFIRMED_AWAKE")) return "기상 확인";
  if (types.has("MISSED")) return "일어나지 못함";
  if (types.has("CANCELLED")) return "남은 알람 취소";
  if (types.has("DISMISSED")) return "해제 후 확인 대기";
  if (types.has("RANG")) return "알람 울림";
  return "실행 전";
}

function lastOccurredAt(step: HistoryReportDetail["alarmTimeline"][number]) {
  return [...step.events].sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt),
  )[0]?.occurredAt;
}

export function ServiceHistoryDetail({ date }: { date: string }) {
  const reportQuery = useQuery({
    queryKey: ["wake-history-report", date],
    queryFn: async () => {
    const local = await getLocalWakeReport(date);
    let server: HistoryReportDetail | null = null;
    let serverUnavailable = false;
    try {
      await ensureFreshDemoSession();
      let id = useDemoSessionStore.getState().sessionId;
      if (!id) throw new Error("데모 연결이 필요해요.");
      try {
        server = await getWakeHistoryReport(id, date);
      } catch (requestError) {
        if (getApiStatus(requestError) === 404) {
          server = null;
        } else if (getApiStatus(requestError) === 401) {
          await recoverDemoSession();
          id = useDemoSessionStore.getState().sessionId;
          if (!id) throw requestError;
          try {
            server = await getWakeHistoryReport(id, date);
          } catch (retryError) {
            if (getApiStatus(retryError) !== 404) throw retryError;
          }
        } else {
          throw requestError;
        }
      }
    } catch {
      serverUnavailable = true;
    }
      return {
        report: mergeHistoryReportDetail(server, local),
        serverUnavailable,
      };
    },
  });
  const report = reportQuery.data?.report ?? null;
  const loading = reportQuery.isPending;
  const error = Boolean(reportQuery.data?.serverUnavailable);

  const context = report?.decisionContext;
  const learning = report?.learningEffect;
  const outcome = report?.outcome;
  const advanceDelta = learning
    ? learning.nextAdvanceMinutes - learning.previousAdvanceMinutes
    : 0;
  const protocolDelta = learning
    ? learning.nextProtocolAdjustment - learning.previousProtocolAdjustment
    : 0;

  return (
    <AppShell currentStep="결과" homeScene>
      <div className="service-home history-detail">
        <header className="settings-detail-header">
          <Link aria-label="기록 목록으로 돌아가기" href="/history">‹</Link>
          <div>
            <p className="service-kicker">아침 리포트</p>
            <h1>{date.replaceAll("-", ". ")}</h1>
          </div>
        </header>

        {loading && !report ? (
          <div className="history-skeleton" aria-label="상세 기록 불러오는 중">
            {[0, 1, 2, 3].map((item) => <span key={item} />)}
          </div>
        ) : !report || !context ? (
          <section className="service-section history-legacy-card">
            <span className="service-tag">이전 기록</span>
            <h2>이 기록은 이전 버전에서 생성되어 상세 분석이 없어요</h2>
            <p className="service-muted">
              기상 결과는 기록 목록에 유지되며, 다음 계획부터 판단 근거와 학습 변화가 함께 저장돼요.
            </p>
            {error && (
              <button className="action-ghost" onClick={() => void reportQuery.refetch()}>
                다시 불러오기
              </button>
            )}
          </section>
        ) : (
          <>
            {error && (
              <div className="history-load-notice" role="status">
                <p>서버 대신 기기에 안전하게 남은 리포트를 보여드려요.</p>
                <button className="action-ghost" onClick={() => void reportQuery.refetch()}>
                  다시 불러오기
                </button>
              </div>
            )}

            <section className="service-plan history-outcome-hero">
              <p className="service-kicker">최종 기상 결과</p>
              <h2>{outcomeCopy(outcome)}</h2>
              <p className="service-muted">
                {outcome
                  ? `${outcome.alarmStepsUsed}번째 알람까지 사용했어요.`
                  : "결과 동기화 동의와 관계없이 기기의 기록을 먼저 확인해요."}
              </p>
            </section>

            <section className="service-section history-report-card">
              <p className="service-kicker">이날 일정</p>
              <h2>{context.schedule.title}</h2>
              <dl className="history-fact-grid">
                <div><dt>일정 시각</dt><dd>{clockTime(context.schedule.startsAt)}</dd></div>
                <div><dt>AI 분류</dt><dd>{context.schedule.categoryLabel}</dd></div>
                <div><dt>기상 기준</dt><dd>일정 {context.schedule.wakeLeadMin}분 전</dd></div>
              </dl>
            </section>

            <section className="service-section history-report-card">
              <p className="service-kicker">알람을 정한 기준</p>
              <h2>그날의 회복 신호와 최근 기록을 함께 봤어요</h2>
              <dl className="history-fact-grid history-fact-grid--two">
                <div><dt>수면</dt><dd>{context.healthSummary?.restMinutes ? `${Math.floor(context.healthSummary.restMinutes / 60)}시간 ${context.healthSummary.restMinutes % 60}분` : "연결 전"}</dd></div>
                <div><dt>활동량</dt><dd>{signalCopy(context.healthSummary?.activityLevel)}</dd></div>
                <div><dt>컨디션</dt><dd>{signalCopy(context.healthSummary?.conditionLevel)}</dd></div>
                <div><dt>최근 기록</dt><dd>성공 {context.historySignals.recentOnTimeCount} · 지각 {context.historySignals.recentLateCount} · 실패 {context.historySignals.recentMissedCount}</dd></div>
                <div><dt>선호 알람</dt><dd>{context.alarmPreferences.preferredAlarmCount}개 · {context.alarmPreferences.preferredIntervalMin}분 간격</dd></div>
              </dl>
            </section>

            <section className="service-section history-report-card">
              <div className="service-row">
                <div>
                  <p className="service-kicker">AI 분석</p>
                  <h2>피로도 {context.personalization.fatigueScore}점</h2>
                </div>
                <span className="home-ai-badge">
                  {analysisBadgeCopy(context.personalization.source)}
                </span>
              </div>
              <p>{context.personalization.explanation}</p>
              <dl className="history-fact-grid">
                <div><dt>단계</dt><dd>{context.personalization.fatigueLevel === "HIGH" ? "높음" : context.personalization.fatigueLevel === "MEDIUM" ? "보통" : "낮음"}</dd></div>
                <div><dt>신뢰도</dt><dd>{Math.round(context.personalization.confidence * 100)}%</dd></div>
                <div><dt>적용 방식</dt><dd>{context.personalization.automatic ? "자동 적용" : "승인 후 적용"}</dd></div>
              </dl>
            </section>

            <section className="service-section history-report-card">
              <p className="service-kicker">알람 타임라인</p>
              <h2>실제로 진행된 알람 단계</h2>
              <ol className="history-timeline">
                {report.alarmTimeline.map((step) => {
                  const occurredAt = lastOccurredAt(step);
                  return (
                    <li key={step.order}>
                      <span>{step.order}</span>
                      <div><strong>{clockTime(step.scheduledAt)} 예정</strong><small>{occurredAt ? `${clockTime(occurredAt)} · ${timelineStatus(step)}` : timelineStatus(step)}</small></div>
                    </li>
                  );
                })}
              </ol>
            </section>

            <section className="service-section history-report-card history-learning-card">
              <p className="service-kicker">다음 계획에 미친 영향</p>
              {learning ? (
                <>
                  <h2>{learning.recommendation}</h2>
                  <dl className="history-fact-grid history-fact-grid--two">
                    <div><dt>첫 알람</dt><dd>{advanceDelta === 0 ? "현재 시각 유지" : advanceDelta > 0 ? `${advanceDelta}분 더 일찍` : `${Math.abs(advanceDelta)}분 더 늦게`}</dd></div>
                    <div><dt>안전 단계</dt><dd>{protocolDelta === 0 ? "현재 단계 유지" : protocolDelta > 0 ? `${protocolDelta}단계 강화` : `${Math.abs(protocolDelta)}단계 완화`}</dd></div>
                  </dl>
                </>
              ) : (
                <p className="service-muted">아직 다음 계획에 반영할 기상 결과가 없어요.</p>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
