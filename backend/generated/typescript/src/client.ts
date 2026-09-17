import createClient from "openapi-fetch";

import type { paths } from "./schema.d.ts";

export type KkaeddakApiClient = ReturnType<typeof createKkaeddakApiClient>;

export function createKkaeddakApiClient(baseUrl: string) {
  return createClient<paths>({
    baseUrl: baseUrl.replace(/\/$/, ""),
  });
}

export function demoSessionHeaders(sessionId: string) {
  return { "X-Demo-Session": sessionId } as const;
}
