/**
 * The calendar, computed in code from extracted fields. No model runs here.
 *
 * The headline number is not the date something happens, it is the date by which
 * the user must ACT — `termEnd − renewalNoticeDays`. A contract that expires on
 * 18 November with 60 days' notice to stop it renewing stopped being saveable on
 * 19 September, and a calendar that shows November is a calendar that lets the
 * renewal through. Everything in this module follows from that: the sort key is
 * the deadline, never the event date.
 *
 * Two other decisions carry more weight than they look:
 *
 * An obligation we cannot date is still an obligation. "30 days from invoice"
 * has no computable due date because the contract never fixes the invoice date,
 * so it appears with a null deadline and a caveat saying exactly that, sorted
 * last. Dropping it would be the most dangerous kind of clean output.
 *
 * A notice period in BUSINESS days is arithmetic we deliberately do not do. We
 * hold no public-holiday calendar, so the honest answer is a calendar-day date
 * marked UNCERTAIN with the reason stated, not a business-day date we cannot
 * justify. Silently treating business days as calendar days would show a
 * deadline that is later than the real one, which is the direction that costs
 * the user the contract.
 */

import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  format,
  isValid,
  parseISO,
} from "date-fns";
import { weakest } from "./confidence.ts";
import { formatMoney } from "./display.ts";
import type {
  CalendarEvent,
  Citation,
  Confidence,
  ContractResult,
  FieldResult,
  PaymentFrequency,
  PaymentTerm,
} from "./types.ts";

export const DEFAULT_WINDOW_DAYS = 90;

/** Notice expressed in working days. Detected on the field's own text, never assumed away. */
const BUSINESS_DAYS = /business\s+day|working\s+day/i;

/** "Net 30 from invoice", "within 30 days of invoice" — the N we can quote back even with no date. */
const DAY_COUNT = /(\d+)\s*(?:calendar\s+|business\s+|working\s+)?days?/i;

const MONTHS_PER_STEP: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  annually: 12,
};

const iso = (date: Date): string => format(date, "yyyy-MM-dd");

/**
 * Time of day is noise here: every input is a date, and comparing a midnight
 * anchor against an `asOf` carrying a wall-clock time would make an event due
 * today read as already past.
 */
const dayOf = (date: Date): Date => parseISO(iso(date));

/**
 * A field is usable only when it carries a value. Confidence is deliberately not
 * a gate — an UNCERTAIN term end still produces a calendar row, it just produces
 * an UNCERTAIN one. Suppressing weak inputs would hide the deadlines most likely
 * to hurt; propagating them is what `weakest` is for.
 */
function usableField(contract: ContractResult, fieldId: string): FieldResult | null {
  const field = contract.fields.find((f) => f.fieldId === fieldId);
  if (!field || field.value === null || field.value.trim() === "") return null;
  return field;
}

/** Dates arrive as YYYY-MM-DD inside a human-readable string; anything else is not a date we own. */
function parseDateValue(value: string): Date | null {
  const match = /\d{4}-\d{2}-\d{2}/.exec(value);
  if (!match) return null;
  const parsed = parseISO(match[0]);
  return isValid(parsed) ? parsed : null;
}

/** "60 days", "90 business days", "60". A notice period we cannot read is not one we guess at. */
function parseDayCount(value: string): number | null {
  const match = DAY_COUNT.exec(value) ?? /(\d+)/.exec(value);
  if (!match) return null;
  const days = Number.parseInt(match[1], 10);
  return Number.isFinite(days) ? days : null;
}

/**
 * Amounts never touch floating point. 4000000 minor units becomes "40,000.00" by
 * slicing the integer's own digits, because 4000000 / 100 is a division we have
 * no reason to perform and cent-level rounding is not a risk worth taking for a
 * display string.
 */
function formatMinor(amountMinor: number, currency: string | null): string {
  // Delegates to the shared formatter so a figure reads the same in the calendar
  // as it does on the contract it came from.
  return `${amountMinor < 0 ? "-" : ""}${formatMoney(Math.abs(amountMinor), currency)}`;
}

/** Same clause cited by two inputs is one row of evidence, not two. */
function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  return citations.filter((c) => {
    const key = `${c.docId}|${c.clauseId}|${c.charStart}|${c.charEnd}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeReasons(reasons: string[]): string[] {
  return [...new Set(reasons.filter((r) => r.trim() !== ""))];
}

interface EventDraft {
  id: string;
  kind: CalendarEvent["kind"];
  title: string;
  eventDate: Date | null;
  actionDeadline: Date | null;
  conditional?: boolean;
  caveat?: string | null;
  /** Every field or payment term the row was computed from. Confidence and citations come from these. */
  from: { confidence: Confidence; citations: Citation[]; reasons: string[] }[];
  /** Levels forced by our own arithmetic limits, e.g. business days we will not resolve. */
  extraLevels?: Confidence[];
  reasons?: string[];
}

function toEvent(contract: ContractResult, asOf: Date, draft: EventDraft): CalendarEvent {
  const levels = [...draft.from.map((f) => f.confidence), ...(draft.extraLevels ?? [])];
  return {
    id: draft.id,
    docId: contract.docId,
    docTitle: contract.title,
    kind: draft.kind,
    title: draft.title,
    eventDate: draft.eventDate ? iso(draft.eventDate) : null,
    actionDeadline: draft.actionDeadline ? iso(draft.actionDeadline) : null,
    daysUntilDeadline: draft.actionDeadline
      ? differenceInCalendarDays(draft.actionDeadline, dayOf(asOf))
      : null,
    conditional: draft.conditional ?? false,
    caveat: draft.caveat ?? null,
    confidence: weakest(levels),
    // The inputs' own reasons ride along, because a row shown as UNCERTAIN has to
    // be able to say which of its inputs made it so.
    reasons: dedupeReasons([...(draft.reasons ?? []), ...draft.from.flatMap((f) => f.reasons)]),
    citations: dedupeCitations(draft.from.flatMap((f) => f.citations)),
  };
}

/* ------------------------------------------------------------------ */
/* Term end and the notice deadline that guards it                     */
/* ------------------------------------------------------------------ */

function termEvents(contract: ContractResult, asOf: Date): CalendarEvent[] {
  const termEndField = usableField(contract, "termEnd");
  if (!termEndField) return [];

  const termEnd = parseDateValue(termEndField.value!);
  if (!termEnd) return [];

  const events: CalendarEvent[] = [
    toEvent(contract, asOf, {
      id: `${contract.docId}:term-end`,
      kind: "term-end",
      title: "Current term ends",
      eventDate: termEnd,
      // The expiry is its own deadline: nothing has to be done earlier, but the
      // date still has to sort somewhere sensible against everything else.
      actionDeadline: termEnd,
      from: [termEndField],
      reasons: [`The current term ends on ${iso(termEnd)}.`],
    }),
  ];

  const noticeField = usableField(contract, "renewalNoticeDays");
  const noticeDays = noticeField ? parseDayCount(noticeField.value!) : null;
  if (noticeField && noticeDays !== null) {
    const deadline = addDays(termEnd, -noticeDays);
    const businessDays = BUSINESS_DAYS.test(noticeField.value!);

    events.push(
      toEvent(contract, asOf, {
        id: `${contract.docId}:renewal-notice`,
        kind: "renewal-notice-deadline",
        title: "Last day to give notice to prevent renewal",
        // The event guarded against is the renewal at term end; the deadline is
        // the date the user loses the ability to prevent it.
        eventDate: termEnd,
        actionDeadline: deadline,
        from: [termEndField, noticeField],
        extraLevels: businessDays ? ["UNCERTAIN"] : [],
        caveat: businessDays
          ? `The contract expresses this notice period as ${noticeDays} business days. We apply no public-holiday calendar, so the date shown is ${noticeDays} calendar days before the term ends and the real deadline falls earlier than this. Confirm it against a working-day calendar for the relevant jurisdiction.`
          : null,
        reasons: [
          `The term ends on ${iso(termEnd)} and ${noticeDays} days' notice is required to prevent renewal, so the last day to act is ${iso(deadline)}.`,
        ],
      }),
    );
  }

  return events;
}

/* ------------------------------------------------------------------ */
/* Payments                                                            */
/* ------------------------------------------------------------------ */

function paymentTitle(payment: PaymentTerm): string {
  const money =
    payment.amountMinor !== null ? formatMinor(payment.amountMinor, payment.currency) : null;
  return money ? `${money} — ${payment.description}` : payment.description;
}

/**
 * Occurrences are anchored multiples of the step, not repeated additions, so a
 * 31 January anchor yields 28 February and then 31 March. Adding a month at a
 * time would clamp to 28 February and then walk the rest of the year on the 28th,
 * quietly inventing a schedule the contract does not have.
 */
function occurrences(anchor: Date, frequency: PaymentFrequency, from: Date, until: Date): Date[] {
  const step = MONTHS_PER_STEP[frequency];
  if (step === undefined) return [];

  // An anchor years before `asOf` must not be walked one step at a time, so we
  // jump straight to the neighbourhood of the window and back off two steps to
  // absorb any month-length rounding in the estimate.
  const stepsBehind = Math.floor(differenceInCalendarMonths(from, anchor) / step);
  const dates: Date[] = [];
  for (let i = Math.max(0, stepsBehind - 2); ; i++) {
    const due = addMonths(anchor, i * step);
    if (differenceInCalendarDays(due, until) > 0) break;
    if (differenceInCalendarDays(due, from) >= 0) dates.push(due);
  }
  return dates;
}

function paymentEvents(
  contract: ContractResult,
  asOf: Date,
  windowStart: Date,
  windowEnd: Date,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const payment of contract.payments) {
    const base = {
      kind: "payment" as const,
      title: paymentTitle(payment),
      from: [payment],
    };

    // Due "N days from invoice": the contract fixes the interval but never the
    // event it runs from, so there is no date to show. It still gets a row.
    if (payment.frequency === "on-invoice") {
      const days = parseDayCount(payment.description) ?? parseDayCount(payment.conditionNote ?? "");
      const interval = days !== null ? `${days} days` : "a fixed number of days";
      events.push(
        toEvent(contract, asOf, {
          ...base,
          id: `${contract.docId}:payment:${payment.id}:on-invoice`,
          eventDate: null,
          actionDeadline: null,
          conditional: true,
          caveat: `Payment falls due ${interval} from the date of an invoice, and the contract never fixes when an invoice is issued, so no certain due date exists. ${payment.conditionNote ?? "Track this against the invoices actually received."}`.trim(),
        }),
      );
      continue;
    }

    const anchor = payment.firstDueDate ? parseDateValue(payment.firstDueDate) : null;

    // A scheduled payment with no first due date cannot be placed on a calendar,
    // and an obligation we cannot date is not one we may drop.
    if (!anchor) {
      events.push(
        toEvent(contract, asOf, {
          ...base,
          id: `${contract.docId}:payment:${payment.id}:undated`,
          eventDate: null,
          actionDeadline: null,
          conditional: true,
          caveat: `This ${payment.frequency} payment obligation exists, but the contract fixes no first due date we could read, so its occurrences cannot be placed on the calendar. ${payment.conditionNote ?? ""}`.trim(),
        }),
      );
      continue;
    }

    if (payment.frequency === "one-off") {
      // Bounded by the window like every other payment row: a single sum due in
      // three years is not part of a 90-day view.
      if (
        differenceInCalendarDays(anchor, windowStart) >= 0 &&
        differenceInCalendarDays(anchor, windowEnd) <= 0
      ) {
        events.push(
          toEvent(contract, asOf, {
            ...base,
            id: `${contract.docId}:payment:${payment.id}:${iso(anchor)}`,
            eventDate: anchor,
            actionDeadline: anchor,
            conditional: payment.conditional,
            caveat: payment.conditional ? payment.conditionNote : null,
            reasons: [`One-off payment due on ${iso(anchor)}.`],
          }),
        );
      }
      continue;
    }

    for (const due of occurrences(anchor, payment.frequency, windowStart, windowEnd)) {
      events.push(
        toEvent(contract, asOf, {
          ...base,
          id: `${contract.docId}:payment:${payment.id}:${iso(due)}`,
          eventDate: due,
          actionDeadline: due,
          conditional: payment.conditional,
          caveat: payment.conditional ? payment.conditionNote : null,
          reasons: [
            `Recurring ${payment.frequency} payment, anchored on the first due date of ${iso(anchor)}; this occurrence falls on ${iso(due)}.`,
          ],
        }),
      );
    }
  }

  return events;
}

/* ------------------------------------------------------------------ */
/* Assembly                                                           */
/* ------------------------------------------------------------------ */

/**
 * A deadline in the past is spent — except a term end, which is worth showing
 * whether or not it has arrived, because "this expired three weeks ago" is one
 * of the more useful things a calendar can say. Conditional rows have no
 * deadline to have passed, so they always survive.
 */
function stillWorthShowing(event: CalendarEvent): boolean {
  if (event.kind === "term-end") return true;
  if (event.daysUntilDeadline === null) return true;
  return event.daysUntilDeadline >= 0;
}

/**
 * Sorted on the deadline, never the event date, because the deadline is the only
 * one of the two the user can still act on. Rows with no deadline sort last: they
 * are real obligations but they compete with nothing for the user's next move.
 * The trailing key ordering only exists to keep output stable between runs.
 */
function byDeadline(a: CalendarEvent, b: CalendarEvent): number {
  if (a.actionDeadline === null && b.actionDeadline === null) return a.id.localeCompare(b.id);
  if (a.actionDeadline === null) return 1;
  if (b.actionDeadline === null) return -1;
  if (a.actionDeadline !== b.actionDeadline) return a.actionDeadline < b.actionDeadline ? -1 : 1;
  return a.id.localeCompare(b.id);
}

export function buildCalendar(
  contracts: ContractResult[],
  asOf: Date,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): CalendarEvent[] {
  const windowStart = dayOf(asOf);
  const windowEnd = addDays(windowStart, windowDays);

  const events = contracts.flatMap((contract) => [
    ...termEvents(contract, asOf),
    ...paymentEvents(contract, asOf, windowStart, windowEnd),
  ]);

  return events.filter(stillWorthShowing).sort(byDeadline);
}
