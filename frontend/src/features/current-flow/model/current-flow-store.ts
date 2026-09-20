"use client";

import type { components } from "@kkaeddak/api-client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type WakePlanCreate = components["schemas"]["WakePlanCreate"];
type WakeOutcome = components["schemas"]["WakeOutcome"];

export type ActiveWakePlan = WakePlanCreate & {
  id: string;
};

export type WakeResult = {
  alarmStepsUsed: number;
  completedAt: string;
  confirmedAt: string | null;
  outcome: WakeOutcome;
  planId: string;
  userCorrection: boolean;
};

export type AutomationMode = "automatic" | "suggest";

export type OnboardingDraft = {
  usualWakeTime: string;
  recentFirstAlarmSucceeded: boolean;
  preferredAlarmCount: number;
  keepSafetyAlarm: boolean;
  automationMode: AutomationMode;
  aiPersonalizationConsent: boolean;
  outcomeSync: boolean;
};

const initialDraft: OnboardingDraft = {
  usualWakeTime: "07:00",
  recentFirstAlarmSucceeded: true,
  preferredAlarmCount: 2,
  keepSafetyAlarm: true,
  automationMode: "suggest",
  aiPersonalizationConsent: false,
  outcomeSync: false,
};

type CurrentFlowState = {
  activeWakePlan: ActiveWakePlan | null;
  demoAuthenticated: boolean;
  onboardingCompleted: boolean;
  onboardingDraft: OnboardingDraft;
  onboardingStep: number;
  editingPlanId: string | null;
  wakeResult: WakeResult | null;
  reset: () => void;
  setActiveWakePlan: (plan: ActiveWakePlan | null) => void;
  setDemoAuthenticated: (authenticated: boolean) => void;
  setOnboardingCompleted: (completed: boolean) => void;
  setOnboardingDraft: (draft: OnboardingDraft) => void;
  setOnboardingStep: (step: number) => void;
  setEditingPlanId: (planId: string | null) => void;
  setWakeResult: (result: WakeResult | null) => void;
};

const initialState = {
  activeWakePlan: null,
  demoAuthenticated: false,
  onboardingCompleted: false,
  onboardingDraft: initialDraft,
  onboardingStep: 0,
  editingPlanId: null,
  wakeResult: null,
} as const;

export const useCurrentFlowStore = create<CurrentFlowState>()(
  persist(
    (set) => ({
      ...initialState,
      reset: () => set(initialState),
      setActiveWakePlan: (activeWakePlan) => set({ activeWakePlan }),
      setDemoAuthenticated: (demoAuthenticated) =>
        set({ demoAuthenticated }),
      setOnboardingCompleted: (onboardingCompleted) =>
        set({ onboardingCompleted }),
      setOnboardingDraft: (onboardingDraft) => set({ onboardingDraft }),
      setOnboardingStep: (onboardingStep) => set({ onboardingStep }),
      setEditingPlanId: (editingPlanId) => set({ editingPlanId }),
      setWakeResult: (wakeResult) => set({ wakeResult }),
    }),
    {
      name: "kkaeddak-current-flow",
      version: 2,
      migrate: (persistedState, version) => {
        const state = persistedState as CurrentFlowState;
        return {
          ...state,
          onboardingDraft: {
            ...state.onboardingDraft,
            ...(version < 1 ? { automationMode: "suggest" as const } : {}),
            ...(version < 2 ? { aiPersonalizationConsent: false } : {}),
          },
        };
      },
      storage: createJSONStorage(() => window.localStorage),
      partialize: ({
        activeWakePlan,
        demoAuthenticated,
        editingPlanId,
        onboardingCompleted,
        onboardingDraft,
        onboardingStep,
        wakeResult,
      }) => ({
        activeWakePlan,
        demoAuthenticated,
        editingPlanId,
        onboardingCompleted,
        onboardingDraft,
        onboardingStep,
        wakeResult,
      }),
    },
  ),
);
