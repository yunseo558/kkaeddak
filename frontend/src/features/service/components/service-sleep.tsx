"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { useServiceStore } from "../model/service-store";

const SAMPLE_OFFSETS = [-18, 12, -6, 25, -12, 8, 0];
const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

export function ServiceSleep() {
  const store = useServiceStore();
  const hours = Math.floor(store.sleepMinutes / 60);
  const minutes = store.sleepMinutes % 60;
  const average = Math.round(
    SAMPLE_OFFSETS.reduce((sum, offset) => sum + store.sleepMinutes + offset, 0) /
      SAMPLE_OFFSETS.length,
  );
  const averageHours = Math.floor(average / 60);
  const averageMinutes = average % 60;

  return (
    <AppShell currentStep="분석">
      <div className="service-home sleep-screen">
        <header className="service-heading">
          <div><p className="service-kicker">최근 7일</p><h1>수면 패턴</h1></div>
          <span className="service-tag">{store.healthConnected ? "연동 완료" : "연동 필요"}</span>
        </header>

        {!store.healthConnected ? (
          <section className="service-empty-state">
            <div className="service-empty-icon" aria-hidden="true">🌙</div>
            <h2>수면 데이터를 연결해 주세요</h2>
            <p>최근 수면과 기상 기록을 분석해 필요한 날에만 예비 알람을 더해요.</p>
            <Link className="service-primary" href="/settings/connections">연동 설정으로 가기</Link>
          </section>
        ) : (
          <>
            <p className="service-footnote healthkit-source-note">
              웹 데모는 HealthKit 어댑터와 동일한 깨딱 내부 데이터
              계약에 샘플을 넣어 분석해요. iOS 정식 버전에서는 Apple 건강
              권한 후 HealthKit 수면·활동 데이터로 전환됩니다.
            </p>
            <section className="sleep-hero-card">
              <p>지난밤 수면</p>
              <strong>{hours}시간 {minutes ? `${minutes}분` : ""}</strong>
              <span>{store.sleepMinutes < 390 ? "평소보다 짧아 오늘은 예비 알람을 유지해요." : "충분한 수면이에요. 평소 계획을 유지해요."}</span>
            </section>

            <section className="sleep-chart-card">
              <div className="service-row"><h2>주간 수면 시간</h2><span>{averageHours}시간 {averageMinutes}분 평균</span></div>
              <div className="sleep-bars" aria-label="최근 7일 수면 시간 그래프">
                {SAMPLE_OFFSETS.map((offset, index) => {
                  const value = store.sleepMinutes + offset;
                  return <div key={DAYS[index]}><span style={{ height: `${Math.max(32, Math.min(100, (value / 510) * 100))}%` }} title={`${Math.floor(value / 60)}시간 ${value % 60}분`} /><small>{DAYS[index]}</small></div>;
                })}
              </div>
            </section>

            <section className="sleep-insight-list">
              <div><span aria-hidden="true">◷</span><p><strong>기상 규칙성 82%</strong><small>요일별 평균 차이가 24분이에요.</small></p></div>
              <div><span aria-hidden="true">✓</span><p><strong>첫 알람 성공 5일</strong><small>최근 7일 중 5일은 추가 알람 없이 일어났어요.</small></p></div>
              <div><span aria-hidden="true">AI</span><p><strong>다음 계획에 자동 반영</strong><small>수면이 6시간 30분보다 짧으면 예비 알람을 추가해요.</small></p></div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
