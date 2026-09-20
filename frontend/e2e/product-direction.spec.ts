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
