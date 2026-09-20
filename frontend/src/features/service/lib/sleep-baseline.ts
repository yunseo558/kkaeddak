import type { HealthInputRecord } from "@/lib/storage/local-data";
import { addDays, atTime, localDate } from "../model/service-policy";
import {
  createHealthKitMockSnapshot,
  normalizeHealthKitSnapshot,
} from "./mock-integrations";

export const SLEEP_PATTERNS = {
  shorter: { label: "평소 6시간대", minutes: 360 },
  regular: { label: "평소 7시간대", minutes: 420 },
  longer: { label: "평소 8시간대", minutes: 480 },
} as const;
export type SleepPattern = keyof typeof SLEEP_PATTERNS;

// Generate reproducible sample nights, independently of today's selected sleep.
// The planner receives a summary calculated from these records, not the preset.
export function createSleepHistory(now: string, pattern: SleepPattern) {
  const center = (SLEEP_PATTERNS[pattern] ?? SLEEP_PATTERNS.regular).minutes;
  const weekdayOffsets = [35, -20, -10, 5, -15, 0, 25];
  return Array.from({ length: 14 }, (_, index) => {
    const date = addDays(localDate(now), -14 + index);
    const day = Math.floor(Date.parse(`${date}T12:00:00Z`) / 86_400_000);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const sleepMinutes = center + weekdayOffsets[weekday] + ((day % 3) - 1) * 5;
    const recordedAt = atTime(date, "09:00");
    return {
      ...normalizeHealthKitSnapshot(
        createHealthKitMockSnapshot({ now: recordedAt, sleepMinutes }),
        { now: recordedAt, recentFirstAlarmSucceeded: true },
      ),
      id: `service-sleep-${date}`,
    } satisfies HealthInputRecord;
  });
}

export function calculateSleepBaseline(records: HealthInputRecord[], now: string) {
  const today = localDate(now);
  const from = addDays(today, -14);
  const nights = new Map<string, number>();
  const ordered = [...records].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  for (const record of ordered) {
    if (!Number.isFinite(Date.parse(record.updatedAt))) continue;
    const date = localDate(record.updatedAt);
    const minutes = record.sleepDurationMinutes;
    if (
      date < from ||
      date >= today ||
      minutes === undefined ||
      !Number.isFinite(minutes) ||
      minutes < 180 ||
      minutes > 720
    ) continue;
    nights.set(date, minutes);
  }
  const values = [...nights.values()].sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return {
    nightCount: values.length,
    minutes:
      values.length < 7
        ? null
        : Math.round(
            values.length % 2
              ? values[middle]
              : (values[middle - 1] + values[middle]) / 2,
          ),
  };
}

export function demoSleepBaseline(now: string, pattern: SleepPattern) {
  return calculateSleepBaseline(createSleepHistory(now, pattern), now);
}

export function sleepDurationLabel(minutes: number) {
  return `${Math.floor(minutes / 60)}시간${minutes % 60 ? ` ${minutes % 60}분` : ""}`;
}
