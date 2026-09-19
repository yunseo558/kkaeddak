import { expect, test, type Page } from "@playwright/test";

async function setup(page: Page) {
  await page.clock.install({ time: new Date("2026-09-20T09:00:00+09:00") });
  await page.goto("/");
  await page.getByRole("link", { name: "시작하기" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByLabel("매일 알람을 정할 시각").fill("21:00");
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "설정 완료" }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await page.getByRole("button", { name: "샘플 수면 데이터 연결" }).click();
  await expect(
    page.getByRole("button", { name: "수면 데이터 연결 완료" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "캘린더 연결하기" }).click();
  await page.getByRole("link", { name: "기상 계획 확인하기" }).click();
  await expect(
    page.getByRole("button", { name: "이 계획 승인" }),
  ).toBeVisible();
}

test("survey, calendar editing, actual plan approval and failed-wake learning", async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator(".service-clock")).toHaveText("09:50");
  await expect(page).toHaveScreenshot("service-home.png", {
    animations: "disabled",
  });
  await page.getByRole("link", { name: "캘린더", exact: true }).click();
  await page.locator(".calendar-event").first().click();
  await page.getByLabel("시작 시각").fill("12:00");
  await page.getByRole("button", { name: "일정 저장", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "일정 수정" }),
  ).not.toBeVisible();
  await page.getByRole("link", { name: "기상 계획 확인하기" }).click();
  await expect(page.locator(".service-clock")).toHaveText("10:50");
  await page.getByRole("button", { name: "이 계획 승인" }).click();
  await expect(
    page.getByText("알람이 설정됐어요", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("알람이 설정됐어요", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "알람 지금 울리기" }).click();
  await expect(
    page.getByText("일어날 시간이에요", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "알람 끄기" }).click();
  await page.getByRole("button", { name: "못 일어났어요" }).click();
  await expect(
    page.getByText("다음 계획에서는 예비 알람을 강화할게요."),
  ).toBeVisible();
  await page.getByRole("button", { name: /다음 자동화 시각으로/ }).click();
  await expect(
    page.getByRole("button", { name: "이 계획 승인" }),
  ).toBeVisible();
  await expect(page.locator(".alarm-times > div")).toHaveCount(2);
});

test("AI 일정 유형과 조기 자동화 설정을 실제 서비스 흐름으로 관리한다", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("link", { name: "캘린더", exact: true }).click();
  await expect(page.getByText("10-30", { exact: false })).toBeVisible();
  await expect(page.getByText(/수업 · AI 분류/).first()).toBeVisible();

  await page.getByRole("link", { name: "설정", exact: true }).click();
  await expect(
    page.getByText("14일 전에는 판별 기록이 적어 오차가 많을 수 있어요."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "필수" })).toBeDisabled();
  await page.getByLabel("새 유형 이름").fill("공모전");
  await page.getByLabel("새 유형 기상 시간").fill("150");
  await page.getByRole("button", { name: "유형 추가" }).click();
  const customType = page
    .locator(".schedule-type-row")
    .filter({ has: page.locator('input[value="공모전"]') });
  await expect(customType).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await customType.getByRole("button", { name: "삭제" }).click();
  await expect(page.locator('input[value="공모전"]')).toHaveCount(0);
  await page.getByLabel("14일 전부터 자동 적용 시작").check();
  await page.getByRole("button", { name: "설정 저장" }).click();
  await expect(page.getByRole("status")).toContainText("저장했어요");

  await page.getByRole("button", { name: /다음 자동화 시각으로/ }).click();
  await expect(
    page.getByText("자동으로 반영했어요", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "설정", exact: true }).click();

  await page.getByRole("radio", { name: "항상 확인 후 적용" }).check();
  await page.getByRole("button", { name: "설정 저장" }).click();
  await expect(
    page.getByText("Human-in-the-loop 방식으로 사용 중이에요."),
  ).toBeVisible();
  await page.getByRole("button", { name: /다음 자동화 시각으로/ }).click();
  await expect(page.getByRole("button", { name: "이 계획 승인" })).toBeVisible();
});

test("short sleep stays approval-based; learned routine applies automatically and can be cancelled", async ({
  page,
}) => {
  await setup(page);
  await page.getByLabel("수면 샘플", { exact: true }).selectOption("300");
  await page.getByRole("button", { name: /다음 자동화 시각으로/ }).click();
  await expect(page.locator(".alarm-times > div")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "이 계획 승인" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "14일 학습 후 확인" }).click();
  await expect(
    page.getByText("자동으로 반영했어요", { exact: true }),
  ).toBeVisible();
  const saved = await page.evaluate(() => {
    const service = JSON.parse(localStorage.getItem("kkaeddak-service")!).state;
    const session = JSON.parse(
      localStorage.getItem("kkaeddak-demo-session")!,
    ).state;
    return { id: session.sessionId, date: service.plan.localDate };
  });
  const persisted = await page.request.get(`/api/v1/wake-plans/${saved.date}`, {
    headers: { "X-Demo-Session": saved.id },
  });
  expect(persisted.ok()).toBe(true);
  expect(await persisted.json()).toMatchObject({
    status: "APPROVED",
    requiresApproval: false,
  });
  await expect(page.getByRole("button", { name: "이 계획 승인" })).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: "설정", exact: true }).click();
  await expect(
    page.getByText("자동 적용 중이며 언제든 확인 방식으로 돌아갈 수 있어요."),
  ).toBeVisible();
  await page.getByRole("radio", { name: "항상 확인 후 적용" }).check();
  await page.getByRole("button", { name: "설정 저장" }).click();
  await expect(
    page.getByText("Human-in-the-loop 방식으로 사용 중이에요."),
  ).toBeVisible();
  await page.getByRole("link", { name: "아침", exact: true }).click();
  await page.getByRole("button", { name: "시간 변경" }).click();
  await page.getByLabel("첫 알람 시각", { exact: true }).fill("09:20");
  await page.getByRole("button", { name: "변경 저장" }).click();
  await expect(page.locator(".service-clock")).toHaveText("09:20");
  await page.getByRole("button", { name: "알람 취소" }).click();
  await expect(page.getByText("알람 취소됨", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "알람 지금 울리기" }),
  ).toBeDisabled();
});
