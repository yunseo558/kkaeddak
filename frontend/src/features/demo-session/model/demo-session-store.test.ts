import { describe, expect, it } from "vitest";

import { isDemoSessionExpired } from "./demo-session-store";

describe("isDemoSessionExpired", () => {
  const now = Date.parse("2026-09-20T09:00:00.000Z");

  it("recognizes expired and malformed persisted server sessions", () => {
    expect(
      isDemoSessionExpired(
        {
          expiresAt: "2026-09-20T08:59:59.000Z",
          mode: "server",
          sessionId: "old-session",
        },
        now,
      ),
    ).toBe(true);
    expect(
      isDemoSessionExpired(
        { expiresAt: null, mode: "server", sessionId: "old-session" },
        now,
      ),
    ).toBe(true);
  });

  it("keeps active server sessions and local sessions", () => {
    expect(
      isDemoSessionExpired(
        {
          expiresAt: "2026-09-20T09:00:01.000Z",
          mode: "server",
          sessionId: "active-session",
        },
        now,
      ),
    ).toBe(false);
    expect(
      isDemoSessionExpired(
        { expiresAt: null, mode: "local", sessionId: null },
        now,
      ),
    ).toBe(false);
  });
});
