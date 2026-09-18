import "fake-indexeddb/auto";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useCurrentFlowStore,
  type ActiveWakePlan,
} from "@/features/current-flow/model/current-flow-store";
import { DemoStart } from "@/features/demo-session/components/demo-start";
import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";
import { WakeStatus } from "@/features/wake-flow/components/wake-status";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const plan: ActiveWakePlan = {
  id: "00000000-0000-4000-8000-000000000030",
  localDate: "2026-09-19",
  timezone: "Asia/Seoul",
  deadlineAt: "2026-09-18T23:00:00.000Z",
  firstAlarmAt: "2026-09-18T22:50:00.000Z",
  finalAlarmAt: "2026-09-18T23:00:00.000Z",
  importance: "IMPORTANT",
  protocolLevel: 2,
  steps: [
    { order: 1, offsetMin: 0, channel: "WATCH_HAPTIC" },
    { order: 2, offsetMin: 10, channel: "FINAL_SAFETY" },
  ],
  reasonCodes: ["IMPORTANT_EVENT"],
  requiresApproval: false,
  modelVersion: "local-wake-0.1",
};

async function expectNoAutomatedViolations(container: HTMLElement) {
  const result = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "best-practice"] },
    rules: {
      "color-contrast": { enabled: false },
    },
  });
  expect(
    result.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
}

beforeEach(() => {
  window.localStorage.clear();
  useCurrentFlowStore.getState().reset();
  useDemoSessionStore.getState().clear();
});

afterEach(cleanup);

describe("core flow accessibility", () => {
  it("has no automated WCAG violations on scenario selection", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <DemoStart />
      </QueryClientProvider>,
    );

    await screen.findByText("내일의 상황을 선택하세요");
    await expectNoAutomatedViolations(container);
  });

  it("has no automated WCAG violations on wake execution", async () => {
    useCurrentFlowStore.getState().setActiveWakePlan(plan);
    const { container } = render(<WakeStatus />);

    await screen.findByRole("button", { name: "알람 종료" });
    await expectNoAutomatedViolations(container);
  });
});
