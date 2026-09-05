"use client";

/**
 * Deadlines — a compact calendar and a next-deadline card on the left,
 * every dated obligation across the whole portfolio in order on the right.
 *
 * This tab keeps its own month-offset and selected-day state, deliberately
 * separate from the Calendar tab's — the design is explicit that the two
 * calendars never share navigation state.
 */

import { useMemo, useState } from "react";
import { addMonths, differenceInCalendarDays, endOfMonth, format, isSameDay, parseISO, startOfMonth } from "date-fns";
import type { CalendarEvent, Results } from "@/lib/types";
import { formatDate } from "@/lib/display";
import { kindOfEvent } from "@/lib/event-kind";
import { NextDeadlineCard } from "@/components/NextDeadlineCard";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function weekdayOffset(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function DeadlinesTab({ results, onOpenContract }: { results: Results; onOpenContract: (docId: string) => void }) {
  const today = parseISO(results.asOf);
  const dated = useMemo(() => results.calendar.filter((e) => e.actionDeadline !== null), [results]);
  const undated = useMemo(() => results.calendar.filter((e) => e.actionDeadline === null), [results]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of dated) {
      const key = event.actionDeadline!.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return map;
  }, [dated]);

  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(results.asOf);

  const month = addMonths(startOfMonth(today), monthOffset);
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const lead = weekdayOffset(monthStart);

  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: monthEnd.getDate() }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];

  const selectedEvents = selectedDate ? (byDate.get(selectedDate) ?? []) : [];
  const upcoming = [...dated].sort((a, b) => (a.actionDeadline! < b.actionDeadline! ? -1 : 1));

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "44px", alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 24rem", maxWidth: "30rem", minWidth: "min(22rem, 100%)", display: "flex", flexDirection: "column", gap: "22px" }}>
        <NextDeadlineCard events={results.calendar} />

        <section aria-labelledby="deadlines-calendar-heading" style={{ background: "var(--card)", border: "1px solid var(--rule)", borderRadius: "3px" }}>
          <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--rule)", background: "var(--wash)", borderRadius: "3px 3px 0 0" }}>
            <h2 id="deadlines-calendar-heading" style={{ margin: 0, fontSize: "1.24rem", letterSpacing: "-0.008em" }}>
              {format(month, "MMMM yyyy")}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button type="button" aria-label="Previous month" className="btn" onClick={() => setMonthOffset((n) => n - 1)}>
                ‹
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setMonthOffset(0);
                  setSelectedDate(results.asOf);
                }}
                style={{ opacity: monthOffset === 0 ? 0.45 : 1 }}
              >
                Today
              </button>
              <button type="button" aria-label="Next month" className="btn" onClick={() => setMonthOffset((n) => n + 1)}>
                ›
              </button>
            </div>
          </header>

          <div style={{ padding: "14px 16px 16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "5px", maxWidth: "25rem" }}>
              {WEEKDAYS.map((d, i) => (
                <div key={i} className="ref" style={{ paddingBottom: "6px", textAlign: "center", fontWeight: 500, letterSpacing: "0.08em", fontSize: "10px", color: "var(--muted-strong)" }}>
                  {d}
                </div>
              ))}
              {cells.map((date, i) => {
                if (!date) return <div key={`pad-${i}`} />;
                const key = format(date, "yyyy-MM-dd");
                const dayEvents = byDate.get(key) ?? [];
                const isToday = isSameDay(date, today);
                const isSelected = key === selectedDate;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={`${format(date, "d MMMM yyyy")}, ${dayEvents.length} item${dayEvents.length === 1 ? "" : "s"}`}
                    onClick={() => setSelectedDate(key)}
                    className="ref row-hover"
                    style={{
                      position: "relative",
                      display: "flex",
                      minHeight: "46px",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      border: `1px solid ${isSelected ? "var(--ink)" : isToday ? "var(--accent-blue)" : "transparent"}`,
                      borderRadius: "3px",
                      fontSize: "0.9rem",
                      cursor: "pointer",
                      background: isSelected ? "var(--selected-cal)" : "transparent",
                      fontWeight: dayEvents.length > 0 ? 600 : 400,
                      color: dayEvents.length > 0 ? "var(--ink)" : "var(--ink)",
                    }}
                  >
                    {date.getDate()}
                    <span style={{ marginTop: "2px", display: "flex", height: "6px", alignItems: "center", gap: "2px" }}>
                      {dayEvents.slice(0, 3).map((event, n) => (
                        <span key={n} style={{ display: "inline-block", height: "6px", width: "6px", borderRadius: "999px", background: kindOfEvent(event).color }} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--rule)", padding: "20px" }}>
            {selectedDate === null ? null : selectedEvents.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>Nothing falls on this day.</p>
            ) : (
              <>
                <div style={{ marginBottom: "10px", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px" }}>
                  <h3 style={{ margin: 0, fontSize: "1.1rem", letterSpacing: "-0.008em" }}>
                    {formatDate(selectedDate)}
                    {selectedDate === results.asOf && " · today"}
                  </h3>
                  <span className="ref" style={{ fontWeight: 600, letterSpacing: "0.01em", fontSize: "0.75rem", color: "var(--muted-strong)" }}>
                    {differenceInCalendarDays(parseISO(selectedDate), today)}d
                  </span>
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "12px" }}>
                  {selectedEvents.map((event) => {
                    const kind = kindOfEvent(event);
                    return (
                      <li key={event.id}>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", columnGap: "12px", rowGap: "4px" }}>
                          <p style={{ margin: 0, minWidth: 0, flex: 1, fontSize: "0.88rem", fontWeight: 500 }}>{event.title}</p>
                          <span className="ui" style={{ display: "inline-flex", flexShrink: 0, alignItems: "center", gap: "6px", borderRadius: "999px", padding: "2px 9px", fontSize: "9.5px", textTransform: "uppercase", letterSpacing: "0.1em", color: kind.color, background: kind.bg }}>
                            <span aria-hidden="true" style={{ display: "inline-block", height: "6px", width: "6px", borderRadius: "999px", background: kind.color }} />
                            {kind.kind}
                          </span>
                        </div>
                        <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
                          {event.docTitle}
                          {event.eventDate && event.eventDate !== event.actionDeadline && <> · protects the {formatDate(event.eventDate)} date</>}
                        </p>
                        {event.caveat && (
                          <p style={{ margin: "6px 0 0", borderLeft: "2px solid var(--uncertain)", paddingLeft: "8px", fontSize: "0.8rem", lineHeight: 1.4, color: "var(--muted)" }}>
                            {event.caveat}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenContract(event.docId)}
                          className="cite ref"
                          style={{ marginTop: "6px" }}
                        >
                          Open contract →
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          {undated.length > 0 && (
            <details style={{ borderTop: "1px solid var(--rule)", padding: "14px 20px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, letterSpacing: "0.01em", fontSize: "0.8rem", color: "var(--uncertain)" }}>
                {undated.length} obligation{undated.length === 1 ? "" : "s"} the contract never dates
              </summary>
              <p style={{ margin: "8px 0 0", fontSize: "0.8rem", lineHeight: 1.4, color: "var(--muted)" }}>
                These are owed, but each is tied to an event the document never dates — an invoice being issued, say. No
                due date can honestly be given, so none is shown on the grid.
              </p>
              <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
                {undated.map((event) => (
                  <li key={event.id}>
                    <p style={{ margin: 0, fontSize: "0.84rem", fontWeight: 500 }}>{event.title}</p>
                    <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted)" }}>{event.docTitle}</p>
                    {event.caveat && (
                      <p style={{ margin: "4px 0 0", fontSize: "0.8rem", lineHeight: 1.4, color: "var(--muted)" }}>{event.caveat}</p>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>

      <div style={{ flex: "1 1 20rem", minWidth: "min(20rem, 100%)" }}>
        <h2 className="ui" style={{ margin: "0 0 14px", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--muted-strong)" }}>
          Everything dated, in order
        </h2>
        {upcoming.length === 0 ? (
          <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Nothing in this portfolio has a fixed date.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {upcoming.map((event) => {
              const kind = kindOfEvent(event);
              const urgent = (event.daysUntilDeadline ?? 999) <= 30;
              return (
                <li
                  key={event.id}
                  style={{ display: "grid", gridTemplateColumns: "7.5rem minmax(0, 1fr) auto", columnGap: "20px", rowGap: "4px", alignItems: "baseline", padding: "14px 0", borderTop: "1px solid var(--rule)" }}
                >
                  <span className="ref" style={{ fontSize: "0.78rem", letterSpacing: "0.02em", color: urgent ? "var(--accent-blue)" : "var(--muted-light)" }}>
                    {formatDate(event.actionDeadline)}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <button
                      type="button"
                      onClick={() => onOpenContract(event.docId)}
                      style={{ display: "block", textAlign: "left", border: 0, background: "transparent", cursor: "pointer", padding: 0, fontFamily: "var(--font-newsreader)", fontSize: "1.12rem", lineHeight: 1.35, color: "var(--ink)" }}
                    >
                      {event.title}
                    </button>
                    <span style={{ display: "block", marginTop: "3px", fontSize: "0.82rem", color: "var(--muted)" }}>{event.docTitle}</span>
                  </span>
                  <span className="ui" style={{ display: "inline-flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", color: kind.color }}>
                    <span aria-hidden="true" style={{ display: "inline-block", height: "6px", width: "6px", borderRadius: "999px", background: kind.color }} />
                    {event.daysUntilDeadline}d
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p style={{ margin: "18px 0 0", fontSize: "0.85rem", lineHeight: 1.6, color: "var(--muted)" }}>
          Dates shown in ultramarine are the last day to act, not the day the event happens. Obligations the contract
          never dates are listed at the foot of the calendar rather than given a guessed date.
        </p>
      </div>
    </div>
  );
}
