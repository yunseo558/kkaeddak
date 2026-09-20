"use client";

import { startAlarmSound } from "../lib/alarm-audio";
import { useServiceStore } from "../model/service-store";

export function AlarmSoundButton() {
  return <button type="button" className="service-secondary" onClick={() => {
    void startAlarmSound().catch(() => useServiceStore.getState().set({
      message: "소리를 재생하지 못했어요. 브라우저의 소리 권한을 확인해 주세요.",
    }));
  }}>알람 소리 재생</button>;
}
