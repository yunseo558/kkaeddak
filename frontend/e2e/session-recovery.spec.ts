import { expect, test, type Page } from "@playwright/test";

type StoredSession = {
  expiresAt: string;
  scenarioId: string;
  sessionId: string;
};

async function storedSession(page: Page): Promise<StoredSession> {
  return page.evaluate(() => {
    const persisted = JSON.parse(
      localStorage.getItem("kkaeddak-demo-session") ?? "{}",
    );
    return persisted.state;
  });
}

async function setupHome(page: Page) {
  await page.clock.install({ time: new Date("2026-09-20T09:00:00+09:00") });
  await page.goto("/");
  await page.getByRole("button", { name: "스플래시 건너뛰기" }).click();
  await page.getByRole("button", { name: "데모 버전으로 로그인" }).click();
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

test("캘린더와 Apple 건강을 각각의 샘플 아이콘과 동일한 연동 표기로 보여준다", async ({
  page,
}, testInfo) => {
  await page.clock.install({ time: new Date("2026-09-20T09:00:00+09:00") });
  await page.goto("/");
  await page.getByRole("button", { name: "스플래시 건너뛰기" }).click();
  await page.getByRole("button", { name: "데모 버전으로 로그인" }).click();
  await page.getByRole("link", { name: "설정하러 가기" }).click();
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole("button", { name: "다음", exact: true }).click();
  }

  const cards = page.locator(".onboarding-connection-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).locator("svg")).toBeVisible();
  await expect(cards.nth(1).locator("svg")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "캘린더 샘플 연결하기" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apple 건강 샘플 연결하기" }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: testInfo.outputPath("sample-connection-icons.png"),
  });
});

test("만료된 저장 세션을 앱 시작 시 복구하고 계획을 재생성한다", async ({
  page,
}) => {
  await setupHome(page);
  const previous = await storedSession(page);

  await page.evaluate(() => {
    const persisted = JSON.parse(
      localStorage.getItem("kkaeddak-demo-session") ?? "{}",
    );
    persisted.state.expiresAt = "2020-01-01T00:00:00.000Z";
    localStorage.setItem("kkaeddak-demo-session", JSON.stringify(persisted));
  });
  await page.reload();
  await page.getByRole("button", { name: "스플래시 건너뛰기" }).click();

  await expect(page.getByText("데모 연결을 복구했어요").first()).toBeVisible({
    timeout: 30_000,
  });
  const restored = await storedSession(page);
  expect(restored.sessionId).not.toBe(previous.sessionId);
  expect(restored.scenarioId).toBe(previous.scenarioId);
  await expect(
    page.getByRole("button", { name: "이 계획 승인" }),
  ).toBeVisible();
});

test("401이 발생하면 새 세션의 계획으로 원래 승인을 한 번만 재시도한다", async ({
  page,
}) => {
  await setupHome(page);
  const previous = await storedSession(page);
  let decisionRequests = 0;
  await page.route("**/api/v1/wake-plans/*/decision", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    decisionRequests += 1;
    if (decisionRequests === 1) {
      await route.fulfill({
        body: JSON.stringify({ code: "SESSION_EXPIRED" }),
        contentType: "application/json",
        status: 401,
      });
      return;
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "이 계획 승인" }).click();
  await expect(
    page.getByText("알람이 설정됐어요", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("데모 연결을 복구했어요").first()).toBeVisible();
  const restored = await storedSession(page);
  expect(restored.sessionId).not.toBe(previous.sessionId);
  expect(decisionRequests).toBe(2);
});
