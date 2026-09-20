"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useServiceStore, type CalendarEntry } from "../model/service-store";
import { atTime, clockTime, localDate } from "../model/service-policy";
import {
  classifyScheduleTitle,
  editCalendarEvent,
  generateServicePlan,
  serviceAction,
  serviceNow,
} from "../lib/service-actions";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function monthTitle(cursor: string) {
  const [year, month] = cursor.split("-").map(Number);
  return `${year}년 ${month}월`;
}

function monthDays(cursor: string) {
  const [year, month] = cursor.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const count = new Date(year, month, 0).getDate();
  return [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: count }, (_, index) => index + 1),
  ];
}

function moveMonth(cursor: string, amount: number) {
  const [year, month] = cursor.split("-").map(Number);
  const next = new Date(year, month - 1 + amount, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

export function ServiceCalendar() {
  const store = useServiceStore();
  const initialDate = store.plan?.localDate ?? localDate(serviceNow());
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [cursor, setCursor] = useState(initialDate.slice(0, 7));
  const [editing, setEditing] = useState<CalendarEntry | null>(null);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("11:00");
  const [date, setDate] = useState(initialDate);
  const [important, setImportant] = useState(false);
  const [category, setCategory] = useState("OTHER");
  const [manualCategory, setManualCategory] = useState(false);
  const [classificationFeedback, setClassificationFeedback] = useState("");
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEntry[]>();
    [...store.events]
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .forEach((event) => {
        const key = localDate(event.startsAt);
        grouped.set(key, [...(grouped.get(key) ?? []), event]);
      });
    return grouped;
  }, [store.events]);
  const selectedEvents = eventsByDate.get(selectedDate) ?? [];

  const openEditor = (event?: CalendarEntry) => {
    if (event) {
      setEditing(event);
      setTitle(event.displayTitle ?? "일정");
      setTime(clockTime(event.startsAt));
      setDate(localDate(event.startsAt));
      setImportant(event.importance !== "NORMAL");
      setCategory(event.category);
      setManualCategory(!store.classifications[event.clientId]);
      setClassificationFeedback("");
      return;
    }
    setEditing({
      clientId: crypto.randomUUID(),
      category: "OTHER",
      importance: "NORMAL",
      locationMode: "ONSITE",
      startsAt: "",
      endsAt: "",
    });
    setTitle("");
    setDate(selectedDate);
    setTime("11:00");
    setImportant(false);
    setCategory("OTHER");
    setManualCategory(false);
    setClassificationFeedback("");
  };

  const classifyOnBlur = () => {
    const scheduleTitle = title.trim();
    if (!scheduleTitle || manualCategory) return;
    setClassificationFeedback("AI가 일정 유형을 확인하고 있어요…");
    void serviceAction(async () => {
      const result = await classifyScheduleTitle(scheduleTitle);
      setCategory(result.categoryCode);
      const label =
        store.scheduleTypes.find((item) => item.code === result.categoryCode)
          ?.label ?? "기타";
      setClassificationFeedback(`AI 분류 완료 · ${label}`);
    });
  };

  if (!store.calendarConnected) {
    return (
      <AppShell currentStep="분석">
        <div className="service-home">
          <header className="service-heading"><h1>캘린더</h1></header>
          <section className="service-empty-state">
            <div className="service-empty-icon" aria-hidden="true">📅</div>
            <h2>캘린더 연동이 필요해요</h2>
            <p>연동 설정에서 일정을 불러오면 AI가 기상 시각을 계산해요.</p>
            <Link className="service-primary" href="/settings/connections">연동 설정으로 가기</Link>
          </section>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell currentStep="분석">
      <div className="service-home calendar-screen">
        <header className="service-heading">
          <div><p className="service-kicker">연동 완료</p><h1>캘린더</h1></div>
          <button className="calendar-add-button" onClick={() => openEditor()} aria-label="일정 추가">+</button>
        </header>
        {store.message && <p role="alert" className="service-error">{store.message}</p>}
        <section className="month-calendar" aria-label={monthTitle(cursor)}>
          <header className="month-calendar-header">
            <button aria-label="이전 달" onClick={() => setCursor(moveMonth(cursor, -1))}>‹</button>
            <h2>{monthTitle(cursor)}</h2>
            <button aria-label="다음 달" onClick={() => setCursor(moveMonth(cursor, 1))}>›</button>
          </header>
          <div className="month-calendar-weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="month-calendar-grid">
            {monthDays(cursor).map((day, index) => {
              if (!day) return <span className="month-calendar-blank" key={`blank-${index}`} />;
              const dayDate = `${cursor}-${String(day).padStart(2, "0")}`;
              const dayEvents = eventsByDate.get(dayDate) ?? [];
              return (
                <button
                  aria-label={`${day}일${dayEvents.length ? `, 일정 ${dayEvents.length}개` : ""}`}
                  data-selected={selectedDate === dayDate}
                  key={dayDate}
                  onClick={() => setSelectedDate(dayDate)}
                >
                  <span>{day}</span>
                  {dayEvents.length > 0 && <i data-important={dayEvents.some((event) => event.importance !== "NORMAL")} />}
                </button>
              );
            })}
          </div>
        </section>

        <section className="selected-day-section">
          <div className="service-row">
            <div><p className="service-kicker">{selectedDate.replaceAll("-", ". ")}</p><h2>{selectedEvents.length ? `${selectedEvents.length}개의 일정` : "예정된 일정이 없어요"}</h2></div>
            <button className="service-text-button" onClick={() => openEditor()}>일정 추가</button>
          </div>
          {selectedEvents.length > 0 ? (
            <div className="selected-event-list">
              {selectedEvents.map((event) => (
                <button key={event.clientId} className="selected-event" onClick={() => openEditor(event)}>
                  <time>{clockTime(event.startsAt)}</time>
                  <span><strong>{event.displayTitle}</strong><small>{store.scheduleTypes.find((item) => item.code === event.category)?.label ?? "기타"}{store.classifications[event.clientId] ? " · AI 분류" : " · 직접 선택"}</small></span>
                  <span aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          ) : <p className="service-muted">원하는 날짜를 누르고 일정을 추가할 수 있어요.</p>}
        </section>

        {editing && (
          <form className="service-section service-edit calendar-editor" onSubmit={(event) => {
            event.preventDefault();
            void serviceAction(async () => {
              const startsAt = atTime(date, time);
              const classification = manualCategory ? { categoryCode: category, confidence: 1, source: "TEMPLATE" as const } : await classifyScheduleTitle(title.trim());
              await editCalendarEvent({ ...editing, displayTitle: title.trim(), startsAt, endsAt: new Date(Date.parse(startsAt) + 90 * 60000).toISOString(), category: classification.categoryCode, importance: important || classification.categoryCode === "IMPORTANT" ? "IMPORTANT" : "NORMAL" });
              store.set({ classifications: { ...store.classifications, [editing.clientId]: classification } });
              setSelectedDate(date);
              setCursor(date.slice(0, 7));
              setEditing(null);
            });
          }}>
            <div className="service-row"><h2>{editing.startsAt ? "일정 수정" : "일정 추가"}</h2><button type="button" className="service-text-button" onClick={() => setEditing(null)}>닫기</button></div>
            <label>일정 이름<input required maxLength={100} value={title} onChange={(event) => { setTitle(event.target.value); setManualCategory(false); setClassificationFeedback(""); }} onBlur={classifyOnBlur} /><span className="service-footnote">일정 이름을 입력하고 다른 칸으로 이동하면 AI가 자동으로 분류해요.</span></label>
            <label>일정 유형<select value={category} onChange={(event) => { setCategory(event.target.value); setManualCategory(true); setClassificationFeedback("직접 선택한 유형을 사용해요."); }}>{store.scheduleTypes.map((item) => <option key={item.code} value={item.code}>{item.label} · {item.wakeLeadMin}분 전</option>)}</select><span className="service-footnote ai-classification-feedback">{classificationFeedback || (category === "OTHER" ? "기타는 AI가 일정명을 다른 유형으로 구별하지 못했을 때 적용해요." : "현재 일정 유형을 기상 계획에 사용해요.")}</span></label>
            <label>날짜<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <label>시작 시각<input type="time" required value={time} onChange={(event) => setTime(event.target.value)} /></label>
            <label className="service-checkbox"><input type="checkbox" checked={important} onChange={(event) => setImportant(event.target.checked)} />중요한 일정</label>
            <button disabled={store.busy} className="service-primary">일정 저장</button>
          </form>
        )}
        <button className="service-secondary" disabled={store.busy} onClick={() => void serviceAction(generateServicePlan)}>변경된 일정으로 계획 다시 계산</button>
      </div>
    </AppShell>
  );
}
