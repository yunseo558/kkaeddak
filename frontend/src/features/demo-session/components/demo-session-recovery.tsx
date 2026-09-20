"use client";

import { useEffect, useRef } from "react";

import {
  isDemoSessionExpired,
  useDemoSessionStore,
} from "@/features/demo-session/model/demo-session-store";
import { serviceAction } from "@/features/service/lib/service-actions";
import { useServiceStore } from "@/features/service/model/service-store";

export function DemoSessionRecovery() {
  const attemptedSession = useRef<string | null>(null);
  const busy = useServiceStore((state) => state.busy);
  const expiresAt = useDemoSessionStore((state) => state.expiresAt);
  const mode = useDemoSessionStore((state) => state.mode);
  const sessionId = useDemoSessionStore((state) => state.sessionId);

  useEffect(() => {
    const sessionKey = `${sessionId ?? "missing"}:${expiresAt ?? "missing"}`;
    if (
      busy ||
      attemptedSession.current === sessionKey ||
      !isDemoSessionExpired({ expiresAt, mode, sessionId })
    ) {
      return;
    }
    attemptedSession.current = sessionKey;
    void serviceAction(async () => undefined);
  }, [busy, expiresAt, mode, sessionId]);

  return null;
}
