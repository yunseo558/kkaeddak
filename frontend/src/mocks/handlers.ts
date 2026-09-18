import type { components } from "@kkaeddak/api-client";
import { http, HttpResponse } from "msw";

type DemoSessionCreate = components["schemas"]["DemoSessionCreate"];
type DemoSessionResponse = components["schemas"]["DemoSessionResponse"];

export const handlers = [
  http.post<never, DemoSessionCreate, DemoSessionResponse>(
    "/api/v1/demo-sessions",
    async ({ request }) => {
      await request.json();

      return HttpResponse.json(
        {
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          seeded: true,
          sessionId: crypto.randomUUID(),
        },
        { status: 201 },
      );
    },
  ),
];
