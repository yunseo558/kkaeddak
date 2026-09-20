"use client";
import { AppShell } from "@/components/layout/app-shell";
import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import { useServiceStore } from "../model/service-store";
import { SetupGuidanceScene } from "./home-alarm-scene";

export function ServiceHistory() {
  const store = useServiceStore();
  const completed = useCurrentFlowStore((state) => state.onboardingCompleted);
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
  const records = [...store.records]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);
  const successes = records.filter(
    (r) => r.outcome === "CONFIRMED_ON_TIME",
  ).length;
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
            <small className="text-lg"> / {records.length}일</small>
          </p>
          <p className="service-muted">
            기상 결과에 맞춰 다음 알람을 조정해요.
          </p>
        </section>
        {records.length ? (
          <div className="calendar-list">
            {records.map((record) => (
              <div className="calendar-event" key={record.date}>
                <span className="calendar-date">{record.date.slice(-2)}</span>
                <span>
                  <strong>
                    {record.outcome === "CONFIRMED_ON_TIME"
                      ? "제시간에 일어났어요"
                      : record.outcome === "CONFIRMED_LATE"
                        ? "늦게 일어났어요"
                        : "일어나지 못했어요"}
                  </strong>
                  <small>
                    {record.date}
                    {record.source === "preview" ? " · 미리보기 기록" : ""}
                  </small>
                </span>
              </div>
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
