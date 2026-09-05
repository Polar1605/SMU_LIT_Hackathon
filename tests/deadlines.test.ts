/**
 * Date arithmetic is one of the three things the spec says must be tested, and
 * it is tested here rather than through the pipeline because the whole module is
 * pure: fields in, calendar out, no I/O and no model.
 *
 * The cases that matter most are the ones where a plausible-looking calendar
 * would be wrong: the notice deadline sorting ahead of a payment whose date is
 * earlier than the renewal it guards, the business-day period we refuse to
 * resolve, and the on-invoice obligation that has no date and must appear anyway.
 */

import { describe, expect, it } from "vitest";
import { buildCalendar } from "../lib/deadlines.ts";
import type {
  CalendarEvent,
  Citation,
  Confidence,
  ContractResult,
  FieldResult,
  PaymentFrequency,
  PaymentTerm,
} from "../lib/types.ts";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const ASOF = new Date(2026, 8, 5); // 2026-09-05, the corpus's own as-of date.

function citation(docId: string, clauseId: string, charStart = 100): Citation {
  return {
    docId,
    docTitle: "Cloud Subscription Agreement",
    clauseId,
    pageNum: 2,
    charStart,
    charEnd: charStart + 40,
    quotedText: `text of clause ${clauseId}`,
    matchKind: "exact",
    bboxes: [],
    spansPages: false,
    ocrConfidenceMean: null,
    ocrConfidenceMin: null,
  };
}

function field(
  fieldId: string,
  value: string | null,
  confidence: Confidence = "FOUND",
  citations: Citation[] = [citation("saas", fieldId)],
): FieldResult {
  return {
    fieldId,
    label: fieldId,
    value,
    confidence,
    reasons: [`reason for ${fieldId}`],
    citations,
    ambiguities: [],
    evidenceType: value === null ? "absent" : "explicit",
    discardedQuoteCount: 0,
  };
}

function payment(over: Partial<PaymentTerm> = {}): PaymentTerm {
  return {
    id: "p1",
    description: "Subscription fee",
    amountMinor: 4000000,
    currency: "SGD",
    frequency: "quarterly" as PaymentFrequency,
    firstDueDate: "2026-09-10",
    conditional: false,
    conditionNote: null,
    confidence: "FOUND",
    reasons: ["reason for payment"],
    citations: [citation("saas", "5.1", 900)],
    ...over,
  };
}

function contract(over: Partial<ContractResult> = {}): ContractResult {
  return {
    docId: "saas",
    title: "Cloud Subscription Agreement",
    fileName: "saas.pdf",
    format: "pdf",
    paginated: true,
    ocrPages: [],
    fields: [],
    payments: [],
    grants: [],
    ...over,
  };
}

/** A contract that renews, so it produces both a term-end and a notice deadline. */
function renewing(noticeValue: string, over: Partial<ContractResult> = {}): ContractResult {
  return contract({
    fields: [field("termEnd", "2026-11-18"), field("renewalNoticeDays", noticeValue)],
    ...over,
  });
}

const byKind = (events: CalendarEvent[], kind: CalendarEvent["kind"]): CalendarEvent[] =>
  events.filter((e) => e.kind === kind);

const one = (events: CalendarEvent[], kind: CalendarEvent["kind"]): CalendarEvent => {
  const matches = byKind(events, kind);
  expect(matches).toHaveLength(1);
  return matches[0];
};

/* ------------------------------------------------------------------ */

describe("the notice deadline is the headline date", () => {
  it("subtracts the notice period from the term end to get the date action is due", () => {
    const notice = one(buildCalendar([renewing("60 days")], ASOF), "renewal-notice-deadline");
    expect(notice.actionDeadline).toBe("2026-09-19");
  });

  it("keeps the term end as the event date, so the row shows what the deadline protects", () => {
    const notice = one(buildCalendar([renewing("60 days")], ASOF), "renewal-notice-deadline");
    expect(notice.eventDate).toBe("2026-11-18");
    expect(notice.actionDeadline).not.toBe(notice.eventDate);
  });

  it("emits the term expiry as its own event alongside the notice deadline", () => {
    const events = buildCalendar([renewing("60 days")], ASOF);
    const termEnd = one(events, "term-end");
    expect(termEnd.eventDate).toBe("2026-11-18");
    expect(termEnd.actionDeadline).toBe("2026-11-18");
  });

  it("emits no notice deadline when the contract states no notice period", () => {
    const events = buildCalendar([contract({ fields: [field("termEnd", "2026-11-18")] })], ASOF);
    expect(byKind(events, "renewal-notice-deadline")).toHaveLength(0);
    expect(byKind(events, "term-end")).toHaveLength(1);
  });

  it("emits nothing at all when the term end was never established", () => {
    const events = buildCalendar(
      [
        contract({
          fields: [field("termEnd", null, "NOT_FOUND", []), field("renewalNoticeDays", "60 days")],
        }),
      ],
      ASOF,
    );
    expect(events).toEqual([]);
  });

  it("crosses month and year boundaries correctly for a long notice period", () => {
    const events = buildCalendar(
      [contract({ fields: [field("termEnd", "2027-07-01"), field("renewalNoticeDays", "180 days")] })],
      ASOF,
    );
    expect(one(events, "renewal-notice-deadline").actionDeadline).toBe("2027-01-02");
  });
});

describe("business-day notice periods", () => {
  // A 90-day notice period only leaves a live deadline on a term ending well out.
  const businessDays = () =>
    contract({
      fields: [field("termEnd", "2027-01-15"), field("renewalNoticeDays", "90 business days")],
    });

  it("marks the event UNCERTAIN because we hold no public-holiday calendar", () => {
    const notice = one(buildCalendar([businessDays()], ASOF), "renewal-notice-deadline");
    expect(notice.confidence).toBe("UNCERTAIN");
  });

  it("states in the caveat that the date shown is calendar days and falls later than the real one", () => {
    const notice = one(buildCalendar([businessDays()], ASOF), "renewal-notice-deadline");
    expect(notice.caveat).toMatch(/business days/i);
    expect(notice.caveat).toMatch(/no public-holiday calendar/i);
    expect(notice.caveat).toMatch(/calendar days/i);
    expect(notice.caveat).toMatch(/earlier/i);
  });

  it("still shows a date, computed on calendar days, rather than withholding one", () => {
    const notice = one(buildCalendar([businessDays()], ASOF), "renewal-notice-deadline");
    expect(notice.actionDeadline).toBe("2026-10-17");
  });

  it("leaves a calendar-day notice period uncaveated and at full confidence", () => {
    const notice = one(buildCalendar([renewing("60 days")], ASOF), "renewal-notice-deadline");
    expect(notice.confidence).toBe("FOUND");
    expect(notice.caveat).toBeNull();
  });
});

describe("confidence propagates from the fields the date was computed from", () => {
  it("reports a deadline built on an inferred term end as INFERRED", () => {
    const events = buildCalendar(
      [
        contract({
          fields: [
            field("termEnd", "2026-11-18", "INFERRED"),
            field("renewalNoticeDays", "60 days", "FOUND"),
          ],
        }),
      ],
      ASOF,
    );
    expect(one(events, "renewal-notice-deadline").confidence).toBe("INFERRED");
    expect(one(events, "term-end").confidence).toBe("INFERRED");
  });

  it("falls to the weakest input when the notice period itself is uncertain", () => {
    const events = buildCalendar(
      [
        contract({
          fields: [
            field("termEnd", "2026-11-18", "FOUND"),
            field("renewalNoticeDays", "60 days", "UNCERTAIN"),
          ],
        }),
      ],
      ASOF,
    );
    expect(one(events, "renewal-notice-deadline").confidence).toBe("UNCERTAIN");
    // The term end was solid on its own evidence and is not dragged down with it.
    expect(one(events, "term-end").confidence).toBe("FOUND");
  });

  it("carries the citations of every contributing field so the row is traceable", () => {
    const events = buildCalendar(
      [
        contract({
          fields: [
            field("termEnd", "2026-11-18", "FOUND", [citation("saas", "3.1", 100)]),
            field("renewalNoticeDays", "60 days", "FOUND", [citation("saas", "12.3", 500)]),
          ],
        }),
      ],
      ASOF,
    );
    const notice = one(events, "renewal-notice-deadline");
    expect(notice.citations.map((c) => c.clauseId).sort()).toEqual(["12.3", "3.1"]);
  });

  it("does not repeat a clause cited by more than one input", () => {
    const shared = citation("saas", "3.1", 100);
    const events = buildCalendar(
      [
        contract({
          fields: [
            field("termEnd", "2026-11-18", "FOUND", [shared]),
            field("renewalNoticeDays", "60 days", "FOUND", [shared]),
          ],
        }),
      ],
      ASOF,
    );
    expect(one(events, "renewal-notice-deadline").citations).toHaveLength(1);
  });

  it("passes the contributing fields' reasons through to the row", () => {
    const notice = one(buildCalendar([renewing("60 days")], ASOF), "renewal-notice-deadline");
    expect(notice.reasons).toContain("reason for termEnd");
    expect(notice.reasons).toContain("reason for renewalNoticeDays");
    expect(notice.reasons.join(" ")).toMatch(/last day to act is 2026-09-19/i);
  });
});

describe("daysUntilDeadline", () => {
  it("counts calendar days from the as-of date to the deadline", () => {
    const events = buildCalendar([renewing("60 days")], ASOF);
    expect(one(events, "renewal-notice-deadline").daysUntilDeadline).toBe(14);
    expect(one(events, "term-end").daysUntilDeadline).toBe(74);
  });

  it("is zero for a deadline falling on the as-of date, which is still actionable", () => {
    const events = buildCalendar([renewing("74 days")], ASOF);
    const notice = one(events, "renewal-notice-deadline");
    expect(notice.actionDeadline).toBe("2026-09-05");
    expect(notice.daysUntilDeadline).toBe(0);
  });

  it("goes negative for a term that has already expired", () => {
    const events = buildCalendar([contract({ fields: [field("termEnd", "2026-08-06")] })], ASOF);
    expect(one(events, "term-end").daysUntilDeadline).toBe(-30);
  });

  it("ignores the time of day carried by the as-of timestamp", () => {
    const lateInTheDay = new Date(2026, 8, 5, 23, 30);
    const events = buildCalendar([renewing("74 days")], lateInTheDay);
    expect(one(events, "renewal-notice-deadline").daysUntilDeadline).toBe(0);
  });

  it("is null when there is no deadline to count towards", () => {
    const events = buildCalendar(
      [contract({ payments: [payment({ frequency: "on-invoice", firstDueDate: null })] })],
      ASOF,
    );
    expect(one(events, "payment").daysUntilDeadline).toBeNull();
  });
});

describe("spent deadlines", () => {
  it("drops a renewal notice deadline that has already passed", () => {
    // Term ends 2026-09-30, 60 days' notice: the last day to act was 1 August.
    const events = buildCalendar(
      [
        contract({
          fields: [field("termEnd", "2026-09-30"), field("renewalNoticeDays", "60 days")],
        }),
      ],
      ASOF,
    );
    expect(byKind(events, "renewal-notice-deadline")).toHaveLength(0);
  });

  it("keeps a term end that has passed, because an expired contract is worth showing", () => {
    const events = buildCalendar([contract({ fields: [field("termEnd", "2025-01-01")] })], ASOF);
    expect(one(events, "term-end").daysUntilDeadline).toBeLessThan(0);
  });

  it("keeps a notice deadline beyond the window while it is still actionable", () => {
    const events = buildCalendar(
      [contract({ fields: [field("termEnd", "2027-06-30"), field("renewalNoticeDays", "10 days")] })],
      ASOF,
    );
    const notice = one(events, "renewal-notice-deadline");
    expect(notice.actionDeadline).toBe("2027-06-20");
    expect(notice.daysUntilDeadline).toBeGreaterThan(90);
  });
});

describe("recurring payments across the window", () => {
  it("expands a quarterly payment to the single occurrence a 90-day window can hold", () => {
    // Window is 2026-09-05 to 2026-12-04; occurrences run 03-10, 06-10, 09-10, 12-10.
    const events = buildCalendar([contract({ payments: [payment()] })], ASOF);
    expect(byKind(events, "payment").map((e) => e.eventDate)).toEqual(["2026-09-10"]);
  });

  it("expands the same quarterly payment to four occurrences over a year", () => {
    const events = buildCalendar([contract({ payments: [payment()] })], ASOF, 365);
    expect(byKind(events, "payment").map((e) => e.eventDate)).toEqual([
      "2026-09-10",
      "2026-12-10",
      "2027-03-10",
      "2027-06-10",
    ]);
  });

  it("walks a quarterly anchor that predates the as-of date onto the right occurrence", () => {
    const events = buildCalendar(
      [contract({ payments: [payment({ firstDueDate: "2023-02-10" })] })],
      ASOF,
    );
    expect(byKind(events, "payment").map((e) => e.eventDate)).toEqual(["2026-11-10"]);
  });

  it("includes an occurrence falling on the last day of the window", () => {
    const events = buildCalendar(
      [contract({ payments: [payment({ firstDueDate: "2025-12-04" })] })],
      ASOF,
    );
    expect(byKind(events, "payment").map((e) => e.eventDate)).toEqual(["2026-12-04"]);
  });

  it("excludes an occurrence falling the day before the as-of date", () => {
    // 2025-12-04 anchor shifted back a day puts an occurrence on 2026-09-03.
    const events = buildCalendar(
      [contract({ payments: [payment({ firstDueDate: "2025-12-03" })] })],
      ASOF,
    );
    expect(byKind(events, "payment").map((e) => e.eventDate)).toEqual(["2026-12-03"]);
  });

  it("expands a monthly payment to one occurrence per month inside the window", () => {
    const events = buildCalendar(
      [contract({ payments: [payment({ frequency: "monthly" })] })],
      ASOF,
    );
    expect(byKind(events, "payment").map((e) => e.eventDate)).toEqual([
      "2026-09-10",
      "2026-10-10",
      "2026-11-10",
    ]);
  });

  it("expands an annual payment to the one anniversary inside the window", () => {
    const events = buildCalendar(
      [contract({ payments: [payment({ frequency: "annually", firstDueDate: "2025-11-18" })] })],
      ASOF,
    );
    expect(byKind(events, "payment").map((e) => e.eventDate)).toEqual(["2026-11-18"]);
  });

  it("does not let a month-end anchor drift onto the 28th for the rest of the year", () => {
    const events = buildCalendar(
      [contract({ payments: [payment({ frequency: "monthly", firstDueDate: "2026-01-31" })] })],
      new Date(2026, 0, 1),
      120,
    );
    expect(byKind(events, "payment").map((e) => e.eventDate)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("shows a one-off payment inside the window and omits one far beyond it", () => {
    const inside = buildCalendar(
      [contract({ payments: [payment({ frequency: "one-off", firstDueDate: "2026-10-01" })] })],
      ASOF,
    );
    expect(byKind(inside, "payment").map((e) => e.eventDate)).toEqual(["2026-10-01"]);

    const outside = buildCalendar(
      [contract({ payments: [payment({ frequency: "one-off", firstDueDate: "2029-10-01" })] })],
      ASOF,
    );
    expect(byKind(outside, "payment")).toHaveLength(0);
  });

  it("defaults the window to 90 days when none is given", () => {
    const monthly = contract({ payments: [payment({ frequency: "monthly" })] });
    expect(buildCalendar([monthly], ASOF)).toEqual(buildCalendar([monthly], ASOF, 90));
  });

  it("takes its confidence and citations from the payment term", () => {
    const events = buildCalendar(
      [contract({ payments: [payment({ confidence: "UNCERTAIN" })] })],
      ASOF,
    );
    const due = one(events, "payment");
    expect(due.confidence).toBe("UNCERTAIN");
    expect(due.citations.map((c) => c.clauseId)).toEqual(["5.1"]);
    expect(due.reasons).toContain("reason for payment");
  });
});

describe("payments that cannot be dated", () => {
  it("gives an on-invoice payment no deadline and no event date, but still a row", () => {
    const events = buildCalendar(
      [
        contract({
          payments: [
            payment({
              frequency: "on-invoice",
              firstDueDate: null,
              description: "Professional services fees, payable within 30 days of invoice",
              conditional: true,
              conditionNote: "Depends on when the Supplier issues an invoice.",
            }),
          ],
        }),
      ],
      ASOF,
    );
    const due = one(events, "payment");
    expect(due.actionDeadline).toBeNull();
    expect(due.eventDate).toBeNull();
    expect(due.conditional).toBe(true);
  });

  it("explains in the caveat that the interval runs from a date the contract never fixes", () => {
    const events = buildCalendar(
      [
        contract({
          payments: [
            payment({
              frequency: "on-invoice",
              firstDueDate: null,
              description: "Professional services fees, payable within 30 days of invoice",
            }),
          ],
        }),
      ],
      ASOF,
    );
    const caveat = one(events, "payment").caveat ?? "";
    expect(caveat).toMatch(/30 days/);
    expect(caveat).toMatch(/invoice/i);
    expect(caveat).toMatch(/never fixes/i);
    expect(caveat).toMatch(/no certain due date/i);
  });

  it("still describes the obligation when the interval itself cannot be read", () => {
    const events = buildCalendar(
      [
        contract({
          payments: [
            payment({ frequency: "on-invoice", firstDueDate: null, description: "Fees on invoice" }),
          ],
        }),
      ],
      ASOF,
    );
    expect(one(events, "payment").caveat).toMatch(/a fixed number of days/i);
  });

  it("keeps a scheduled payment whose first due date the contract never fixes", () => {
    const events = buildCalendar(
      [contract({ payments: [payment({ frequency: "quarterly", firstDueDate: null })] })],
      ASOF,
    );
    const due = one(events, "payment");
    expect(due.actionDeadline).toBeNull();
    expect(due.conditional).toBe(true);
    expect(due.caveat).toMatch(/fixes no first due date/i);
  });
});

describe("sort order", () => {
  it("orders on the action deadline, not the event date", () => {
    // The notice deadline (19 Sep) protects an event in November, so an October
    // payment must still sort behind it.
    const events = buildCalendar(
      [
        renewing("60 days", {
          payments: [payment({ frequency: "one-off", firstDueDate: "2026-10-15" })],
        }),
      ],
      ASOF,
    );
    expect(events.map((e) => [e.kind, e.actionDeadline])).toEqual([
      ["renewal-notice-deadline", "2026-09-19"],
      ["payment", "2026-10-15"],
      ["term-end", "2026-11-18"],
    ]);
  });

  it("puts every row with no deadline last, however early its contract's other rows fall", () => {
    const events = buildCalendar(
      [
        renewing("60 days", {
          payments: [
            payment({ id: "p-invoice", frequency: "on-invoice", firstDueDate: null }),
            payment({ id: "p-dated", frequency: "one-off", firstDueDate: "2026-10-15" }),
          ],
        }),
      ],
      ASOF,
    );
    expect(events[events.length - 1].actionDeadline).toBeNull();
    expect(events.slice(0, -1).every((e) => e.actionDeadline !== null)).toBe(true);
  });

  it("interleaves events from different contracts by deadline", () => {
    const events = buildCalendar(
      [
        contract({ docId: "b", title: "B", fields: [field("termEnd", "2026-10-20")] }),
        contract({ docId: "a", title: "A", fields: [field("termEnd", "2026-09-20")] }),
      ],
      ASOF,
    );
    expect(events.map((e) => e.docId)).toEqual(["a", "b"]);
  });

  it("orders rows sharing a deadline deterministically, so output diffs stay readable", () => {
    const build = () =>
      buildCalendar(
        [
          contract({
            payments: [
              payment({ id: "p2", frequency: "one-off", firstDueDate: "2026-10-01" }),
              payment({ id: "p1", frequency: "one-off", firstDueDate: "2026-10-01" }),
            ],
          }),
        ],
        ASOF,
      );
    expect(build().map((e) => e.id)).toEqual(build().map((e) => e.id));
    expect(build().map((e) => e.id)).toEqual([
      "saas:payment:p1:2026-10-01",
      "saas:payment:p2:2026-10-01",
    ]);
  });
});

describe("amounts", () => {
  it("renders minor units without float arithmetic", () => {
    const events = buildCalendar(
      [
        contract({
          payments: [
            payment({ id: "big", amountMinor: 4000000, frequency: "one-off", firstDueDate: "2026-10-01" }),
            payment({ id: "cents", amountMinor: 123, frequency: "one-off", firstDueDate: "2026-10-02" }),
            payment({ id: "one-cent", amountMinor: 1, frequency: "one-off", firstDueDate: "2026-10-03" }),
          ],
        }),
      ],
      ASOF,
    );
    expect(byKind(events, "payment").map((e) => e.title)).toEqual([
      "SGD 40,000.00 — Subscription fee",
      "SGD 1.23 — Subscription fee",
      "SGD 0.01 — Subscription fee",
    ]);
  });

  it("omits the amount entirely when the contract states none", () => {
    const events = buildCalendar(
      [
        contract({
          payments: [
            payment({ amountMinor: null, currency: null, frequency: "one-off", firstDueDate: "2026-10-01" }),
          ],
        }),
      ],
      ASOF,
    );
    expect(one(events, "payment").title).toBe("Subscription fee");
  });
});

describe("provenance on every row", () => {
  it("labels each event with the document it came from", () => {
    const events = buildCalendar(
      [renewing("60 days", { payments: [payment({ frequency: "monthly" })] })],
      ASOF,
    );
    expect(events.length).toBeGreaterThan(2);
    expect(events.every((e) => e.docId === "saas" && e.docTitle === "Cloud Subscription Agreement")).toBe(
      true,
    );
  });

  it("gives every event a unique id", () => {
    const events = buildCalendar(
      [renewing("60 days", { payments: [payment({ frequency: "monthly" })] })],
      ASOF,
    );
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });

  it("returns an empty calendar for a contract with nothing datable", () => {
    expect(buildCalendar([contract()], ASOF)).toEqual([]);
    expect(buildCalendar([], ASOF)).toEqual([]);
  });
});
