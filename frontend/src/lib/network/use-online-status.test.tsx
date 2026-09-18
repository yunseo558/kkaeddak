import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useOnlineStatus } from "./use-online-status";

const originalDescriptor = Object.getOwnPropertyDescriptor(
  Navigator.prototype,
  "onLine",
);

afterEach(() => {
  if (originalDescriptor) {
    Object.defineProperty(Navigator.prototype, "onLine", originalDescriptor);
  }
});

describe("useOnlineStatus", () => {
  it("reacts to browser online and offline events", () => {
    let online = true;
    Object.defineProperty(Navigator.prototype, "onLine", {
      configurable: true,
      get: () => online,
    });
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => {
      online = false;
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);

    act(() => {
      online = true;
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
  });
});
