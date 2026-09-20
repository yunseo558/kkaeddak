import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { AxeResults, RunOptions } from "axe-core";

test.setTimeout(90_000);

async function finishSetup(page: Page) {
  await page.clock.install({ time: new Date("2026-09-20T09:00:00+09:00") });
  await page.goto("/");
  await page.getByRole("button", { name: "스플래시 건너뛰기" }).click();
  await page.getByRole("button", { name: "데모 버전으로 로그인" }).click();
  await page.getByRole("link", { name: "설정하러 가기" }).click();
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole("button", { name: "다음", exact: true }).click();
  }
  await page.getByRole("button", { name: "Apple 건강 샘플 연결하기" }).click();
  await page
    .getByRole("button", { name: "캘린더 샘플 연결하기" })
    .click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "설정 완료" }).click();
  await expect(page.getByRole("button", { name: "이 계획 승인" })).toBeVisible();
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((image) => image.decode().catch(() => {})),
    );
  });
}

test("matte material system stays readable across service tabs", async ({ page }, testInfo: TestInfo) => {
  await finishSetup(page);

  for (const route of ["/sleep", "/calendar", "/history", "/settings"]) {
    await page.goto(route);
    await settle(page);
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    expect(
      await page.locator(".app-frame").evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`${route.slice(1)}.png`),
      animations: "disabled",
    });
    const violations = await page.evaluate(async () => {
      const { axe } = window as unknown as {
        axe: { run: (context: Element, options: RunOptions) => Promise<AxeResults> };
      };
      const result = await axe.run(document.querySelector(".iphone-screen")!, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      });
      return result.violations.map(({ id, nodes }) => ({
        id,
        elements: nodes.map((node) => node.html),
      }));
    });
    expect(violations).toEqual([]);
  }
});
