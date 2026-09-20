import type { HealthInputRecord } from "@/lib/storage/local-data";
import type { CalendarEntry } from "../model/service-store";
import { addDays, atTime } from "../model/service-policy";

export type HealthKitSleepValue =
  | "HKCategoryValueSleepAnalysisInBed"
  | "HKCategoryValueSleepAnalysisAwake"
  | "HKCategoryValueSleepAnalysisAsleepCore"
  | "HKCategoryValueSleepAnalysisAsleepDeep"
  | "HKCategoryValueSleepAnalysisAsleepREM";

export type HealthKitMenstrualValue =
  | "HKCategoryValueMenstrualFlowLight"
  | "HKCategoryValueMenstrualFlowMedium"
  | "HKCategoryValueMenstrualFlowHeavy";

type HealthKitSourceRevision = {
  source: { name: string; bundleIdentifier: string };
  version: string;
  productType: string;
};

export type HealthKitCategorySample = {
  uuid: string;
  sampleType: "HKCategorySample";
  typeIdentifier:
    | "HKCategoryTypeIdentifierSleepAnalysis"
    | "HKCategoryTypeIdentifierMenstrualFlow";
  startDate: string;
  endDate: string;
  value: HealthKitSleepValue | HealthKitMenstrualValue;
  sourceRevision: HealthKitSourceRevision;
};

export type HealthKitQuantitySample = {
  uuid: string;
  sampleType: "HKQuantitySample";
  typeIdentifier:
    | "HKQuantityTypeIdentifierStepCount"
    | "HKQuantityTypeIdentifierActiveEnergyBurned"
    | "HKQuantityTypeIdentifierAppleExerciseTime";
  startDate: string;
  endDate: string;
  quantity: { unit: "count" | "kcal" | "min"; value: number };
  sourceRevision: HealthKitSourceRevision;
};

export type HealthKitSnapshot = {
  categorySamples: HealthKitCategorySample[];
  quantitySamples: HealthKitQuantitySample[];
};

const demoSourceRevision: HealthKitSourceRevision = {
  source: {
    name: "Apple Watch",
    bundleIdentifier: "com.apple.health",
  },
  version: "11.0",
  productType: "Watch7,4",
};

export function createHealthKitMockSnapshot(input: {
  now: string;
  sleepMinutes: number;
}): HealthKitSnapshot {
  const end = Date.parse(input.now) - 30 * 60_000;
  const awakeMinutes = Math.max(8, Math.round(input.sleepMinutes * 0.04));
  const coreMinutes = Math.round(input.sleepMinutes * 0.52);
  const deepMinutes = Math.round(input.sleepMinutes * 0.2);
  const stages: Array<[HealthKitSleepValue, number]> = [
    ["HKCategoryValueSleepAnalysisAsleepCore", coreMinutes],
    ["HKCategoryValueSleepAnalysisAsleepDeep", deepMinutes],
    ["HKCategoryValueSleepAnalysisAsleepREM", input.sleepMinutes - coreMinutes - deepMinutes],
    ["HKCategoryValueSleepAnalysisAwake", awakeMinutes],
  ];
  let cursor = end - (input.sleepMinutes + awakeMinutes) * 60_000;
  const sleepSamples: HealthKitCategorySample[] = stages.map(([value, minutes], index) => {
    const startDate = new Date(cursor).toISOString();
    cursor += minutes * 60_000;
    return {
      uuid: `healthkit-sleep-${index + 1}`,
      sampleType: "HKCategorySample" as const,
      typeIdentifier: "HKCategoryTypeIdentifierSleepAnalysis" as const,
      startDate,
      endDate: new Date(cursor).toISOString(),
      value,
      sourceRevision: demoSourceRevision,
    };
  });
  const cycleStart = end - 17 * 86_400_000;
  const menstrualSample: HealthKitCategorySample = {
    uuid: "healthkit-menstrual-1",
    sampleType: "HKCategorySample",
    typeIdentifier: "HKCategoryTypeIdentifierMenstrualFlow",
    startDate: new Date(cycleStart).toISOString(),
    endDate: new Date(cycleStart + 86_400_000).toISOString(),
    value: "HKCategoryValueMenstrualFlowMedium",
    sourceRevision: demoSourceRevision,
  };
  const dayStart = new Date(end - 12 * 3600_000).toISOString();
  const dayEnd = new Date(end).toISOString();
  const quantitySamples: HealthKitQuantitySample[] = [
    {
      uuid: "healthkit-steps-1",
      sampleType: "HKQuantitySample",
      typeIdentifier: "HKQuantityTypeIdentifierStepCount",
      startDate: dayStart,
      endDate: dayEnd,
      quantity: { unit: "count", value: input.sleepMinutes < 360 ? 12_480 : 7_320 },
      sourceRevision: demoSourceRevision,
    },
    {
      uuid: "healthkit-energy-1",
      sampleType: "HKQuantitySample",
      typeIdentifier: "HKQuantityTypeIdentifierActiveEnergyBurned",
      startDate: dayStart,
      endDate: dayEnd,
      quantity: { unit: "kcal", value: input.sleepMinutes < 360 ? 690 : 410 },
      sourceRevision: demoSourceRevision,
    },
    {
      uuid: "healthkit-exercise-1",
      sampleType: "HKQuantitySample",
      typeIdentifier: "HKQuantityTypeIdentifierAppleExerciseTime",
      startDate: dayStart,
      endDate: dayEnd,
      quantity: { unit: "min", value: input.sleepMinutes < 360 ? 64 : 28 },
      sourceRevision: demoSourceRevision,
    },
  ];
  return { categorySamples: [...sleepSamples, menstrualSample], quantitySamples };
}

export function normalizeHealthKitSnapshot(
  snapshot: HealthKitSnapshot,
  input: { now: string; recentFirstAlarmSucceeded: boolean },
): HealthInputRecord {
  const sleepValues = new Set<HealthKitSleepValue>([
    "HKCategoryValueSleepAnalysisAsleepCore",
    "HKCategoryValueSleepAnalysisAsleepDeep",
    "HKCategoryValueSleepAnalysisAsleepREM",
  ]);
  const sleepDurationMinutes = Math.round(
    snapshot.categorySamples
      .filter(
        (sample) =>
          sample.typeIdentifier === "HKCategoryTypeIdentifierSleepAnalysis" &&
          sleepValues.has(sample.value as HealthKitSleepValue),
      )
      .reduce(
        (total, sample) =>
          total + (Date.parse(sample.endDate) - Date.parse(sample.startDate)) / 60_000,
        0,
      ),
  );
  const quantity = (identifier: HealthKitQuantitySample["typeIdentifier"]) =>
    snapshot.quantitySamples
      .filter((sample) => sample.typeIdentifier === identifier)
      .reduce((total, sample) => total + sample.quantity.value, 0);
  const steps = quantity("HKQuantityTypeIdentifierStepCount");
  const exercise = quantity("HKQuantityTypeIdentifierAppleExerciseTime");
  const activeEnergy = quantity("HKQuantityTypeIdentifierActiveEnergyBurned");
  const latestMenstrualSample = snapshot.categorySamples
    .filter(
      (sample) =>
        sample.typeIdentifier === "HKCategoryTypeIdentifierMenstrualFlow",
    )
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  const menstrualCycleDay = latestMenstrualSample
    ? Math.max(
        1,
        Math.floor(
          (Date.parse(input.now) - Date.parse(latestMenstrualSample.startDate)) /
            86_400_000,
        ) + 1,
      )
    : undefined;
  const menstrualCyclePhase = !menstrualCycleDay
    ? undefined
    : menstrualCycleDay <= 5
      ? "menstrual"
      : menstrualCycleDay <= 13
        ? "follicular"
        : menstrualCycleDay <= 16
          ? "ovulation"
          : "luteal";
  const activityLevel =
    steps >= 10_000 || exercise >= 60 || activeEnergy >= 600
      ? "high"
      : steps < 3_000 && exercise < 15
        ? "low"
        : "usual";
  return {
    id: "service-health",
    source: "sample",
    sleepDurationMinutes,
    stepCount: Math.round(steps),
    activeEnergyKcal: Math.round(activeEnergy),
    exerciseMinutes: Math.round(exercise),
    menstrualCycleDay,
    menstrualCyclePhase,
    activityLevel,
    conditionLevel:
      sleepDurationMinutes < 360
        ? "low"
        : sleepDurationMinutes >= 450
          ? "high"
          : "usual",
    recentFirstAlarmSucceeded: input.recentFirstAlarmSucceeded,
    updatedAt: input.now,
  };
}

// The iOS bridge and this web demo both terminate at HealthInputRecord. The
// web path deliberately begins with a serializable projection of HKSample so
// the same normalization boundary can be exercised without HealthKit on web.
export interface HealthDataSource {
  readonly sourceKind: "HEALTHKIT" | "HEALTHKIT_SAMPLE";
  read(input: {
    now: string;
    minutes: number;
    recentFirstAlarmSucceeded: boolean;
  }): Promise<HealthInputRecord>;
}
export const healthKitDemoSource: HealthDataSource = {
  sourceKind: "HEALTHKIT_SAMPLE",
  async read({ now, minutes, recentFirstAlarmSucceeded }) {
    return normalizeHealthKitSnapshot(
      createHealthKitMockSnapshot({ now, sleepMinutes: minutes }),
      { now, recentFirstAlarmSucceeded },
    );
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
  const weekly: Record<number, { title: string; time: string }> = {
    0: { title: "한강 아침 러닝", time: "09:00" },
    1: { title: "AI 응용 전공 수업", time: "11:00" },
    2: { title: "팀 프로젝트 회의", time: "10:00" },
    3: { title: "자료구조 전공 수업", time: "11:00" },
    4: { title: "아침 PT", time: "08:00" },
    5: { title: "디자인 교양 수업", time: "13:00" },
    6: { title: "친구와 점심 약속", time: "11:30" },
  };
  const events: CalendarEntry[] = [];
  let date = addDays(today, 1);
  while (date <= endDate) {
    const selected =
      special[date] ?? weekly[new Date(`${date}T12:00:00Z`).getUTCDay()];
    const startsAt = atTime(date, selected.time);
    events.push({
      clientId:
        events.length === 0
          ? "seed-regular-class"
          : `mock-calendar-${date}`,
      startsAt,
      endsAt: new Date(Date.parse(startsAt) + 90 * 60000).toISOString(),
      category: "OTHER",
      importance: selected.importance ?? "NORMAL",
      locationMode: "ONSITE",
      displayTitle: selected.title,
    });
    date = addDays(date, 1);
  }
  return events;
}
