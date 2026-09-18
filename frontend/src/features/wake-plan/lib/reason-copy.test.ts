import { describe, expect, it } from "vitest";

import { getVisibleReasons } from "./reason-copy";

describe("getVisibleReasons", () => {
  it("maps known reason codes and limits visible facts to three", () => {
    expect(
      getVisibleReasons([
        "SHORTER_SLEEP_THAN_BASELINE",
        "HIGH_ACTIVITY_DEVIATION",
        "RECENT_FIRST_ALARM_FAILURE",
        "IMPORTANT_EVENT",
      ]),
    ).toEqual([
      "평소보다 수면시간이 짧았습니다",
      "평소보다 활동량이 많았습니다",
      "비슷한 날 첫 알람만으로 일어나지 못했습니다",
    ]);
  });
});
