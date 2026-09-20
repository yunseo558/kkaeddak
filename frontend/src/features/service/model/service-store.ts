"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ActiveWakePlan } from "@/features/current-flow/model/current-flow-store";
import type { components } from "@kkaeddak/api-client";
import type { DailyOutcome } from "./service-policy";

export type CalendarEntry = components["schemas"]["ScheduleEventInput"];
export type ScheduleTypeRule = components["schemas"]["ScheduleTypeRule"];
export type ScheduleClassification =
  components["schemas"]["ScheduleClassificationResponse"];
export const DEFAULT_SCHEDULE_TYPES: ScheduleTypeRule[] = [
  { code: "CLASS", label: "수업", wakeLeadMin: 60, isFallback: false },
  { code: "WORK", label: "출근·업무", wakeLeadMin: 90, isFallback: false },
  {
    code: "IMPORTANT",
    label: "시험·면접",
    wakeLeadMin: 120,
    isFallback: false,
  },
  {
    code: "APPOINTMENT",
    label: "약속·예약",
    wakeLeadMin: 60,
    isFallback: false,
  },
  { code: "EXERCISE", label: "운동", wakeLeadMin: 45, isFallback: false },
  { code: "OTHER", label: "기타", wakeLeadMin: 60, isFallback: true },
];
export type ServicePlan = ActiveWakePlan & {
  revision: number;
  status: string;
  automatic: boolean;
  eventTitle: string;
  eventAt: string;
  scheduleTypeLabel: string;
  wakeLeadMinutes: number;
  sleepMinutes: number;
  reason: string;
  explanationSource: ScheduleClassification["source"];
  fatigueScore: number;
  fatigueLevel: "LOW" | "MEDIUM" | "HIGH";
  aiConfidence: number;
};
type ServiceState = {
  enrolledAt: string | null;
  calendarConnected: boolean;
  healthConnected: boolean;
  virtualNow: string | null;
  automationTime: string;
  earlyAutomationEnabled: boolean;
  preferredAlarmCount: number;
  alarmIntervalMinutes: number;
  keepSafetyAlarm: boolean;
  scheduleTypes: ScheduleTypeRule[];
  classifications: Record<string, ScheduleClassification>;
  events: CalendarEntry[];
  records: DailyOutcome[];
  plan: ServicePlan | null;
  sleepMinutes: number;
  lastAutomationSlot: string | null;
  lastTriggeredAlarmPlanId: string | null;
  preview: boolean;
  alarmStage: "idle" | "ringing" | "confirm";
  message: string | null;
  busy: boolean;
  set: (patch: Partial<Omit<ServiceState, "set" | "reset">>) => void;
  reset: () => void;
};
const initial = {
  enrolledAt: null,
  calendarConnected: false,
  healthConnected: false,
  virtualNow: null,
  automationTime: "21:00",
  earlyAutomationEnabled: false,
  preferredAlarmCount: 2,
  alarmIntervalMinutes: 10,
  keepSafetyAlarm: true,
  scheduleTypes: DEFAULT_SCHEDULE_TYPES,
  classifications: {},
  events: [],
  records: [],
  plan: null,
  sleepMinutes: 420,
  lastAutomationSlot: null,
  lastTriggeredAlarmPlanId: null,
  preview: false,
  alarmStage: "idle",
  message: null,
  busy: false,
} satisfies Partial<ServiceState>;
export const useServiceStore = create<ServiceState>()(
  persist(
    (set) => ({
      ...initial,
      set: (patch) => set(patch),
      reset: () => set(initial),
    }),
    {
      name: "kkaeddak-service",
      partialize: ({
        enrolledAt,
        calendarConnected,
        healthConnected,
        virtualNow,
        automationTime,
        earlyAutomationEnabled,
        preferredAlarmCount,
        alarmIntervalMinutes,
        keepSafetyAlarm,
        scheduleTypes,
        classifications,
        events,
        records,
        plan,
        sleepMinutes,
        lastAutomationSlot,
        lastTriggeredAlarmPlanId,
        preview,
      }) => ({
        enrolledAt,
        calendarConnected,
        healthConnected,
        virtualNow,
        automationTime,
        earlyAutomationEnabled,
        preferredAlarmCount,
        alarmIntervalMinutes,
        keepSafetyAlarm,
        scheduleTypes,
        classifications,
        events,
        records,
        plan,
        sleepMinutes,
        lastAutomationSlot,
        lastTriggeredAlarmPlanId,
        preview,
      }),
    },
  ),
);
