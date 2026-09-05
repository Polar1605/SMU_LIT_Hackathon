/**
 * Classifies a calendar event into the design's kind taxonomy, so the Summary,
 * Deadlines and Calendar tabs never disagree about what color or label an
 * event gets. Kept in one place rather than reimplemented per tab.
 *
 * Mapping from our CalendarEventKind onto the design's kinds:
 *   renewal-notice-deadline -> Notice due   (the deadline is earlier than the event it protects)
 *   payment                 -> Payment
 *   term-end                -> Expires      (the design specs this kind but its own fixture
 *                                            corpus never triggers it; ours does, on every
 *                                            contract, since a term-end event exists for all six)
 *   personal entry          -> Yours        (never a CalendarEvent — see PersonalEntry below)
 *
 * `termination-window` is not handled: nothing in lib/deadlines.ts emits it.
 */

import type { CalendarEvent } from "./types.ts";

export interface EventKind {
  kind: "Notice due" | "Auto-renews" | "Payment" | "Expires" | "Yours";
  color: string;
  bg: string;
}

/** A user-added calendar note. Never confidence-scored, never cited — see CalendarTab. */
export interface PersonalEntry {
  id: string;
  date: string;
  title: string;
  note: string;
}

export function kindOfEvent(event: CalendarEvent): EventKind {
  switch (event.kind) {
    case "renewal-notice-deadline":
      return { kind: "Notice due", color: "var(--kind-notice)", bg: "var(--kind-notice-bg)" };
    case "term-end":
      return { kind: "Expires", color: "var(--kind-expiry)", bg: "var(--kind-expiry-bg)" };
    case "payment":
    case "termination-window":
    default:
      return { kind: "Payment", color: "var(--kind-payment)", bg: "var(--kind-payment-bg)" };
  }
}

export function kindOfPersonalEntry(): EventKind {
  return { kind: "Yours", color: "var(--kind-mine)", bg: "var(--kind-mine-bg)" };
}

export const CALENDAR_LEGEND: EventKind[] = [
  { kind: "Notice due", color: "var(--kind-notice)", bg: "var(--kind-notice-bg)" },
  { kind: "Auto-renews", color: "var(--kind-renewal)", bg: "var(--kind-renewal-bg)" },
  { kind: "Payment", color: "var(--kind-payment)", bg: "var(--kind-payment-bg)" },
  { kind: "Yours", color: "var(--kind-mine)", bg: "var(--kind-mine-bg)" },
];
