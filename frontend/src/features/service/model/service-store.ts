"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ActiveWakePlan } from "@/features/current-flow/model/current-flow-store";
import type { components } from "@kkaeddak/api-client";
import type { DailyOutcome } from "./service-policy";

export type CalendarEntry = components["schemas"]["ScheduleEventInput"];
export type ServicePlan = ActiveWakePlan & {
  revision: number;
  status: string;
  automatic: boolean;
  eventTitle: string;
  eventAt: string;
  routineMinutes: number;
  sleepMinutes: number;
  reason: string;
};
type ServiceState = {
  enrolledAt: string | null;
  calendarConnected: boolean;
  healthConnected: boolean;
  virtualNow: string | null;
  automationTime: string;
  commuteMinutes: number;
  events: CalendarEntry[];
  records: DailyOutcome[];
  plan: ServicePlan | null;
  sleepMinutes: number;
  lastAutomationSlot: string | null;
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
  commuteMinutes: 30,
  events: [],
  records: [],
  plan: null,
  sleepMinutes: 420,
  lastAutomationSlot: null,
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
        commuteMinutes,
        events,
        records,
        plan,
        sleepMinutes,
        lastAutomationSlot,
        preview,
      }) => ({
        enrolledAt,
        calendarConnected,
        healthConnected,
        virtualNow,
        automationTime,
        commuteMinutes,
        events,
        records,
        plan,
        sleepMinutes,
        lastAutomationSlot,
        preview,
      }),
    },
  ),
);
