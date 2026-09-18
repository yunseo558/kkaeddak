import { expect, test } from "@playwright/test";

test("핵심 시작 화면이 뷰포트에서 유지된다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Tomorrow|KKAEDDAK|내일 일정/ })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot("demo-start.png", {
    animations: "disabled",
  });
});
