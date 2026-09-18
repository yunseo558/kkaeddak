import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { useDemoSessionStore } from "@/features/demo-session/model/demo-session-store";

import { PreparationPlanner } from "./preparation-planner";

beforeEach(() => {
  window.localStorage.clear();
  useDemoSessionStore.getState().clear();
  useDemoSessionStore.getState().startLocal("exam-morning");
});

describe("PreparationPlanner", () => {
  it("applies only completed tasks to the adjusted wake deadline", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PreparationPlanner />
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", {
      name: "오늘 밤 미리 끝낼 수 있는 일",
    });
    const securedTime = screen.getByText("확보한 시간").parentElement;
    expect(securedTime).toHaveTextContent("0분");

    await user.click(
      screen.getByRole("checkbox", { name: /샤워 미리 하기/ }),
    );

    await waitFor(() => expect(securedTime).toHaveTextContent("20분"));
  });
});
