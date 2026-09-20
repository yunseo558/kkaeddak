import type { WakePlanReportContext } from "../api/wake-report-api";

type ReportContextInput = {
  schedule: WakePlanReportContext["schedule"];
  healthSummary: WakePlanReportContext["healthSummary"];
  historySignals: WakePlanReportContext["historySignals"];
  alarmPreferences: WakePlanReportContext["alarmPreferences"];
  personalization: WakePlanReportContext["personalization"];
};

export function createWakePlanReportContext(
  input: ReportContextInput,
): WakePlanReportContext {
  return {
    schedule: input.schedule,
    healthSummary: input.healthSummary ?? null,
    historySignals: input.historySignals,
    alarmPreferences: input.alarmPreferences,
    personalization: input.personalization,
    policyVersion: "wake-policy-1",
  };
}
