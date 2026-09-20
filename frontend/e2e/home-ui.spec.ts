import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { AxeResults, RunOptions } from "axe-core";

test.setTimeout(90_000);

async function setupHome(page: Page) {
  await page.clock.install({ time: new Date("2026-09-20T09:00:00+09:00") });
  await page.goto("/");
  await page.getByRole("button", { name: "스플래시 건너뛰기" }).click();
  await page.getByRole("button", { name: "데모 버전으로 로그인" }).click();
  await page.getByRole("link", { name: "설정하러 가기" }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "Apple 건강 샘플 연결하기" }).click();
  await expect(page.getByText("샘플 연동 완료")).toHaveCount(1);
  await page
    .getByRole("button", { name: "캘린더 샘플 연결하기" })
    .click();
  await expect(page.getByText("샘플 연동 완료")).toHaveCount(2);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "설정 완료" }).click();
  await expect(page.getByRole("button", { name: "이 계획 승인" })).toBeVisible();
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.locator(".app-frame").evaluate((element) => { element.scrollTop = 0; });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map((image) => image.decode().catch(() => {})));
  });
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: "disabled" });
}

test("home scene keeps its actions usable across viewport sizes and plan states", async ({ page }, testInfo) => {
  await setupHome(page);
  const originalViewport = page.viewportSize()!;
  for (const width of new Set([390, 430, originalViewport.width])) {
    await page.setViewportSize({ width, height: originalViewport.height });
    await capture(page, testInfo, `proposed-${width}`);
    const action = await page.getByRole("button", { name: "이 계획 승인" }).boundingBox();
    const nav = await page.getByRole("navigation", { name: "주 메뉴" }).boundingBox();
    expect(action!.y + action!.height).toBeLessThan(nav!.y);
    expect(await page.locator(".app-frame").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(page.getByRole("link", { name: "홈", exact: true })).toHaveAttribute("aria-current", "page");
  }
  await page.setViewportSize(originalViewport);
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    const { axe } = window as unknown as { axe: { run: (context: Element, options: RunOptions) => Promise<AxeResults> } };
    const result = await axe.run(document.querySelector(".iphone-screen")!, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    });
    return result.violations.map(({ id, nodes }) => ({ id, elements: nodes.map(node => node.html) }));
  });
  expect(violations).toEqual([]);
  await page.locator(".app-frame").evaluate(element => { element.scrollTop = 620; });
  await page.screenshot({ path: testInfo.outputPath("information-cards.png"), animations: "disabled" });
  await page.getByRole("button", { name: "이 계획 승인" }).click();
  await expect(page.getByText("알람이 설정됐어요", { exact: true })).toBeVisible();
  await capture(page, testInfo, "approved");
  await page.getByRole("button", { name: "시간 변경" }).click();
  await page.getByLabel("첫 알람 시각", { exact: true }).fill("09:20");
  await page.getByRole("button", { name: "변경 저장" }).click();
  await expect(page.locator(".service-clock")).toHaveText("09:20");
  await page.getByRole("button", { name: "알람 취소" }).click();
  await expect(page.getByText("알람 취소됨", { exact: true })).toBeVisible();
  await capture(page, testInfo, "declined");
  await page.getByRole("button", { name: "계획 다시 만들기" }).click();
  await expect(page.getByRole("button", { name: "이 계획 승인" })).toBeVisible();
  await page.getByRole("button", { name: "이 계획 승인" }).click();
  await page.getByRole("button", { name: "알람 지금 울리기" }).click();
  await expect(page.getByText("일어날 시간이에요", { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, testInfo, "ringing");
  await page.getByRole("button", { name: "알람 끄기" }).click();
  await expect(page.getByRole("button", { name: "네, 일어났어요" })).toBeVisible();
  await capture(page, testInfo, "confirmation");
  await page.getByRole("button", { name: "네, 일어났어요" }).click();
  await expect(page.getByText("잘 일어났어요. 다음 추천에도 반영할게요.")).toBeVisible();
  await capture(page, testInfo, "completed");
});

test("empty plan and long event titles remain readable when generation is unavailable", async ({ page }, testInfo) => {
  await setupHome(page);
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("kkaeddak-service")!);
    stored.state.plan.eventTitle = "아주 긴 일정 이름도 빠짐없이 확인하는 깨딱 서비스 디자인 검토와 공모전 최종 발표 리허설";
    localStorage.setItem("kkaeddak-service", JSON.stringify(stored));
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "스플래시 건너뛰기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "이 계획 승인" })).toBeVisible();
  await capture(page, testInfo, "long-title");
  expect(await page.locator(".app-frame").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("kkaeddak-service")!);
    stored.state.plan = null;
    localStorage.setItem("kkaeddak-service", JSON.stringify(stored));
  });
  await page.route("**/api/v1/wake-plans", async route => {
    if (route.request().method() === "POST") await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    else await route.continue();
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "스플래시 건너뛰기" })).toHaveCount(0);
  await expect(page.getByText("계획 없음", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "계획 다시 만들기" })).toBeEnabled();
  await capture(page, testInfo, "empty-plan");
  expect(await page.locator(".app-frame").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});
