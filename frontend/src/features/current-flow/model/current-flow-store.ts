"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type AutomationMode = "automatic" | "suggest";

export type OnboardingDraft = {
  usualWakeTime: string;
  recentFirstAlarmSucceeded: boolean;
  washMinutes: number;
  breakfastMinutes: number;
  bagMinutes: number;
  preferredAlarmCount: number;
  keepSafetyAlarm: boolean;
  automationMode: AutomationMode;
  outcomeSync: boolean;
};

const initialDraft: OnboardingDraft = {
  usualWakeTime: "07:00",
  recentFirstAlarmSucceeded: true,
  washMinutes: 20,
  breakfastMinutes: 15,
  bagMinutes: 10,
  preferredAlarmCount: 2,
  keepSafetyAlarm: true,
  automationMode: "suggest",
  outcomeSync: false,
};

type CurrentFlowState = {
  onboardingCompleted: boolean;
  onboardingDraft: OnboardingDraft;
  onboardingStep: number;
  editingPlanId: string | null;
  reset: () => void;
  setOnboardingCompleted: (completed: boolean) => void;
  setOnboardingDraft: (draft: OnboardingDraft) => void;
  setOnboardingStep: (step: number) => void;
};

const initialState = {
  onboardingCompleted: false,
  onboardingDraft: initialDraft,
  onboardingStep: 0,
  editingPlanId: null,
} as const;

export const useCurrentFlowStore = create<CurrentFlowState>()(
  persist(
    (set) => ({
      ...initialState,
      reset: () => set(initialState),
      setOnboardingCompleted: (onboardingCompleted) =>
        set({ onboardingCompleted }),
      setOnboardingDraft: (onboardingDraft) => set({ onboardingDraft }),
      setOnboardingStep: (onboardingStep) => set({ onboardingStep }),
    }),
    {
      name: "kkaeddak-current-flow",
      storage: createJSONStorage(() => window.localStorage),
      partialize: ({
        editingPlanId,
        onboardingCompleted,
        onboardingDraft,
        onboardingStep,
      }) => ({
        editingPlanId,
        onboardingCompleted,
        onboardingDraft,
        onboardingStep,
      }),
    },
  ),
);
