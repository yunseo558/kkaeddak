import { describe, expect, it } from "vitest";

import { createDemoSessionPayload } from "./create-demo-session";

describe("createDemoSessionPayload", () => {
  it("only includes fields allowed by the OpenAPI contract", () => {
    expect(createDemoSessionPayload("exam-morning")).toEqual({
      locale: "ko-KR",
      scenarioId: "exam-morning",
      timezone: "Asia/Seoul",
    });
  });
});
