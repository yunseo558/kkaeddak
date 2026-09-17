import {
  createKkaeddakApiClient,
  demoSessionHeaders,
  type components,
} from "../src/index.ts";

const api = createKkaeddakApiClient("http://localhost:8000/");

async function compileTimeContractSmokeTest() {
  const session = await api.POST("/api/v1/demo-sessions", {
    body: {
      locale: "ko-KR",
      scenarioId: "exam-morning",
      timezone: "Asia/Seoul",
    },
  });
  if (!session.data) return;

  const headers = demoSessionHeaders(session.data.sessionId);
  const current = await api.GET("/api/v1/me", { headers });
  const profile = await api.GET("/api/v1/profile", { headers });
  const schedules = await api.GET("/api/v1/schedule-events", {
    headers,
    params: {
      query: {
        from: "2026-09-18T00:00:00Z",
        to: "2026-09-20T00:00:00Z",
      },
    },
  });

  const typedProfile: components["schemas"]["ProfileResponse"] | undefined = profile.data;
  return { current: current.data, profile: typedProfile, schedules: schedules.data };
}

void compileTimeContractSmokeTest;
