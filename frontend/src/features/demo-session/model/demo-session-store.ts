"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { ScenarioId } from "./scenarios";

type DemoSessionState = {
  expiresAt: string | null;
  mode: "local" | "server" | null;
  scenarioId: ScenarioId | null;
  sessionId: string | null;
  clear: () => void;
  startLocal: (scenarioId: ScenarioId) => void;
  startServer: (input: {
    expiresAt: string;
    scenarioId: ScenarioId;
    sessionId: string;
  }) => void;
};

type DemoSessionIdentity = Pick<
  DemoSessionState,
  "expiresAt" | "mode" | "sessionId"
>;

export function isDemoSessionExpired(
  session: DemoSessionIdentity,
  now = Date.now(),
) {
  if (session.mode !== "server") return false;
  const expiresAt = session.expiresAt
    ? Date.parse(session.expiresAt)
    : Number.NaN;
  return !session.sessionId || !Number.isFinite(expiresAt) || expiresAt <= now;
}

const initialState = {
  expiresAt: null,
  mode: null,
  scenarioId: null,
  sessionId: null,
} as const;

export const useDemoSessionStore = create<DemoSessionState>()(
  persist(
    (set) => ({
      ...initialState,
      clear: () => set(initialState),
      startLocal: (scenarioId) =>
        set({ ...initialState, mode: "local", scenarioId }),
      startServer: ({ expiresAt, scenarioId, sessionId }) =>
        set({ expiresAt, mode: "server", scenarioId, sessionId }),
    }),
    {
      name: "kkaeddak-demo-session",
      storage: createJSONStorage(() => window.localStorage),
    },
  ),
);
