"use client";

import { ClayIcon } from "@/components/brand/clay-icon";
import { AppShell } from "@/components/layout/app-shell";
import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import {
  createHealthKitMockSnapshot,
  normalizeHealthKitSnapshot,
} from "../lib/mock-integrations";
import { serviceNow } from "../lib/service-actions";
import { useServiceStore } from "../model/service-store";
import { SetupGuidanceScene } from "./home-alarm-scene";

const PHASE_LABEL = {
  menstrual: "월경기",
  follicular: "난포기",
  ovulation: "배란기",
  luteal: "황체기",
} as const;

function fatigueLabel(level: "LOW" | "MEDIUM" | "HIGH") {
  return level === "HIGH" ? "높음" : level === "MEDIUM" ? "보통" : "낮음";
}

export function ServiceSleep() {
  const store = useServiceStore();
  const completed = useCurrentFlowStore((state) => state.onboardingCompleted);
  const now = serviceNow();
  const health = normalizeHealthKitSnapshot(
    createHealthKitMockSnapshot({ now, sleepMinutes: store.sleepMinutes }),
    {
      now,
      recentFirstAlarmSucceeded:
        store.records.at(-1)?.outcome === "CONFIRMED_ON_TIME",
    },
  );
  const plan = store.plan;
  const fatigueLevel =
    plan?.fatigueLevel ??
    (store.sleepMinutes < 360
      ? "HIGH"
      : store.sleepMinutes < 420
        ? "MEDIUM"
        : "LOW");
  const fatigueScore =
    plan?.fatigueScore ??
    (fatigueLevel === "HIGH" ? 72 : fatigueLevel === "MEDIUM" ? 48 : 28);
  const alarmCount = plan?.steps.length ?? store.preferredAlarmCount;
  const hours = Math.floor((health.sleepDurationMinutes ?? 0) / 60);
  const minutes = (health.sleepDurationMinutes ?? 0) % 60;

  if (!completed || !store.healthConnected) {
    return (
      <AppShell currentStep="분석" homeScene>
        <div className="service-home health-screen">
          <header className="service-heading">
            <div>
              <p className="service-kicker">온디바이스 데이터</p>
              <h1>건강</h1>
            </div>
            <span className="service-tag">분석 전</span>
          </header>
          <SetupGuidanceScene
            description={
              completed
                ? "Apple 건강 샘플을 연결하면 수면·걸음·활동·주기 신호를 기기 안에서 요약해 기상 난이도를 계산할게요."
                : "기본 설정과 Apple 건강 연동을 마치면 오늘의 피로도와 내일 필요한 알람 개수를 보여드려요."
            }
            href={completed ? "/settings/connections" : "/onboarding"}
            label={completed ? "연동 설정하기" : "기본 설정하기"}
            title={
              completed
                ? "건강 데이터를 연결해 주세요"
                : "피로도 분석을 준비할게요"
            }
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell currentStep="분석" homeScene>
      <div className="service-home health-screen">
        <header className="service-heading">
          <div>
            <p className="service-kicker">Apple 건강 샘플</p>
            <h1>건강</h1>
          </div>
          <span className="service-tag">온디바이스 분석</span>
        </header>

        <section className="health-ai-card">
          <div className="service-row">
            <div>
              <p className="service-kicker">Gemini 기상 난이도</p>
              <h2>
                피로도 {fatigueLabel(fatigueLevel)} · {fatigueScore}점
              </h2>
            </div>
            <ClayIcon name="spark" size={42} />
          </div>
          <p>
            {plan?.explanationSource === "MODEL"
              ? "Gemini가"
              : "Gemini 연결 전 안전 모델이"} {" "}
            수면·걸음·활동·컨디션과 최근 기상 반응을 종합해 내일은 {" "}
            <strong>{alarmCount}개의 알람</strong>이 필요하다고 판단했어요.
          </p>
          <div className="health-decision-row">
            <span>피로도 {fatigueLabel(fatigueLevel)}</span>
            <span>알람 {alarmCount}개</span>
            <span>
              {plan?.explanationSource === "MODEL"
                ? "Gemini 개인화"
                : "안전 폴백"}
            </span>
          </div>
        </section>

        <section className="health-metric-grid" aria-label="Apple 건강 요약">
          <article>
            <span>수면</span>
            <strong>{hours}시간 {minutes ? `${minutes}분` : ""}</strong>
            <small>수면 단계 포함</small>
          </article>
          <article>
            <span>걸음 수</span>
            <strong>{(health.stepCount ?? 0).toLocaleString("ko-KR")}보</strong>
            <small>오늘 누적</small>
          </article>
          <article>
            <span>활동</span>
            <strong>{health.activeEnergyKcal ?? 0}kcal</strong>
            <small>운동 {health.exerciseMinutes ?? 0}분</small>
          </article>
          <article>
            <span>월경 주기</span>
            <strong>
              {health.menstrualCycleDay
                ? `${health.menstrualCycleDay}일차`
                : "기록 없음"}
            </strong>
            <small>
              {health.menstrualCyclePhase
                ? PHASE_LABEL[health.menstrualCyclePhase]
                : "선택 데이터"}
            </small>
          </article>
        </section>

        <section className="health-signal-list">
          <div className="service-row">
            <h2>판단에 쓴 건강 신호</h2>
            <span>Apple Watch</span>
          </div>
          <div>
            <ClayIcon name="moon" size={34} />
            <p>
              <strong>수면과 회복</strong>
              <small>
                {store.sleepMinutes < 390
                  ? "회복 시간이 짧아 예비 알람을 유지했어요."
                  : "수면 흐름이 안정적이에요."}
              </small>
            </p>
          </div>
          <div>
            <ClayIcon name="chart" size={34} />
            <p>
              <strong>활동량과 컨디션</strong>
              <small>
                {health.activityLevel === "high"
                  ? "활동량이 높아 피로 신호를 한 단계 높였어요."
                  : "평소 활동 범위로 판단했어요."}
              </small>
            </p>
          </div>
          <div>
            <ClayIcon name="health" size={34} />
            <p>
              <strong>주기 정보 보호</strong>
              <small>
                원본 주기 기록은 기기 안에 두고, 사용자가 허용한 요약
                신호만 기상 분석에 사용해요.
              </small>
            </p>
          </div>
        </section>

        <p className="service-footnote healthkit-source-note">
          이 화면은 HealthKit 구조를 따른 샘플입니다. 정식 iOS 버전에서는
          동일한 온디바이스 어댑터로 실제 Apple 건강 데이터를 요약하며, 의료
          진단에는 사용하지 않아요.
        </p>
      </div>
    </AppShell>
  );
}
