"use client";

/**
 * Calendar — the full month-by-month grid, with personal entries layered
 * alongside contract obligations. Own month-offset and selected-day state,
 * deliberately separate from the Deadlines tab's compact calendar.
 *
 * Personal entries are session-only local state — confirmed decision, no
 * persistence, matching the rest of the app (an uploaded portfolio is lost
 * on refresh too). They are never given a confidence level or a citation;
 * that is the one hard rule the design itself calls out, and it's why
 * `PersonalEntry` has no `confidence`/`citations` fields at all — there is
 * nothing to accidentally attach.
 */

import { useMemo, useState } from "react";
import { addMonths, endOfMonth, format, isSameDay, parseISO, startOfMonth } from "date-fns";
import type { CalendarEvent, Results } from "@/lib/types";
import { formatDate } from "@/lib/display";
import { CALENDAR_LEGEND, kindOfEvent, kindOfPersonalEntry, type PersonalEntry } from "@/lib/event-kind";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function weekdayOffset(date: Date): number {
  return (date.getDay() + 6) % 7;
}

interface DisplayItem {
  id: string;
  docId: string | null;
  title: string;
  docTitle: string;
  actionDeadline: string;
  eventDate: string | null;
  caveat: string | null;
  kind: ReturnType<typeof kindOfEvent>;
  mine: boolean;
}

export function CalendarTab({ results, onOpenContract }: { results: Results; onOpenContract: (docId: string) => void }) {
  const today = parseISO(results.asOf);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(results.asOf);
  const [userEvents, setUserEvents] = useState<PersonalEntry[]>([]);
  const [draftDate, setDraftDate] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNote, setDraftNote] = useState("");

  const dated = useMemo(() => results.calendar.filter((e) => e.actionDeadline !== null), [results]);

  const items: DisplayItem[] = useMemo(() => {
    const fromContracts: DisplayItem[] = dated.map((e) => ({
      id: e.id,
      docId: e.docId,
      title: e.title,
      docTitle: e.docTitle,
      actionDeadline: e.actionDeadline!,
      eventDate: e.eventDate,
      caveat: e.caveat,
      kind: kindOfEvent(e),
      mine: false,
    }));
    const fromMine: DisplayItem[] = userEvents.map((u) => ({
      id: u.id,
      docId: null,
      title: u.title,
      docTitle: "Your entry",
      actionDeadline: u.date,
      eventDate: null,
      caveat: u.note || null,
      kind: kindOfPersonalEntry(),
      mine: true,
    }));
    return [...fromContracts, ...fromMine];
  }, [dated, userEvents]);

  const byDate = useMemo(() => {
    const map = new Map<string, DisplayItem[]>();
    for (const item of items) map.set(item.actionDeadline, [...(map.get(item.actionDeadline) ?? []), item]);
    return map;
  }, [items]);

  const month = addMonths(startOfMonth(today), monthOffset);
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const lead = weekdayOffset(monthStart);
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: monthEnd.getDate() }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
  const monthCount = cells.reduce((n, d) => (d ? n + (byDate.get(format(d, "yyyy-MM-dd"))?.length ?? 0) : n), 0);

  function openItem(item: DisplayItem): void {
    if (item.mine || !item.docId) return;
    onOpenContract(item.docId);
  }

  function removeItem(id: string): void {
    setUserEvents((prev) => prev.filter((u) => u.id !== id));
  }

  const draftOk = draftDate.length > 0 && draftTitle.trim().length > 0;
  function addEntry(): void {
    if (!draftOk) return;
    const entry: PersonalEntry = { id: `mine${Date.now()}`, date: draftDate, title: draftTitle.trim(), note: draftNote.trim() };
    setUserEvents((prev) => [...prev, entry]);
    setDraftTitle("");
    setDraftNote("");
    setSelected(entry.date);
  }

  const selectedItems = selected ? (byDate.get(selected) ?? []) : [];

  const windowItems = items
    .filter((item) => {
      const days = Math.round((parseISO(item.actionDeadline).getTime() - today.getTime()) / 86400000);
      return days >= 0 && days <= 90;
    })
    .sort((a, b) => (a.actionDeadline < b.actionDeadline ? -1 : 1));

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "36px", alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 40rem", minWidth: "min(32rem, 100%)" }}>
        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: "18px", rowGap: "8px", paddingBottom: "14px", borderBottom: "1px solid var(--rule)" }}>
          <h2 style={{ margin: 0, fontSize: "1.6rem", letterSpacing: "-0.012em" }}>{format(month, "MMMM yyyy")}</h2>
          <p className="ref" style={{ margin: 0, fontSize: "0.7rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-strong)" }}>
            {monthCount} item{monthCount === 1 ? "" : "s"} this month
          </p>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
            <button type="button" aria-label="Previous month" className="btn" onClick={() => setMonthOffset((n) => n - 1)}>
              ‹
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setMonthOffset(0);
                setSelected(results.asOf);
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

        <div className="ref" style={{ display: "flex", flexWrap: "wrap", gap: "18px", padding: "12px 0 16px", fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}>
          {CALENDAR_LEGEND.map((kind) => (
            <span key={kind.kind} style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}>
              <span aria-hidden="true" style={{ display: "inline-block", height: "8px", width: "8px", borderRadius: "2px", background: kind.color }} />
              {kind.kind}
            </span>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "1px", background: "var(--rule)", border: "1px solid var(--rule)" }}>
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="ref" style={{ background: "var(--wash)", padding: "8px 6px", textAlign: "center", fontWeight: 500, letterSpacing: "0.1em", fontSize: "10px", color: "var(--muted-strong)" }}>
              {d}
            </div>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={`pad-${i}`} style={{ background: "var(--wash-alt)" }} />;
            const key = format(date, "yyyy-MM-dd");
            const dayItems = byDate.get(key) ?? [];
            const isToday = isSameDay(date, today);
            const isSelected = key === selected;
            return (
              <div
                key={key}
                onClick={() => setSelected(key)}
                style={{
                  minHeight: "104px",
                  padding: "6px 6px 8px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  cursor: "pointer",
                  background: isSelected ? "var(--selected-cal)" : "var(--card)",
                }}
              >
                <span
                  className="ref"
                  style={{
                    fontSize: "0.78rem",
                    color: isToday ? "#fbfcfe" : "var(--muted-strong)",
                    background: isToday ? "var(--accent-blue)" : undefined,
                    borderRadius: isToday ? "999px" : undefined,
                    padding: isToday ? "1px 6px" : undefined,
                    alignSelf: isToday ? "flex-start" : undefined,
                    fontWeight: isSelected && !isToday ? 600 : 400,
                  }}
                >
                  {date.getDate()}
                </span>
                {dayItems.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openItem(item);
                    }}
                    title={`${item.docTitle} — ${item.title}`}
                    className="row-hover"
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      border: 0,
                      borderLeft: `3px solid ${item.kind.color}`,
                      borderRadius: "2px",
                      cursor: "pointer",
                      padding: "3px 5px",
                      fontSize: "0.7rem",
                      lineHeight: 1.25,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      background: item.kind.bg,
                      color: "var(--ink)",
                    }}
                  >
                    {item.title}
                  </button>
                ))}
                {dayItems.length > 3 && (
                  <span className="ref" style={{ fontSize: "0.62rem", letterSpacing: "0.04em", color: "var(--muted-strong)" }}>
                    +{dayItems.length - 3} more
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ flex: "1 1 22rem", minWidth: "min(21rem, 100%)", display: "flex", flexDirection: "column", gap: "30px" }}>
        <section style={{ background: "var(--card)", border: "1px solid var(--rule)", borderRadius: "3px" }}>
          <header style={{ padding: "12px 18px", borderBottom: "1px solid var(--rule)", background: "var(--wash)" }}>
            <h3 style={{ margin: 0, fontSize: "1.16rem" }}>
              {selected ? formatDate(selected) : "No day selected"}
              {selected === results.asOf && " · today"}
            </h3>
          </header>
          {selectedItems.length === 0 ? (
            <p style={{ margin: 0, padding: "14px 18px", fontSize: "0.85rem", color: "var(--muted)" }}>
              Nothing falls on this day. Add your own entry below.
            </p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {selectedItems.map((item) => (
                <li key={item.id} style={{ borderBottom: "1px solid var(--wash-alt)", padding: "13px 18px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", columnGap: "10px" }}>
                    <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 500, lineHeight: 1.3 }}>{item.title}</p>
                    <span className="ui" style={{ flexShrink: 0, fontSize: "9.5px", letterSpacing: "0.11em", textTransform: "uppercase", color: item.kind.color }}>
                      {item.kind.kind}
                    </span>
                  </div>
                  <p style={{ margin: "3px 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
                    {item.mine
                      ? item.caveat || "Your own entry"
                      : `${item.docTitle}${item.eventDate && item.eventDate !== item.actionDeadline ? ` · protects the ${formatDate(item.eventDate)} date` : ""}`}
                  </p>
                  <div style={{ marginTop: "7px", display: "flex", flexWrap: "wrap", gap: "12px" }}>
                    {!item.mine && (
                      <button type="button" onClick={() => openItem(item)} className="cite ref">
                        Open contract →
                      </button>
                    )}
                    {item.mine && (
                      <button type="button" onClick={() => removeItem(item.id)} className="cite ref" style={{ color: "var(--muted)" }}>
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div style={{ borderTop: "1px solid var(--rule)", padding: "14px 18px 18px", display: "flex", flexDirection: "column", gap: "9px" }}>
            <p className="ui" style={{ margin: 0, fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--muted-strong)" }}>
              Add your own entry
            </p>
            <input
              type="date"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              className="ref"
              style={{ border: "1px solid var(--input-border)", borderRadius: "2px", padding: "7px 9px", fontSize: "0.78rem", color: "var(--ink)", background: "var(--card)" }}
            />
            <input
              type="text"
              placeholder="What is due"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              style={{ border: "1px solid var(--input-border)", borderRadius: "2px", padding: "7px 9px", fontSize: "0.85rem", color: "var(--ink)", background: "var(--card)" }}
            />
            <input
              type="text"
              placeholder="Note (optional)"
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
              style={{ border: "1px solid var(--input-border)", borderRadius: "2px", padding: "7px 9px", fontSize: "0.85rem", color: "var(--ink)", background: "var(--card)" }}
            />
            <button
              type="button"
              onClick={addEntry}
              className="ui"
              style={{
                alignSelf: "flex-start",
                background: "var(--header)",
                color: "#fbfcfe",
                border: 0,
                borderRadius: "2px",
                cursor: "pointer",
                padding: "8px 15px",
                fontSize: "0.68rem",
                textTransform: "uppercase",
                letterSpacing: "0.13em",
                opacity: draftOk ? 1 : 0.4,
                pointerEvents: draftOk ? "auto" : "none",
              }}
            >
              Add to calendar
            </button>
            <p style={{ margin: 0, fontSize: "0.75rem", lineHeight: 1.45, color: "var(--muted)" }}>
              Your entries sit alongside the contract obligations but are marked as yours — CLARA does not trace them to
              a clause.
            </p>
          </div>
        </section>

        <section>
          <h3 className="ui" style={{ margin: "0 0 12px", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--muted-strong)" }}>
            Next 90 days
          </h3>
          {windowItems.length === 0 ? (
            <p style={{ margin: 0, borderTop: "1px solid var(--rule)", paddingTop: "13px", fontSize: "0.85rem", color: "var(--muted)" }}>
              Nothing expires, renews or requires notice in the next 90 days.
            </p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {windowItems.map((item) => (
                <li key={item.id} style={{ borderTop: "1px solid var(--rule)" }}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className="row-hover"
                    style={{
                      display: "grid",
                      width: "100%",
                      textAlign: "left",
                      gridTemplateColumns: "5.6rem minmax(0, 1fr) auto",
                      columnGap: "14px",
                      rowGap: "3px",
                      alignItems: "baseline",
                      border: 0,
                      background: "transparent",
                      cursor: item.mine ? "default" : "pointer",
                      padding: "13px 4px",
                      color: "var(--ink)",
                    }}
                  >
                    <span className="ref" style={{ fontSize: "0.76rem", color: "var(--muted-light)" }}>
                      {formatDate(item.actionDeadline)}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontFamily: "var(--font-newsreader)", fontSize: "1.06rem", lineHeight: 1.3 }}>{item.title}</span>
                      <span style={{ display: "block", marginTop: "2px", fontSize: "0.78rem", color: "var(--muted)" }}>
                        {item.mine ? "Your entry" : item.docTitle} · act by {formatDate(item.actionDeadline)}
                      </span>
                    </span>
                    <span className="ui" style={{ whiteSpace: "nowrap", fontSize: "9.5px", letterSpacing: "0.11em", textTransform: "uppercase", color: item.kind.color }}>
                      {item.kind.kind}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
