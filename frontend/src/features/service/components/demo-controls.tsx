"use client";

import { useRouter } from "next/navigation";
import { useServiceStore } from "../model/service-store";
import {
  advanceAutomation,
  dismissCurrentAlarm,
  serviceAction,
  triggerDemoAlarmStep,
} from "../lib/service-actions";
import { enableWebAlarmNotifications } from "../lib/alarm-audio";
import { clockTime, localDate } from "../model/service-policy";

export function DemoControls() {
  const store = useServiceStore();
  const router = useRouter();
  if (!store.calendarConnected) return null;
  const canRing =
    !!store.plan && ["APPROVED", "EDITED"].includes(store.plan.status);
  return (
    <aside className="demo-console" aria-label="데모 조작부">
      <span className="console-label">PRESENTATION CONTROLS</span>
      <h2>시간을 건너뛰어 확인하기</h2>
      <p>
        캘린더·Apple 건강은 샘플 데이터입니다.
        <br />
        계획 저장과 결과 학습은 실제로 실행됩니다.
      </p>
      <button
        disabled={store.busy || !canRing || store.alarmStage !== "idle"}
        onClick={() =>
          void serviceAction(async () => {
            await enableWebAlarmNotifications();
            await triggerDemoAlarmStep();
            router.push("/");
          })
        }
      >
        알람 지금 울리기
      </button>
      {store.alarmStage === "ringing" && (
        <button
          onClick={() => void serviceAction(dismissCurrentAlarm)}
        >
          소리 끄기
        </button>
      )}
      <button
        disabled={store.busy || store.alarmStage !== "idle"}
        onClick={() =>
          void serviceAction(async () => {
            await advanceAutomation();
            router.push("/");
          })
        }
      >
        다음 자동화 시각으로 · {store.automationTime}
      </button>
      <button
        disabled={store.busy || store.alarmStage !== "idle"}
        onClick={() =>
          void serviceAction(async () => {
            await advanceAutomation(true);
            router.push("/");
          })
        }
      >
        14일 학습 후 자동 적용 확인
      </button>
      <label>
        건강 샘플
        <select
          aria-label="건강 샘플"
          value={store.sleepMinutes}
          disabled={store.busy}
          onChange={(e) => store.set({ sleepMinutes: Number(e.target.value) })}
        >
          <option value={420}>평소 컨디션 · 수면 7시간</option>
          <option value={435}>회복 양호 · 수면 7시간 15분</option>
          <option value={300}>피로 높음 · 수면 5시간 · 활동 많음</option>
        </select>
      </label>
      <p>
        건강 샘플은 수면·활동·컨디션을 다음 자동화 실행에 반영합니다. 알람 재생에는 기기의 음량이
        필요합니다.
      </p>
      {store.virtualNow && (
        <p className="console-clock">
          가상 시각 · {localDate(store.virtualNow)}{" "}
          {clockTime(store.virtualNow)}
        </p>
      )}
      {store.preview && (
        <p>학습 미리보기: 샘플 기상 기록이 포함되어 있습니다.</p>
      )}
      {store.message && <p role="alert">{store.message}</p>}
    </aside>
  );
}
