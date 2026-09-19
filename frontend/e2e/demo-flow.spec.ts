import { expect, test, type Page } from "@playwright/test";

const scenarios = [
  "일반 수업",
  "오전 시험",
  "피로한 면접날",
] as const;

async function startScenario(page: Page, scenario: (typeof scenarios)[number]) {
  await page.goto("/demo");
  await page.waitForLoadState("networkidle");
  await page.getByText(scenario, { exact: true }).click();
  await expect(page.getByRole("radio", { name: new RegExp(scenario) })).toBeChecked();
  await page.getByRole("button", { name: "내일 기상 계획 만들기" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  for (const heading of ["일정 유형", "알람 설정", "개인정보"]) {
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  const completeButton = page.getByRole("button", { name: "설정 완료" });
  await completeButton.press("Enter");
  await expect(page).toHaveURL(/\/calendar$/);
  await page.goto("/tomorrow");
  await expect(
    page.getByRole("heading", { level: 1, name: scenario }),
  ).toBeVisible();
}

for (const scenario of scenarios) {
  test(`${scenario} 시작부터 로컬 학습까지 완료한다`, async ({ page }) => {
    await startScenario(page, scenario);

    await page.getByRole("link", { name: "준비 작업 보기" }).click();
    await expect(page.getByRole("heading", { name: "오늘 밤 미리 끝낼 수 있는 일" })).toBeVisible();
    await page.getByRole("link", { name: "기상 계획 만들기" }).click();

    await expect(page.getByRole("heading", { name: "내일 기상 계획" })).toBeVisible();
    await page.getByRole("button", { name: "이 계획 승인" }).click();
    await page.getByRole("link", { name: "기상 실행 시작" }).click();

    await page.getByRole("button", { name: "알람 종료" }).click();
    await page.getByRole("button", { name: "기상 활동 시작" }).click();
    await page.getByRole("button", { name: "기상 완료 확인" }).click();
    await page.getByRole("link", { name: "기상 결과 보기" }).click();

    await expect(page.getByRole("heading", { name: "제시간 기상 확인" })).toBeVisible();
    await page.getByRole("button", { name: "결과 확정하고 학습 반영" }).click();
    await expect(page.getByRole("heading", { name: "다음 추천 변화" })).toBeVisible();
  });
}

test("새로고침 후에도 현재 시나리오를 복구한다", async ({ page }) => {
  await startScenario(page, "오전 시험");

  await page.reload();

  await expect(
    page.getByRole("heading", { level: 1, name: "오전 시험" }),
  ).toBeVisible();
  await expect(page.getByText("서버 일정 연결됨")).toBeVisible();
});

test("네트워크가 끊기면 로컬 계산으로 전환한다", async ({ context, page }) => {
  await startScenario(page, "피로한 면접날");

  await context.setOffline(true);

  await expect(page.getByRole("status")).toContainText("오프라인 상태입니다");
  await expect(page.getByText("오프라인 로컬 계산")).toBeVisible();
});
