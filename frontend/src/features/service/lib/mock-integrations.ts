import type { HealthInputRecord } from "@/lib/storage/local-data";
import type { CalendarEntry } from "../model/service-store";
import { addDays, atTime } from "../model/service-policy";

// External data is the only mocked boundary. This is not a HealthKit connection.
// A native iOS adapter can implement the same read method after HealthKit consent.
export interface SleepDataSource {
  read(input: {
    now: string;
    minutes: number;
    recentFirstAlarmSucceeded: boolean;
  }): Promise<HealthInputRecord>;
}
export const mockSleepSource: SleepDataSource = {
  async read({ now, minutes, recentFirstAlarmSucceeded }) {
    return {
      id: "service-health",
      source: "sample",
      sleepDurationMinutes: minutes,
      activityLevel: minutes < 360 ? "high" : "usual",
      conditionLevel: minutes < 360 ? "low" : "usual",
      recentFirstAlarmSucceeded,
      updatedAt: now,
    };
  },
};

export function createMockCalendar(today: string): CalendarEntry[] {
  const endDate = "2026-10-30";
  const special: Record<
    string,
    { title: string; time: string; importance?: "IMPORTANT" }
  > = {
    "2026-09-25": {
      title: "교내 창업 경진대회 발표",
      time: "09:30",
      importance: "IMPORTANT",
    },
    "2026-10-02": { title: "치과 예약", time: "10:00" },
    "2026-10-07": {
      title: "자료구조 중간고사",
      time: "09:00",
      importance: "IMPORTANT",
    },
    "2026-10-16": {
      title: "카카오 인턴 1차 면접",
      time: "10:30",
      importance: "IMPORTANT",
    },
    "2026-10-24": { title: "민지와 브런치", time: "11:30" },
    "2026-10-30": {
      title: "AI 챔피언십 최종 발표",
      time: "09:30",
      importance: "IMPORTANT",
    },
  };
  const weekly: Partial<Record<number, { title: string; time: string }>> = {
    1: { title: "AI 응용 전공 수업", time: "11:00" },
    2: { title: "팀 프로젝트 회의", time: "10:00" },
    3: { title: "자료구조 전공 수업", time: "11:00" },
    4: { title: "아침 PT", time: "08:00" },
    5: { title: "디자인 교양 수업", time: "13:00" },
  };
  const events: CalendarEntry[] = [];
  let date = addDays(today, 1);
  while (date <= endDate) {
    const selected =
      special[date] ?? weekly[new Date(`${date}T12:00:00Z`).getUTCDay()];
    if (selected) {
      const startsAt = atTime(date, selected.time);
      events.push({
        clientId:
          date === "2026-09-21"
            ? "seed-regular-class"
            : `mock-calendar-${date}`,
        startsAt,
        endsAt: new Date(Date.parse(startsAt) + 90 * 60000).toISOString(),
        category: "OTHER",
        importance: selected.importance ?? "NORMAL",
        locationMode: "ONSITE",
        displayTitle: selected.title,
      });
    }
    date = addDays(date, 1);
  }
  return events;
}
