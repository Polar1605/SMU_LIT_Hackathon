"use client";

/**
 * A month grid of what falls due, and what each date actually asks of you.
 *
 * Dates are placed by the day action must be TAKEN, not the day the event
 * happens. A renewal 74 days out with 60 days' notice is a 14-day problem, and
 * a calendar that plotted the renewal date would show it in the wrong month
 * entirely — comfortably far away, right up until it was too late.
 *
 * Obligations the contracts never date cannot go in a grid at all. They are
 * listed underneath rather than dropped, because an obligation nobody can
 * schedule is exactly the kind that goes unmet.
 */

import { useMemo, useState } from "react";
import {
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isSameDay,
  parseISO,
  startOfMonth,
} from "date-fns";
import type { CalendarEvent, Citation, ContractResult } from "@/lib/types";
import { CONFIDENCE_VAR, citationRef, daysLabel, formatDate } from "@/lib/display";
import { ConfidenceMark } from "./ConfidenceMark";
import { EvidenceViewer } from "./EvidenceViewer";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** Monday-first offset, because a business week starts on Monday. */
function weekdayOffset(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function CalendarGrid({
  events,
  contracts,
  asOf,
  windowDays,
}: {
  events: CalendarEvent[];
  contracts: ContractResult[];
  asOf: string;
  windowDays: number;
}) {
  const today = parseISO(asOf);

  const dated = useMemo(() => events.filter((e) => e.actionDeadline !== null), [events]);
  const undated = useMemo(() => events.filter((e) => e.actionDeadline === null), [events]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of dated) {
      const key = event.actionDeadline!.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return map;
  }, [dated]);

  /** Opens on the next thing that needs doing, which is the question being asked. */
  const firstUpcoming = dated.find((e) => (e.daysUntilDeadline ?? -1) >= 0) ?? dated[0];
  const [selected, setSelected] = useState<string | null>(firstUpcoming?.actionDeadline?.slice(0, 10) ?? null);
  const [monthOffset, setMonthOffset] = useState(0);
  const [evidence, setEvidence] = useState<{ citation: Citation; contract: ContractResult } | null>(null);

  const month = addMonths(startOfMonth(today), monthOffset);
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const lead = weekdayOffset(monthStart);

  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: monthEnd.getDate() }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];

  const selectedEvents = selected ? (byDate.get(selected) ?? []) : [];
  const inWindow = (date: Date) => {
    const delta = differenceInCalendarDays(date, today);
    return delta >= 0 && delta <= windowDays;
  };

  const showCitation = (citation: Citation) => {
    const contract = contracts.find((c) => c.docId === citation.docId);
    if (contract) setEvidence({ citation, contract });
  };

  return (
    <section className="card" aria-labelledby="calendar-heading">
      <header className="card-head flex items-center justify-between px-4 py-2.5">
        <h2 id="calendar-heading" className="text-[1.02rem]">
          {format(month, "MMMM yyyy")}
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="btn px-2 py-1"
            onClick={() => setMonthOffset((n) => n - 1)}
            aria-label="Previous month"
          >
            ‹
          </button>
          <button
            type="button"
            className="btn px-2 py-1"
            onClick={() => setMonthOffset(0)}
            disabled={monthOffset === 0}
            style={{ opacity: monthOffset === 0 ? 0.45 : 1 }}
          >
            Today
          </button>
          <button
            type="button"
            className="btn px-2 py-1"
            onClick={() => setMonthOffset((n) => n + 1)}
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </header>

      <div className="px-3 pb-3 pt-2.5">
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((day, i) => (
            <div
              key={i}
              className="ui pb-1 text-center text-[10px] uppercase"
              style={{ color: "var(--ink-faint)" }}
            >
              {day}
            </div>
          ))}

          {cells.map((date, i) => {
            if (!date) return <div key={`pad-${i}`} />;

            const key = format(date, "yyyy-MM-dd");
            const dayEvents = byDate.get(key) ?? [];
            const isToday = isSameDay(date, today);
            const isSelected = key === selected;
            const active = dayEvents.length > 0;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                aria-label={`${format(date, "d MMMM yyyy")}, ${dayEvents.length} item${dayEvents.length === 1 ? "" : "s"}`}
                aria-pressed={isSelected}
                className="row-hover relative flex aspect-square flex-col items-center justify-center rounded-md border text-[0.82rem]"
                style={{
                  // Every date is clickable, including empty ones: "nothing falls
                  // due here" is an answer, and a grid where half the cells ignore
                  // you teaches people not to trust the other half.
                  cursor: "pointer",
                  borderColor: isSelected ? "var(--ink)" : isToday ? "var(--inferred)" : "transparent",
                  background: isSelected
                    ? "var(--surface-sunk)"
                    : inWindow(date)
                      ? "var(--surface-2)"
                      : "transparent",
                  color: active ? "var(--ink)" : inWindow(date) ? "var(--ink-soft)" : "var(--ink-faint)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {date.getDate()}
                <span className="mt-0.5 flex h-1.5 items-center gap-0.5">
                  {dayEvents.slice(0, 3).map((event, n) => (
                    <span
                      key={n}
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: CONFIDENCE_VAR[event.confidence] }}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* What the selected date actually asks of you. */}
      <div className="border-t px-4 py-3.5" style={{ borderColor: "var(--border)" }}>
        {selected === null ? (
          <p className="text-[0.85rem]" style={{ color: "var(--ink-soft)" }}>
            No dated obligations were found in these contracts.
          </p>
        ) : selectedEvents.length === 0 ? (
          <p className="text-[0.85rem]" style={{ color: "var(--ink-soft)" }}>
            Nothing falls due on {formatDate(selected)}.
          </p>
        ) : (
          <>
            <div className="mb-2.5 flex items-baseline justify-between gap-3">
              <h3 className="text-[0.95rem]">{formatDate(selected)}</h3>
              <span className="ui text-[0.75rem]" style={{ color: "var(--ink-faint)" }}>
                {daysLabel(differenceInCalendarDays(parseISO(selected), today))}
              </span>
            </div>
            <ul className="space-y-3">
              {selectedEvents.map((event) => (
                <li key={event.id}>
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <p className="min-w-0 flex-1 text-[0.88rem] font-medium">{event.title}</p>
                    <ConfidenceMark level={event.confidence} size="small" />
                  </div>
                  <p className="mt-0.5 text-[0.8rem]" style={{ color: "var(--ink-soft)" }}>
                    {event.docTitle}
                    {event.eventDate && event.eventDate !== event.actionDeadline && (
                      <> — protects the deadline of {formatDate(event.eventDate)}</>
                    )}
                  </p>
                  {event.caveat && (
                    <p
                      className="mt-1.5 border-l-2 pl-2 text-[0.8rem] leading-snug"
                      style={{ borderColor: "var(--uncertain)", color: "var(--ink-soft)" }}
                    >
                      {event.caveat}
                    </p>
                  )}
                  {event.citations.length > 0 && (
                    <button
                      type="button"
                      className="cite ref mt-1.5"
                      onClick={() => showCitation(event.citations[0])}
                    >
                      {citationRef(event.citations[0])}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {undated.length > 0 && (
        <details className="border-t px-4 py-2.5" style={{ borderColor: "var(--border)" }}>
          <summary className="ui cursor-pointer text-[0.8rem]" style={{ color: "var(--uncertain)" }}>
            {undated.length} obligation{undated.length === 1 ? "" : "s"} with no date the contract fixes
          </summary>
          <p className="mt-2 text-[0.8rem] leading-snug" style={{ color: "var(--ink-soft)" }}>
            These are owed, but each is tied to an event the document never dates — an invoice being
            issued, say. No due date can honestly be given, so none is shown on the grid.
          </p>
          <ul className="mt-2 space-y-2.5">
            {undated.map((event) => (
              <li key={event.id}>
                <p className="text-[0.84rem] font-medium">{event.title}</p>
                <p className="text-[0.8rem]" style={{ color: "var(--ink-soft)" }}>
                  {event.docTitle}
                </p>
                {event.caveat && (
                  <p className="mt-1 text-[0.8rem] leading-snug" style={{ color: "var(--ink-soft)" }}>
                    {event.caveat}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {evidence && (
        <EvidenceViewer
          citation={evidence.citation}
          contract={evidence.contract}
          onClose={() => setEvidence(null)}
        />
      )}
    </section>
  );
}

/**
 * The single most urgent thing, given the space it deserves.
 *
 * The number is days remaining rather than a date, because "13 days" is the
 * form the question is actually asked in.
 */
export function NextDeadline({ events }: { events: CalendarEvent[] }) {
  const next = events.find((e) => e.actionDeadline !== null && (e.daysUntilDeadline ?? -1) >= 0);
  if (!next) return null;

  const urgent = (next.daysUntilDeadline ?? 99) <= 30;

  return (
    <section
      className="card mb-4 overflow-hidden"
      style={{ borderColor: urgent ? "var(--alert)" : "var(--border)" }}
      aria-label="Next action deadline"
    >
      <div className="flex items-stretch">
        <div
          className="flex w-28 shrink-0 flex-col items-center justify-center px-3 py-4 text-center"
          style={{ background: urgent ? "var(--alert)" : "var(--header)", color: "#fff" }}
        >
          <span className="text-[2.1rem] font-semibold leading-none">{next.daysUntilDeadline}</span>
          <span className="ui mt-1 text-[10px] uppercase tracking-wider" style={{ opacity: 0.82 }}>
            days to act
          </span>
        </div>
        <div className="min-w-0 flex-1 px-4 py-3">
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-[1rem]">{next.title}</h2>
            <ConfidenceMark level={next.confidence} size="small" />
          </div>
          <p className="text-[0.84rem]" style={{ color: "var(--ink-soft)" }}>
            {next.docTitle} — act by {formatDate(next.actionDeadline)}
            {next.eventDate && next.eventDate !== next.actionDeadline && (
              <> to stop it renewing on {formatDate(next.eventDate)}</>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
