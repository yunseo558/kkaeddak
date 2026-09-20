"use client";

import { useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useCurrentFlowStore } from "@/features/current-flow/model/current-flow-store";
import {
  useServiceStore,
  type CalendarEntry,
  type ScheduleClassification,
} from "../model/service-store";
import { atTime, clockTime, localDate } from "../model/service-policy";
import {
  classifyScheduleTitle,
  editCalendarEvent,
  generateServicePlan,
  serviceAction,
  serviceNow,
} from "../lib/service-actions";
import { SetupGuidanceScene } from "./home-alarm-scene";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type ClassificationCache = {
  title: string;
  result?: ScheduleClassification;
  promise?: Promise<ScheduleClassification>;
};

const normalizeTitle = (value: string) => value.trim();

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
  const completed = useCurrentFlowStore((state) => state.onboardingCompleted);
  const initialDate = store.plan?.localDate ?? localDate(serviceNow());
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [cursor, setCursor] = useState(initialDate.slice(0, 7));
  const [editing, setEditing] = useState<CalendarEntry | null>(null);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("11:00");
  const [date, setDate] = useState(initialDate);
  const [important, setImportant] = useState(false);
  const [category, setCategory] = useState("OTHER");
  const [classifying, setClassifying] = useState(false);
  const [classificationFeedback, setClassificationFeedback] = useState("");
  const titleRef = useRef("");
  const categoryRef = useRef("OTHER");
  const manualCategoryRef = useRef(false);
  const classificationCacheRef = useRef<ClassificationCache | null>(null);
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

  const setCurrentCategory = (nextCategory: string) => {
    categoryRef.current = nextCategory;
    setCategory(nextCategory);
  };

  const setCurrentManualCategory = (manual: boolean) => {
    manualCategoryRef.current = manual;
  };

  const classificationLabel = (result: ScheduleClassification) => {
    const label =
      store.scheduleTypes.find((item) => item.code === result.categoryCode)
        ?.label ?? "기타";
    return `${result.source === "MODEL" ? "AI" : "기본"} 분류 완료 · ${label}`;
  };

  const classifyTitleOnce = (scheduleTitle: string) => {
    const normalizedTitle = normalizeTitle(scheduleTitle);
    const cached = classificationCacheRef.current;
    if (cached?.title === normalizedTitle) {
      if (cached.result) return Promise.resolve(cached.result);
      if (cached.promise) return cached.promise;
    }

    const promise = classifyScheduleTitle(normalizedTitle);
    classificationCacheRef.current = {
      title: normalizedTitle,
      promise,
    };
    void promise.then(
      (result) => {
        if (classificationCacheRef.current?.promise === promise) {
          classificationCacheRef.current = {
            title: normalizedTitle,
            result,
          };
        }
      },
      () => {
        if (classificationCacheRef.current?.promise === promise)
          classificationCacheRef.current = null;
      },
    );
    return promise;
  };

  const applyClassification = (
    scheduleTitle: string,
    result: ScheduleClassification,
  ) => {
    if (
      normalizeTitle(titleRef.current) !== scheduleTitle ||
      manualCategoryRef.current
    )
      return false;
    setCurrentCategory(result.categoryCode);
    setClassificationFeedback(classificationLabel(result));
    return true;
  };

  const openEditor = (event?: CalendarEntry) => {
    if (event) {
      const scheduleTitle = normalizeTitle(event.displayTitle ?? "일정");
      const existingClassification = store.classifications[event.clientId];
      setEditing(event);
      titleRef.current = scheduleTitle;
      setTitle(scheduleTitle);
      setTime(clockTime(event.startsAt));
      setDate(localDate(event.startsAt));
      setImportant(event.importance !== "NORMAL");
      setCurrentCategory(event.category);
      setCurrentManualCategory(!existingClassification);
      classificationCacheRef.current = existingClassification
        ? { title: scheduleTitle, result: existingClassification }
        : null;
      setClassifying(false);
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
    titleRef.current = "";
    setTitle("");
    setDate(selectedDate);
    setTime("11:00");
    setImportant(false);
    setCurrentCategory("OTHER");
    setCurrentManualCategory(false);
    classificationCacheRef.current = null;
    setClassifying(false);
    setClassificationFeedback("");
  };

  const classifyOnBlur = () => {
    const scheduleTitle = normalizeTitle(titleRef.current);
    if (!scheduleTitle || manualCategoryRef.current) return;
    setClassifying(true);
    setClassificationFeedback("");
    void classifyTitleOnce(scheduleTitle)
      .then((result) => applyClassification(scheduleTitle, result))
      .catch(() => {
        if (
          normalizeTitle(titleRef.current) === scheduleTitle &&
          !manualCategoryRef.current
        )
          setClassificationFeedback(
            "AI 분류를 완료하지 못했어요. 일정 유형을 직접 선택해 주세요.",
          );
      })
      .finally(() => {
        if (normalizeTitle(titleRef.current) === scheduleTitle)
          setClassifying(false);
      });
  };

  if (!completed || !store.calendarConnected) {
    return (
      <AppShell currentStep="분석" homeScene>
        <div className="service-home">
          <header className="service-heading"><div><p className="service-kicker">내일 일정</p><h1>캘린더</h1></div><span className="service-tag">분석 전</span></header>
          <SetupGuidanceScene
            description={completed ? "캘린더 샘플을 연결하면 첫 일정의 시각과 유형을 판단해 언제부터 알람이 필요한지 계산할게요." : "기본 설정에서 캘린더를 연결하면 내일 첫 일정을 기준으로 기상 난이도를 분석할게요."}
            href={completed ? "/settings/connections" : "/onboarding"}
            label={completed ? "캘린더 연동하기" : "기본 설정하기"}
            title={completed ? "내일 일정을 연결해 주세요" : "첫 일정부터 확인할게요"}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell currentStep="분석" homeScene>
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
                  <span><strong>{event.displayTitle}</strong><small>{store.scheduleTypes.find((item) => item.code === event.category)?.label ?? "기타"}{store.classifications[event.clientId]?.source === "MODEL" ? " · AI 분류" : store.classifications[event.clientId] ? " · 기본 분류" : " · 직접 선택"}</small></span>
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
              const scheduleTitle = normalizeTitle(titleRef.current);
              const startsAt = atTime(date, time);
              let classification: ScheduleClassification;
              if (manualCategoryRef.current) {
                classification = {
                  categoryCode: categoryRef.current,
                  confidence: 1,
                  source: "TEMPLATE",
                };
              } else {
                setClassifying(true);
                try {
                  classification = await classifyTitleOnce(scheduleTitle);
                  applyClassification(scheduleTitle, classification);
                } catch {
                  classification = {
                    categoryCode: categoryRef.current,
                    confidence: 1,
                    source: "TEMPLATE",
                  };
                  setClassificationFeedback(
                    "AI 분류를 완료하지 못해 현재 선택한 유형으로 저장했어요.",
                  );
                } finally {
                  if (normalizeTitle(titleRef.current) === scheduleTitle)
                    setClassifying(false);
                }
              }
              await editCalendarEvent({ ...editing, displayTitle: scheduleTitle, startsAt, endsAt: new Date(Date.parse(startsAt) + 90 * 60000).toISOString(), category: classification.categoryCode, importance: important || classification.categoryCode === "IMPORTANT" ? "IMPORTANT" : "NORMAL" });
              store.set({ classifications: { ...store.classifications, [editing.clientId]: classification } });
              setSelectedDate(date);
              setCursor(date.slice(0, 7));
              setEditing(null);
            });
          }}>
            <div className="service-row"><h2>{editing.startsAt ? "일정 수정" : "일정 추가"}</h2><button type="button" className="service-text-button" onClick={() => setEditing(null)}>닫기</button></div>
            <label>일정 이름<input required maxLength={100} value={title} onChange={(event) => { const nextTitle = event.target.value; const normalizedTitle = normalizeTitle(nextTitle); if (classificationCacheRef.current?.title !== normalizedTitle) { setClassifying(false); setClassificationFeedback(""); } titleRef.current = nextTitle; setTitle(nextTitle); }} onBlur={classifyOnBlur} /><span className="service-footnote">일정 이름을 입력하고 다른 칸으로 이동하면 AI가 자동으로 분류해요.</span></label>
            <label>일정 유형<select value={category} onChange={(event) => { setCurrentCategory(event.target.value); setCurrentManualCategory(true); setClassifying(false); setClassificationFeedback("직접 선택한 유형을 사용해요."); }}>{store.scheduleTypes.map((item) => <option key={item.code} value={item.code}>{item.label} · {item.wakeLeadMin}분 전</option>)}</select><span className="service-footnote ai-classification-feedback">{classifying ? "AI가 일정 유형을 확인하고 있어요…" : classificationFeedback || (category === "OTHER" ? "기타는 AI가 일정명을 다른 유형으로 구별하지 못했을 때 적용해요." : "현재 일정 유형을 기상 계획에 사용해요.")}</span></label>
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
