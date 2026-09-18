import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { TimezoneNotice } from "./timezone-notice";

describe("TimezoneNotice", () => {
  it("requires confirmation when device and schedule timezones differ", async () => {
    const user = userEvent.setup();
    render(
      <TimezoneNotice
        browserTimezone="America/Los_Angeles"
        scheduleTimezone="Asia/Seoul"
      />,
    );

    expect(screen.getByText(/현재 기기 America\/Los_Angeles/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "시간대 차이 확인" }));
    expect(
      screen.getByText("일정 시간대 기준 계산을 확인했습니다."),
    ).toBeInTheDocument();
  });

  it("does not interrupt the flow when timezones match", () => {
    const { container } = render(
      <TimezoneNotice
        browserTimezone="Asia/Seoul"
        scheduleTimezone="Asia/Seoul"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
