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
  return Array.from({ length: 30 }, (_, index) => {
    const date = addDays(today, index + 1);
    return {
      clientId: index === 0 ? "seed-regular-class" : `calendar-class-${date}`,
      startsAt: atTime(date, "11:00"),
      endsAt: atTime(date, "12:30"),
      category: "CLASS",
      importance: "NORMAL",
      locationMode: "ONSITE",
      displayTitle: "전공 수업",
    };
  });
}
