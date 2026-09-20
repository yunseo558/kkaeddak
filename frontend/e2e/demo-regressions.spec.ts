import { expect, test, type Page } from "@playwright/test";
import type { useServiceStore } from "../src/features/service/model/service-store";

test.setTimeout(90_000);
type State = ReturnType<typeof useServiceStore.getState>;
async function state(page: Page): Promise<State> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("kkaeddak-service")!).state);
}
async function draft(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("kkaeddak-current-flow")!).state.onboardingDraft);
}
async function settleReload(page: Page) {
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.clock.runFor(16_000);
  await page.waitForLoadState("networkidle");
}
async function setup(page: Page){
 await page.clock.install({time:new Date('2026-09-20T09:00:00+09:00')});
 await page.goto('/');
 await page.getByRole('button',{name:'스플래시 건너뛰기'}).click();
 await page.getByRole('button',{name:'데모 버전으로 로그인'}).click();
 await page.getByRole('link',{name:'설정하러 가기'}).click();
 for(let i=0;i<3;i++) await page.getByRole('button',{name:'다음',exact:true}).click();
 await page.getByRole('button',{name:'Apple 건강 샘플 연결하기'}).click();
 await page.getByRole('button',{name:'캘린더 샘플 연결하기'}).click();
 await page.getByText('샘플 연동 완료').nth(1).waitFor();
 await page.getByRole('button',{name:'다음',exact:true}).click();
 await page.getByRole('button',{name:'설정 완료'}).click();
 await page.getByRole('button',{name:'이 계획 승인'}).waitFor();
 await page.getByRole('button',{name:'이 계획 승인'}).click();
 await page.getByText('알람이 설정됐어요',{exact:true}).waitFor();

}

test("아침 새로고침은 오늘 승인한 알람을 보존한다", async ({ page }) => {
  await setup(page);
  const before = await state(page);
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("kkaeddak-service")!);
    saved.state.virtualNow = new Date(Date.parse(saved.state.plan.firstAlarmAt) - 60_000).toISOString();
    localStorage.setItem("kkaeddak-service", JSON.stringify(saved));
  });
  await settleReload(page);
  expect((await state(page)).plan).toMatchObject({ id: before.plan!.id, status: "APPROVED" });
  await expect(page.getByRole("heading", { level: 1, name: "오늘의 아침" })).toBeVisible();
});

for (const expired of [false, true]) {
  test(`기상 확인 대기는 새로고침 후 복구된다 (세션 만료: ${expired})`, async ({ page }) => {
    await setup(page);
    await page.getByRole("button", { name: "알람 지금 울리기" }).click();
    await page.getByRole("button", { name: "알람 끄기", exact: true }).click();
    await expect(page.getByRole("button", { name: "네, 일어났어요" })).toBeVisible();
    await expect.poll(async () => (await state(page)).alarmRuntime.events.every((event) => event.synced)).toBe(true);
    const before = await state(page);
    if (expired) await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("kkaeddak-demo-session")!);
      saved.state.expiresAt = "2020-01-01T00:00:00Z";
      localStorage.setItem("kkaeddak-demo-session", JSON.stringify(saved));
    });
    await settleReload(page);
    await expect(page.getByRole("button", { name: "네, 일어났어요" })).toBeVisible();
    const after = await state(page);
    expect(after.plan!.localDate).toBe(before.plan!.localDate);
    expect(after.plan!.status).toBe("APPROVED");
    expect(after.alarmRuntime.awaitingConfirmationStepOrder).toBe(1);
    if (expired) expect(after.plan!.id).not.toBe(before.plan!.id);
    else expect(after.plan!.id).toBe(before.plan!.id);
    await page.getByRole("button", { name: "네, 일어났어요" }).click();
    await expect.poll(async () => (await state(page)).plan!.status).toBe("COMPLETED");
    expect((await state(page)).records.filter((record) => record.date === before.plan!.localDate)).toHaveLength(1);
  });
}

test("다른 날짜 일정 수정은 승인된 알람에 영향을 주지 않는다", async ({ page }) => {
  await setup(page);
  const before = await state(page);
  await page.getByRole("link", { name: "캘린더", exact: true }).click();
  await page.getByRole("button", { name: "25일, 일정 1개", exact: true }).click();
  await page.locator(".selected-event").first().click();
  await page.getByLabel("시작 시각").fill("10:30");
  await page.getByRole("button", { name: "일정 저장", exact: true }).click();
  await expect(page.getByRole("heading", { name: "일정 수정" })).not.toBeVisible();
  expect((await state(page)).plan).toMatchObject({ id: before.plan!.id, status: "APPROVED" });
});

test("유일한 내일 일정을 이동하면 알람을 해제하고 편집을 완료한다", async ({ page }) => {
  await setup(page);
  await page.getByRole("link", { name: "캘린더", exact: true }).click();
  await page.locator(".selected-event").first().click();
  await page.getByLabel("날짜", { exact: true }).fill("2026-09-24");
  await page.getByRole("button", { name: "일정 저장", exact: true }).click();
  await expect(page.getByRole("heading", { name: "일정 수정" })).not.toBeVisible();
  await expect(page.locator(".service-error")).toContainText("예정된 일정이 없어");
  expect((await state(page)).plan).toBeNull();
  await settleReload(page);
  expect((await state(page)).plan).toBeNull();
  await expect(page.getByRole("button", { name: "알람 지금 울리기" })).toBeDisabled();
});

test("계획 생성 실패는 기존 승인 알람을 보존한다", async ({ page }) => {
  await setup(page);
  const before = await state(page);
  await page.route("**/api/v1/wake-plans", (route) => route.request().method() === "POST"
    ? route.fulfill({ status: 503, json: { code: "UNAVAILABLE" } }) : route.continue());
  await page.getByRole("link", { name: "캘린더", exact: true }).click();
  await page.getByRole("button", { name: "변경된 일정으로 계획 다시 계산" }).click();
  await expect(page.locator(".service-error")).toContainText("저장하지 못했어요");
  expect((await state(page)).plan).toMatchObject({ id: before.plan!.id, status: "APPROVED" });
});

test("일정은 저장됐지만 재계산에 실패하면 이전 알람을 해제하고 안내한다", async ({ page }) => {
  await setup(page);
  await page.route("**/api/v1/wake-plans", (route) => route.request().method() === "POST"
    ? route.fulfill({ status: 503, json: { code: "UNAVAILABLE" } }) : route.continue());
  await page.getByRole("link", { name: "캘린더", exact: true }).click();
  await page.locator(".selected-event").first().click();
  await page.getByLabel("시작 시각").fill("10:30");
  await page.getByRole("button", { name: "일정 저장", exact: true }).click();
  await expect(page.getByRole("heading", { name: "일정 수정" })).not.toBeVisible();
  await expect(page.locator(".service-error")).toContainText("일정은 저장했지만 알람 재계산");
  expect((await state(page)).plan!.status).toBe("DECLINED");
});

test("자동화·알람·동의 설정 저장 실패는 기존 설정을 유지한다", async ({ page }) => {
  await setup(page);
  const before = await state(page);
  await page.route("**/api/v1/profile", (route) => route.request().method() === "PUT"
    ? route.fulfill({ status: 503, json: { code: "UNAVAILABLE" } }) : route.continue());
  await page.goto("/settings/automation");
  await page.getByRole("radio", { name: "자동 적용" }).check();
  await page.getByLabel("14일 전부터 자동 적용 시작").check();
  await page.getByRole("button", { name: "설정 저장" }).click();
  await expect(page.locator(".service-error")).toContainText("저장하지 못했어요");
  expect((await draft(page)).automationMode).toBe("suggest");
  expect((await state(page)).earlyAutomationEnabled).toBe(false);
  await page.goto("/settings/alarms");
  await page.route("**/api/v1/routines", (route) => route.request().method() === "PUT"
    ? route.fulfill({ status: 503, json: { code: "UNAVAILABLE" } }) : route.continue());
  await page.getByLabel("기본 알람 개수").selectOption("1");
  await page.getByRole("button", { name: "설정 저장" }).click();
  await expect(page.locator(".service-error")).toContainText("저장하지 못했어요");
  expect((await state(page)).preferredAlarmCount).toBe(before.preferredAlarmCount);
  await page.goto("/settings/privacy");
  await page.getByRole("checkbox", { name: /집계 결과 서버 동기화 허용/ }).check();
  expect((await draft(page)).outcomeSync).toBe(false);
  await page.getByRole("button", { name: "동기화 설정 저장" }).click();
  await expect(page.getByText("서버 설정을 저장하지 못했습니다. 이전 동의 설정을 유지합니다.")).toBeVisible();
  expect((await draft(page)).outcomeSync).toBe(false);
});

test("일정 유형 삭제 저장에 실패하면 일정의 유형도 되돌린다", async ({ page }) => {
  await setup(page);
  const before = await state(page);
  await page.goto("/settings/schedule-types");
  const classType = page.locator(".schedule-type-row").filter({ has: page.locator('input[value="수업"]') });
  page.once("dialog", (dialog) => dialog.accept());
  await classType.getByRole("button", { name: "삭제", exact: true }).click();
  await page.route("**/api/v1/routines", (route) => route.request().method() === "PUT"
    ? route.fulfill({ status: 503, json: { code: "UNAVAILABLE" } }) : route.continue());
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.locator(".service-error")).toContainText("저장하지 못했어요");
  expect((await state(page)).scheduleTypes).toEqual(before.scheduleTypes);
  expect((await state(page)).events).toEqual(before.events);
  const sessionId = await page.evaluate(() => JSON.parse(localStorage.getItem("kkaeddak-demo-session")!).state.sessionId);
  const response = await page.request.get("/api/v1/schedule-events", {
    headers: { "X-Demo-Session": sessionId },
    params: { from: "2026-09-20T15:00:00.000Z", to: "2026-09-21T15:00:00.000Z" },
  });
  expect(response.ok()).toBe(true);
  expect((await response.json()).items[0].category).toBe("CLASS");
});


test("소리 자동 재생과 이벤트 저장이 막혀도 기상 확인을 완료한다", async ({ page }) => {
  await page.addInitScript(() => {
    AudioContext.prototype.resume = () => new Promise<void>(() => {});
  });
  await setup(page);
  await page.route("**/alarm-events", (route) => route.fulfill({ status: 503, json: { code: "UNAVAILABLE" } }));
  await page.getByRole("button", { name: "알람 지금 울리기" }).click();
  await expect(page.getByRole("button", { name: "알람 소리 재생" })).toBeEnabled();
  await page.getByRole("button", { name: "알람 끄기", exact: true }).click();
  await page.getByRole("button", { name: "네, 일어났어요" }).click();
  await expect.poll(async () => (await state(page)).plan!.status).toBe("COMPLETED");
  expect((await state(page)).alarmRuntime.events.some((event) => !event.synced)).toBe(true);
});
