"use client";

import { useEffect, useState, type ReactNode } from "react";

const mockingMode = process.env.NEXT_PUBLIC_API_MOCKING;
// API mocking is opt-in. Normal development and deployment use the real API;
// the sample calendar/health adapters remain explicit data-source boundaries.
const mockingEnabled = mockingMode === "enabled";
let workerStartPromise: Promise<void> | null = null;

function startMockWorker() {
  workerStartPromise ??= import("./browser")
    .then(({ worker }) => worker.start({ onUnhandledRequest: "bypass" }))
    .then(() => undefined);

  return workerStartPromise;
}

export function MockProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!mockingEnabled);

  useEffect(() => {
    if (!mockingEnabled) {
      return;
    }

    let active = true;

    startMockWorker().then(() => {
      if (active) {
        setReady(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return (
      <p aria-live="polite" className="p-6 text-sm text-muted">
        깨딱을 준비하고 있습니다.
      </p>
    );
  }

  return children;
}
