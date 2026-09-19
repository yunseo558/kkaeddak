import { expect, test } from "@playwright/test";

test("핵심 시작 화면이 뷰포트에서 유지된다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "몇 시에 일어나야 할지, 매일 고민하지 않도록." })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot("demo-start.png", {
    animations: "disabled",
  });
});
