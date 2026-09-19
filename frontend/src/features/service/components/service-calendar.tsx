"use client";
import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useServiceStore, type CalendarEntry } from "../model/service-store";
import { atTime, clockTime, localDate } from "../model/service-policy";
import {
  classifyScheduleTitle,
  connectCalendar,
  connectHealth,
  editCalendarEvent,
  generateServicePlan,
  serviceAction,
  serviceNow,
} from "../lib/service-actions";

export function ServiceCalendar() {
  const store = useServiceStore();
  const [editing, setEditing] = useState<CalendarEntry | null>(null);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("11:00");
  const [date, setDate] = useState("");
  const [important, setImportant] = useState(false);
  const [category, setCategory] = useState("OTHER");
  const [manualCategory, setManualCategory] = useState(false);
  const upcoming = [...store.events]
    .filter((e) => e.startsAt > serviceNow())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 40);
  return (
    <AppShell currentStep="분석">
      <div className="service-home">
        <header className="service-heading">
          <h1>{store.calendarConnected ? "캘린더" : "일정을 연결할까요?"}</h1>
        </header>
        {store.message && (
          <p role="alert" className="service-error">
            {store.message}
          </p>
        )}
        <section className="service-section">
          <div className="service-row">
            <h2>내 캘린더</h2>
            <span className="service-tag">
              {store.calendarConnected ? "연결됨" : "연결 전"}
            </span>
          </div>
          <p className="service-muted">
            AI가 일정 이름을 유형으로 분류하고 기상 기준을 계산해요. 가져온
            일정과 유형은 여기서 수정할 수 있어요.
          </p>
          <p className="service-footnote">
            현재 연결 소스: 샘플 캘린더. 2026년 10월 30일까지 수업·회의·시험·
            면접·약속·운동 일정이 들어 있어요.
          </p>
          <button
            disabled={store.busy}
            className="service-secondary"
            onClick={() => void serviceAction(connectCalendar)}
          >
            {store.busy
              ? "저장 중…"
              : store.calendarConnected
                ? "다시 연결"
                : "캘린더 연결하기"}
          </button>
        </section>
        <section className="service-section">
          <div className="service-row">
            <h2>수면 데이터</h2>
            <span className="service-tag">
              {store.healthConnected ? "샘플 연결됨" : "선택"}
            </span>
          </div>
          <p className="service-muted">
            수면이 짧거나 최근 기상이 어려웠다면 예비 알람을 더해요.
          </p>
          <p className="service-footnote">
            Apple 건강 연동은 iOS 앱에서 제공할 수 있어요. 이 웹 버전은 같은
            입력 형식의 샘플 수면 데이터를 사용해요.
          </p>
          <button
            disabled={store.busy || store.healthConnected}
            className="service-secondary"
            onClick={() => void serviceAction(connectHealth)}
          >
            {store.healthConnected
              ? "수면 데이터 연결 완료"
              : "샘플 수면 데이터 연결"}
          </button>
        </section>
        {store.calendarConnected && (
          <>
            <div className="service-row">
              <h2>다가오는 일정</h2>
              <button
                className="service-text-button"
                onClick={() => {
                  setEditing({
                    clientId: crypto.randomUUID(),
                    category: "CLASS",
                    importance: "NORMAL",
                    locationMode: "ONSITE",
                    startsAt: "",
                    endsAt: "",
                  });
                  setTitle("");
                  setDate(store.plan?.localDate ?? localDate(serviceNow()));
                  setTime("11:00");
                  setImportant(false);
                  setCategory("OTHER");
                  setManualCategory(false);
                }}
              >
                일정 추가
              </button>
            </div>
            <div className="calendar-list">
              {upcoming.map((event) => (
                <button
                  key={event.clientId}
                  className="calendar-event"
                  onClick={() => {
                    setEditing(event);
                    setTitle(event.displayTitle ?? "일정");
                    setTime(clockTime(event.startsAt));
                    setDate(localDate(event.startsAt));
                    setImportant(event.importance !== "NORMAL");
                    setCategory(event.category);
                    setManualCategory(!store.classifications[event.clientId]);
                  }}
                >
                  <span className="calendar-date">
                    {localDate(event.startsAt).slice(-2)}
                  </span>
                  <span>
                    <strong>{event.displayTitle}</strong>
                    <small>
                      {localDate(event.startsAt).slice(5)} ·{" "}
                      {clockTime(event.startsAt)}
                      {` · ${store.scheduleTypes.find((item) => item.code === event.category)?.label ?? "기타"}`}
                      {store.classifications[event.clientId]
                        ? " · AI 분류"
                        : " · 직접 선택"}
                      {event.importance !== "NORMAL" ? " · 중요" : ""}
                    </small>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              ))}
            </div>
            {editing && (
              <form
                className="service-section service-edit"
                onSubmit={(e) => {
                  e.preventDefault();
                  void serviceAction(async () => {
                    const startsAt = atTime(date, time);
                    const classification = manualCategory
                      ? {
                          categoryCode: category,
                          confidence: 1,
                          source: "TEMPLATE" as const,
                        }
                      : await classifyScheduleTitle(title.trim());
                    await editCalendarEvent({
                      ...editing,
                      displayTitle: title.trim(),
                      startsAt,
                      endsAt: new Date(
                        Date.parse(startsAt) + 90 * 60000,
                      ).toISOString(),
                      category: classification.categoryCode,
                      importance:
                        important || classification.categoryCode === "IMPORTANT"
                          ? "IMPORTANT"
                          : "NORMAL",
                    });
                    store.set({
                      classifications: {
                        ...store.classifications,
                        [editing.clientId]: classification,
                      },
                    });
                    setEditing(null);
                  });
                }}
              >
                <h2>일정 수정</h2>
                <label>
                  일정 이름
                  <input
                    required
                    maxLength={100}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label>
                  일정 유형
                  <select
                    value={category}
                    onChange={(event) => {
                      setCategory(event.target.value);
                      setManualCategory(true);
                    }}
                  >
                    {store.scheduleTypes.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label} · {item.wakeLeadMin}분 전
                      </option>
                    ))}
                  </select>
                  <span className="service-footnote">
                    {manualCategory
                      ? "직접 선택한 유형을 사용해요."
                      : "저장할 때 일정 이름을 AI가 다시 분류해요."}
                  </span>
                </label>
                <button
                  type="button"
                  className="service-secondary"
                  disabled={!title.trim() || store.busy}
                  onClick={() =>
                    void serviceAction(async () => {
                      const result = await classifyScheduleTitle(title.trim());
                      setCategory(result.categoryCode);
                      setManualCategory(false);
                    })
                  }
                >
                  AI로 유형 다시 분류
                </button>
                <label>
                  날짜
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label>
                  시작 시각
                  <input
                    type="time"
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </label>
                <label className="service-checkbox">
                  <input
                    type="checkbox"
                    checked={important}
                    onChange={(e) => setImportant(e.target.checked)}
                  />
                  중요한 일정
                </label>
                <button disabled={store.busy} className="service-primary">
                  일정 저장
                </button>
                <button
                  type="button"
                  className="service-secondary"
                  onClick={() => setEditing(null)}
                >
                  닫기
                </button>
              </form>
            )}
            <button
              className="service-secondary"
              disabled={store.busy}
              onClick={() => void serviceAction(generateServicePlan)}
            >
              변경된 일정으로 계획 다시 계산
            </button>
            <Link className="service-primary" href="/">
              기상 계획 확인하기
            </Link>
          </>
        )}
      </div>
    </AppShell>
  );
}
