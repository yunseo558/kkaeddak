import { expect, test, type Page } from "@playwright/test";

test.setTimeout(90_000);

async function authenticate(page: Page) {
  await page.clock.install({ time: new Date("2026-09-20T09:00:00+09:00") });
  await page.goto("/");
  await page.getByRole("button", { name: "스플래시 건너뛰기" }).click();
  await page.getByRole("button", { name: "데모 버전으로 로그인" }).click();
}

async function finishSetup(page: Page) {
  await authenticate(page);
  await page.getByRole("link", { name: "설정하러 가기" }).click();
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole("button", { name: "다음", exact: true }).click();
  }
  await page
    .getByRole("button", { name: "Apple 건강 샘플 연결하기" })
    .click();
  await page
    .getByRole("button", { name: "캘린더 샘플 연결하기" })
    .click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "설정 완료" }).click();
  await expect(
    page.getByRole("button", { name: "이 계획 승인" }),
  ).toBeVisible({ timeout: 30_000 });
}

test("설정 전 홈과 건강 캘린더 기록이 같은 말풍선으로 다음 행동을 안내한다", async ({
  page,
}, testInfo) => {
  await authenticate(page);

  await expect(page.getByRole("heading", { name: "내일 아침을 준비해볼까요?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "설정하러 가기" })).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: testInfo.outputPath("setup-home-guidance.png"),
  });

  await page.getByRole("link", { name: "건강", exact: true }).click();
  await expect(page.getByRole("heading", { name: "피로도 분석을 준비할게요" })).toBeVisible();
  await page.getByRole("link", { name: "캘린더", exact: true }).click();
  await expect(page.getByRole("heading", { name: "첫 일정부터 확인할게요" })).toBeVisible();
  await page.getByRole("link", { name: "기록", exact: true }).click();
  await expect(page.getByRole("heading", { name: "첫 아침을 기록할 준비를 해요" })).toBeVisible();
});

test("Apple 건강 요약과 Gemini 피로도 결과가 알람 개수와 홈 요약에 연결된다", async ({
  page,
}, testInfo) => {
  await finishSetup(page);
  await page.getByRole("link", { name: "건강", exact: true }).click();

  await expect(page.getByRole("heading", { level: 1, name: "건강" })).toBeVisible();
  await expect(page.getByText("월경 주기", { exact: true })).toBeVisible();
  await expect(page.getByText("걸음 수", { exact: true })).toBeVisible();
  await expect(page.locator(".health-ai-card")).toContainText(/Gemini|Gemini 연결 전/);
  await expect(page.locator(".health-ai-card")).toContainText(/알람.*개/);
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: testInfo.outputPath("health-fatigue-analysis.png"),
  });

  await page.getByRole("link", { name: "홈", exact: true }).click();
  await expect(page.getByRole("heading", { name: "오늘의 기상 난이도" })).toBeVisible();
  await expect(page.getByText(/피로도 .+ · \d+점/)).toBeVisible();
  await expect(page.getByText(/내일 \d+개의 알람이 필요/)).toBeVisible();
});

test("평소 수면 패턴을 바꾸면 같은 오늘 수면도 개인 기준에 따라 분석한다", async ({ page }) => {
  await finishSetup(page);
  const analyses: Array<{ body: { restMinutes: number; usualRestMinutes: number }; score: number }> = [];
  for (const pattern of ["shorter", "longer"]) {
    await page.getByLabel("평소 수면 패턴", { exact: true }).selectOption(pattern);
    await page.getByRole("link", { name: "캘린더", exact: true }).click();
    const responsePromise = page.waitForResponse((response) =>
      response.url().endsWith("/api/v1/ai/wake-plan-recommendations") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "변경된 일정으로 계획 다시 계산" }).click();
    const response = await responsePromise;
    const body = response.request().postDataJSON();
    analyses.push({ body, score: (await response.json()).fatigueScore });
    await expect(page.getByRole("button", { name: "변경된 일정으로 계획 다시 계산" })).toBeEnabled();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("kkaeddak-service")!).state);
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem("kkaeddak-demo-session")!).state);
    const report = await page.request.get(`/api/v1/history/reports/${stored.plan.localDate}`, {
      headers: { "X-Demo-Session": session.sessionId },
    });
    expect(report.ok()).toBe(true);
    expect((await report.json()).decisionContext.healthSummary.usualRestMinutes).toBe(body.usualRestMinutes);
  }
  expect(analyses.map(({ body }) => body.restMinutes)).toEqual([420, 420]);
  expect(analyses[1].body.usualRestMinutes - analyses[0].body.usualRestMinutes).toBe(120);
  expect(analyses[1].score).toBeGreaterThan(analyses[0].score);
  await page.reload();
  await expect(page.getByLabel("평소 수면 패턴", { exact: true })).toHaveValue("longer");
  await page.getByRole("link", { name: "건강", exact: true }).click();
  await expect(page.getByRole("region", { name: "평소 수면 기준" })).toContainText("최근 14일 수면 샘플의 중앙값");
});

test("14일 체험 기록은 목록과 상세에서 샘플로 표시되고 새로고침해도 유지된다", async ({ page }, testInfo) => {
  await finishSetup(page);
  await page.getByRole("button", { name: "14일 학습 후 자동 적용 확인" }).click();
  await expect(page.getByText("자동으로 반영했어요", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "기록", exact: true }).click();
  await expect(page.getByText("학습 체험용 샘플 12일이 포함되어 있어요.")).toBeVisible();
  const sample = page.locator(".history-report-link").filter({ hasText: "학습 체험용 샘플" });
  await expect(sample).toHaveCount(12);
  const reportRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/v1\/history\/reports\/\d{4}-\d{2}-\d{2}$/.test(request.url())) reportRequests.push(request.url());
  });
  await sample.first().click();
  await expect(page.getByRole("heading", { name: "14일 학습을 체험하기 위해 만든 기록이에요" })).toBeVisible();
  await expect(page.getByText("이 기록은 이전 버전에서 생성되어 상세 분석이 없어요")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "14일 학습을 체험하기 위해 만든 기록이에요" })).toBeVisible();
  expect(reportRequests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("preview-history-detail.png"), fullPage: true });
});
