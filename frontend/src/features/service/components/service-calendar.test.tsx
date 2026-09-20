import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import {
  useServiceStore,
  type CalendarEntry,
  type ScheduleClassification,
} from "../model/service-store";

import { ServiceCalendar } from "./service-calendar";

const actions = vi.hoisted(() => ({
  classifyScheduleTitle: vi.fn(),
  editCalendarEvent: vi.fn(async () => undefined),
  generateServicePlan: vi.fn(async () => undefined),
  serviceAction: vi.fn(async (action: () => Promise<void>) => {
    await action();
    return true;
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/calendar",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../lib/service-actions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/service-actions")>()),
  ...actions,
  serviceNow: () => "2026-09-20T00:00:00.000Z",
}));

const classification = (
  categoryCode: string,
): ScheduleClassification => ({
  categoryCode,
  confidence: 0.92,
  source: "MODEL",
});

const existingEvent: CalendarEntry = {
  clientId: "existing-event",
  displayTitle: "팀 회의",
  category: "WORK",
  importance: "NORMAL",
  locationMode: "ONSITE",
  startsAt: "2026-09-20T02:00:00.000Z",
  endsAt: "2026-09-20T03:30:00.000Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function renderCalendar(
  events: CalendarEntry[] = [],
  classifications: Record<string, ScheduleClassification> = {},
) {
  useServiceStore.getState().set({
    calendarConnected: true,
    classifications,
    events,
  });
  render(<ServiceCalendar />);
}

async function openNewEditor() {
  renderCalendar();
  const user = userEvent.setup();
  await user.click(
    screen.getAllByRole("button", { name: "일정 추가" })[0],
  );
  return user;
}

const titleInput = () =>
  screen.getByRole("textbox", { name: /일정 이름/ });
const categorySelect = () =>
  screen.getByRole("combobox", { name: /일정 유형/ });
const editorForm = () =>
  screen.getByRole("heading", { name: "일정 추가" }).closest("form")!;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  useCurrentFlowStore.getState().reset();
  useCurrentFlowStore.getState().setOnboardingCompleted(true);
  useCurrentFlowStore.getState().setDemoAuthenticated(true);
  useServiceStore.getState().reset();
  actions.classifyScheduleTitle.mockResolvedValue(classification("CLASS"));
});

describe("ServiceCalendar schedule classification", () => {
  it("classifies a title exactly once after blur", async () => {
    const user = await openNewEditor();
    await user.type(titleInput(), "AI 수업");
    fireEvent.blur(titleInput());

    await waitFor(() =>
      expect(actions.classifyScheduleTitle).toHaveBeenCalledOnce(),
    );
    expect(actions.classifyScheduleTitle).toHaveBeenCalledWith("AI 수업");
    await waitFor(() => expect(categorySelect()).toHaveValue("CLASS"));
  });

  it("reuses the completed blur classification when saving the same title", async () => {
    const user = await openNewEditor();
    await user.type(titleInput(), "AI 수업");
    fireEvent.blur(titleInput());
    await waitFor(() => expect(categorySelect()).toHaveValue("CLASS"));

    await user.click(screen.getByRole("button", { name: "일정 저장" }));

    await waitFor(() => expect(actions.editCalendarEvent).toHaveBeenCalledOnce());
    expect(actions.classifyScheduleTitle).toHaveBeenCalledOnce();
  });

  it("classifies once on submit when blur did not run", async () => {
    const user = await openNewEditor();
    await user.type(titleInput(), "AI 수업");

    fireEvent.submit(editorForm());

    await waitFor(() => expect(actions.editCalendarEvent).toHaveBeenCalledOnce());
    expect(actions.classifyScheduleTitle).toHaveBeenCalledOnce();
  });

  it("starts one additional request only after the normalized title changes", async () => {
    const user = await openNewEditor();
    await user.type(titleInput(), "AI 수업");
    fireEvent.blur(titleInput());
    await waitFor(() => expect(categorySelect()).toHaveValue("CLASS"));

    await user.clear(titleInput());
    await user.type(titleInput(), "  AI 수업  ");
    fireEvent.blur(titleInput());
    expect(actions.classifyScheduleTitle).toHaveBeenCalledOnce();

    await user.clear(titleInput());
    await user.type(titleInput(), "팀 회의");
    fireEvent.blur(titleInput());

    await waitFor(() =>
      expect(actions.classifyScheduleTitle).toHaveBeenCalledTimes(2),
    );
    expect(actions.classifyScheduleTitle).toHaveBeenLastCalledWith("팀 회의");
  });

  it("does not classify when the user selected a category manually", async () => {
    const user = await openNewEditor();
    await user.selectOptions(categorySelect(), "WORK");
    await user.type(titleInput(), "직접 정한 일정");
    await user.click(screen.getByRole("button", { name: "일정 저장" }));

    await waitFor(() => expect(actions.editCalendarEvent).toHaveBeenCalledOnce());
    expect(actions.classifyScheduleTitle).not.toHaveBeenCalled();
    expect(actions.editCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ category: "WORK" }),
    );
  });

  it("uses the stored classification when only an existing event time changes", async () => {
    const user = userEvent.setup();
    renderCalendar([existingEvent], {
      [existingEvent.clientId]: classification("WORK"),
    });
    await user.click(document.querySelector(".selected-event") as HTMLElement);
    await user.clear(screen.getByLabelText("시작 시각"));
    await user.type(screen.getByLabelText("시작 시각"), "12:30");
    await user.click(screen.getByRole("button", { name: "일정 저장" }));

    await waitFor(() => expect(actions.editCalendarEvent).toHaveBeenCalledOnce());
    expect(actions.classifyScheduleTitle).not.toHaveBeenCalled();
  });

  it("does not let a late response for title A overwrite title B", async () => {
    const requestA = deferred<ScheduleClassification>();
    const requestB = deferred<ScheduleClassification>();
    actions.classifyScheduleTitle
      .mockReturnValueOnce(requestA.promise)
      .mockReturnValueOnce(requestB.promise);
    const user = await openNewEditor();
    await user.type(titleInput(), "제목 A");
    fireEvent.blur(titleInput());
    await waitFor(() => expect(actions.classifyScheduleTitle).toHaveBeenCalledOnce());

    await user.clear(titleInput());
    await user.type(titleInput(), "제목 B");
    fireEvent.blur(titleInput());
    await waitFor(() =>
      expect(actions.classifyScheduleTitle).toHaveBeenCalledTimes(2),
    );

    await act(async () => requestA.resolve(classification("WORK")));
    expect(categorySelect()).toHaveValue("OTHER");
    await act(async () => requestB.resolve(classification("CLASS")));
    await waitFor(() => expect(categorySelect()).toHaveValue("CLASS"));
  });

  it("awaits the in-flight blur request on submit without duplicating it", async () => {
    const request = deferred<ScheduleClassification>();
    actions.classifyScheduleTitle.mockReturnValueOnce(request.promise);
    const user = await openNewEditor();
    await user.type(titleInput(), "AI 수업");
    fireEvent.blur(titleInput());
    await waitFor(() => expect(actions.classifyScheduleTitle).toHaveBeenCalledOnce());

    await user.click(screen.getByRole("button", { name: "일정 저장" }));
    expect(actions.classifyScheduleTitle).toHaveBeenCalledOnce();
    expect(actions.editCalendarEvent).not.toHaveBeenCalled();

    await act(async () => request.resolve(classification("CLASS")));
    await waitFor(() => expect(actions.editCalendarEvent).toHaveBeenCalledOnce());
  });

  it("does not let a late AI response overwrite a manual selection", async () => {
    const request = deferred<ScheduleClassification>();
    actions.classifyScheduleTitle.mockReturnValueOnce(request.promise);
    const user = await openNewEditor();
    await user.type(titleInput(), "AI 수업");
    fireEvent.blur(titleInput());
    await waitFor(() => expect(actions.classifyScheduleTitle).toHaveBeenCalledOnce());

    await user.selectOptions(categorySelect(), "WORK");
    await act(async () => request.resolve(classification("CLASS")));

    expect(categorySelect()).toHaveValue("WORK");
    expect(screen.getByText("직접 선택한 유형을 사용해요.")).toBeVisible();
  });
});
