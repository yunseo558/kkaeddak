import type { components } from "@kkaeddak/api-client";

export const AUTOMATION_POLICY = {
  minimumDays: 14,
  minimumRecords: 10,
  recentWindow: 5,
  minimumRecentSuccesses: 4,
} as const;
export type DailyOutcome = {
  date: string;
  outcome: components["schemas"]["WakeOutcome"];
  source: "observed" | "preview";
  alarmStepsUsed?: number;
};
export const localDate = (iso: string) =>
  new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
export const atTime = (date: string, time: string) =>
  new Date(`${date}T${time}:00+09:00`).toISOString();
export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400_000)
    .toISOString()
    .slice(0, 10);
export const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export function mergeAlarmOffsetsWithSafety(
  modelOffsets: number[],
  localSafetyOffsets: number[],
  enforceSafety: boolean,
) {
  const normalizedModel = [...new Set(modelOffsets)]
    .filter((offset) => Number.isInteger(offset) && offset >= 0 && offset <= 90)
    .sort((a, b) => a - b)
    .slice(0, 4);
  const safeModel = normalizedModel[0] === 0 ? normalizedModel : [0];
  if (!enforceSafety) return safeModel;

  const normalizedSafety = [...new Set(localSafetyOffsets)]
    .filter((offset) => Number.isInteger(offset) && offset >= 0 && offset <= 90)
    .sort((a, b) => a - b)
    .slice(0, 4);
  const requiredCount = Math.max(1, normalizedSafety.length);
  const requiredSpan = Math.max(0, normalizedSafety.at(-1) ?? 0);
  const modelSpan = safeModel.at(-1) ?? 0;
  if (safeModel.length >= requiredCount && modelSpan >= requiredSpan)
    return safeModel;

  const count = Math.min(4, Math.max(requiredCount, safeModel.length));
  const span = Math.min(90, Math.max(requiredSpan, modelSpan));
  if (count === 1) return [0];
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? span : Math.round((span * index) / (count - 1)),
  );
}

export function automationEligibility(input: {
  enrolledAt: string;
  now: string;
  consent: boolean;
  earlyOverride?: boolean;
  records: DailyOutcome[];
  importance: string;
  requiresApproval: boolean;
}) {
  const elapsedDays = Math.max(
    0,
    Math.floor(
      (Date.parse(`${localDate(input.now)}T00:00:00Z`) -
        Date.parse(`${localDate(input.enrolledAt)}T00:00:00Z`)) /
        86400_000,
    ),
  );
  const distinct = [
    ...new Map(
      input.records
        .filter(
          (r) =>
            r.date <= localDate(input.now) &&
            r.date >= localDate(input.enrolledAt),
        )
        .map((r) => [r.date, r]),
    ).values(),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const recentSuccesses = distinct
    .slice(-AUTOMATION_POLICY.recentWindow)
    .filter((r) => r.outcome === "CONFIRMED_ON_TIME").length;
  const ready =
    elapsedDays >= AUTOMATION_POLICY.minimumDays &&
    distinct.length >= AUTOMATION_POLICY.minimumRecords &&
    recentSuccesses >= AUTOMATION_POLICY.minimumRecentSuccesses;
  return {
    elapsedDays,
    count: distinct.length,
    recentSuccesses,
    ready,
    automatic:
      input.consent &&
      (ready || input.earlyOverride === true) &&
      input.importance === "NORMAL" &&
      !input.requiresApproval,
  };
}
