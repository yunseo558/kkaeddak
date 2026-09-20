import { expect, test } from "@playwright/test";

test("핵심 시작 화면이 뷰포트에서 유지된다", async ({ page }) => {
  const initialTime = new Date("2026-09-20T09:41:00+09:00");
  await page.clock.install({ time: initialTime });
  await page.clock.pauseAt(initialTime);
  await page.goto("/");
  const splash = page.getByRole("button", { name: "스플래시 건너뛰기" });
  await expect(splash).toBeVisible();
  await expect(page).toHaveScreenshot("splash.png", {
    animations: "disabled",
  });
  await page.clock.runFor(1_800);
  await expect(
    page.getByRole("heading", { name: "로그인 / 회원가입" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "스플래시 건너뛰기" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "스플래시 건너뛰기" }).click();
  await expect(
    page.getByRole("heading", { name: "로그인 / 회원가입" }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot("demo-start.png", {
    animations: "disabled",
  });
  await page.getByRole("button", { name: "데모 버전으로 로그인" }).click();
  await expect(
    page.getByRole("heading", { name: "내일 아침을 준비해볼까요?" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("setup-home.png", {
    animations: "disabled",
  });
});
