/**
 * The Summary tab — a computed portfolio overview, not the design handoff's
 * hardcoded fixture copy. The handoff's lead statement ("Singapore is
 * promised to two distributors...") and its four stats (S$561k, 3 questions,
 * 44 of 60 fields) are all specific to the old 6-contract synthetic corpus.
 * This app now defaults to 30 real CUAD contracts and can show an uploaded
 * batch of any size, so every number and sentence here is derived from
 * `results` at render time.
 */

import type { CalendarEvent, Confidence, Results } from "@/lib/types";
import { CONFIDENCE_LABEL, CONFIDENCE_MEANING, CONFIDENCE_VAR, formatDate, formatMoney } from "@/lib/display";
import { kindOfEvent } from "@/lib/event-kind";
import { ConflictBanner } from "@/components/panels";
import { NextDeadlineCard } from "@/components/NextDeadlineCard";

const LEVELS: Confidence[] = ["FOUND", "INFERRED", "UNCERTAIN", "NOT_FOUND"];
// "one-off" and "on-invoice" are deliberately absent: a one-time fee is not an
// annual commitment (counting it, even at x1, would misrepresent a single
// payment as a recurring yearly cost), and an invoice-triggered amount has no
// fixed figure to annualise in the first place.
const ANNUAL_MULTIPLIER: Record<string, number> = { monthly: 12, quarterly: 4, annually: 1 };

function leadStatement(results: Results, leadDays: number | null): string {
  if (results.conflicts.length > 0) {
    return `${results.conflicts[0].explanation.split(".")[0]}.`;
  }
  if (leadDays !== null) {
    return `A renewal notice falls due in ${leadDays} day${leadDays === 1 ? "" : "s"}, the nearest thing in this portfolio that needs action.`;
  }
  return `Nothing in this portfolio requires action in the near term.`;
}

function annualCommitment(results: Results): string {
  const byCurrency = new Map<string, number>();
  let anyPriced = false;

  for (const contract of results.contracts) {
    for (const payment of contract.payments) {
      if (payment.amountMinor === null || payment.currency === null) continue;
      const multiplier = ANNUAL_MULTIPLIER[payment.frequency] ?? 0;
      if (multiplier === 0) continue;
      anyPriced = true;
      byCurrency.set(payment.currency, (byCurrency.get(payment.currency) ?? 0) + payment.amountMinor * multiplier);
    }
  }

  if (!anyPriced) return "not fixed";
  const parts = [...byCurrency.entries()].map(([currency, minor]) => formatMoney(minor, currency));
  return parts.join(" + ");
}

export function SummaryTab({ results, onOpenContract }: { results: Results; onOpenContract: (docId: string) => void }) {
  const dated = results.calendar.filter((e) => e.actionDeadline !== null);
  const upcoming = dated
    .filter((e) => (e.daysUntilDeadline ?? -1) >= 0)
    .sort((a, b) => (a.actionDeadline! < b.actionDeadline! ? -1 : 1));
  const leadDays = upcoming[0]?.daysUntilDeadline ?? null;

  const fields = results.contracts.flatMap((c) => c.fields);
  const tally = (level: Confidence) => fields.filter((f) => f.confidence === level).length;
  const readFromSource = tally("FOUND") + tally("INFERRED");
  const undatedCount = results.calendar.filter((e) => e.actionDeadline === null).length;

  return (
    <div>
      <p
        style={{
          margin: "8px 0 0",
          maxWidth: "36ch",
          fontFamily: "var(--font-newsreader)",
          fontWeight: 300,
          fontSize: "clamp(1.6rem, 3.2vw, 2.3rem)",
          lineHeight: 1.2,
          letterSpacing: "-0.015em",
        }}
      >
        {leadStatement(results, leadDays)}
      </p>
      <p style={{ margin: "18px 0 0", maxWidth: "64ch", fontSize: "0.95rem", lineHeight: 1.65, color: "var(--muted)" }}>
        {results.escalations.length > 0
          ? `Everything else in these ${results.contracts.length} contracts is either settled or dated. ${results.escalations.length} question${results.escalations.length === 1 ? "" : "s"} cannot be answered from the documents alone — see Escalations, with the evidence already assembled.`
          : `Everything in these ${results.contracts.length} contracts is either settled or dated — nothing has reached CLARA's competence boundary.`}
      </p>

      <dl
        style={{
          margin: "34px 0 0",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          columnGap: "32px",
          rowGap: "24px",
          borderTop: "1px solid var(--rule)",
          borderBottom: "1px solid var(--rule)",
          padding: "26px 0",
        }}
      >
        <Stat label="Next action" labelColor="var(--accent-blue)" value={leadDays === null ? "—" : String(leadDays)} unit={leadDays === null ? "no deadline" : "days"} />
        <Stat label="Committed a year" value={annualCommitment(results)} unit="" />
        <Stat label="For a lawyer" value={String(results.escalations.length)} unit={results.escalations.length === 1 ? "question" : "questions"} />
        <Stat label="Read from source" value={String(readFromSource)} unit={`of ${fields.length} fields`} />
      </dl>

      <div style={{ marginTop: "34px", display: "flex", flexWrap: "wrap", gap: "40px", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 28rem", minWidth: "min(26rem, 100%)" }}>
          <h2 className="ui" style={{ margin: "0 0 14px", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--muted-strong)" }}>
            Act by
          </h2>
          {upcoming.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Nothing is currently due for action.</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {upcoming.slice(0, 4).map((event) => (
                <ActByRow key={event.id} event={event} onOpenContract={onOpenContract} />
              ))}
            </ul>
          )}
          {undatedCount > 0 && (
            <p style={{ margin: "16px 0 0", fontSize: "0.82rem", lineHeight: 1.55, color: "var(--muted)" }}>
              {undatedCount} further obligation{undatedCount === 1 ? "" : "s"} {undatedCount === 1 ? "has" : "have"} no date the
              contract fixes — see Deadlines.
            </p>
          )}
        </div>

        <div style={{ flex: "1 1 22rem", minWidth: "min(22rem, 100%)", display: "flex", flexDirection: "column", gap: "22px" }}>
          <NextDeadlineCard events={results.calendar} />
          <ConflictBanner conflicts={results.conflicts} />
        </div>
      </div>

      <h2 className="ui" style={{ margin: "40px 0 14px", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--muted-strong)" }}>
        How much of this was read, and how much worked out
      </h2>
      <dl
        style={{
          margin: "0 0 32px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          columnGap: "36px",
          rowGap: "18px",
          borderTop: "1px solid var(--rule)",
          borderBottom: "1px solid var(--rule)",
          padding: "20px 0",
        }}
      >
        {LEVELS.map((level) => (
          <div key={level}>
            <dt style={{ marginBottom: "5px", display: "flex", alignItems: "baseline", gap: "10px" }}>
              <span className="ui" style={{ fontSize: "0.63rem", textTransform: "uppercase", letterSpacing: "0.14em", color: CONFIDENCE_VAR[level] }}>
                {CONFIDENCE_LABEL[level]}
              </span>
              <span style={{ fontFamily: "var(--font-newsreader)", fontSize: "1.3rem", letterSpacing: "-0.015em" }}>{tally(level)}</span>
            </dt>
            <dd style={{ margin: 0, fontSize: "0.78rem", lineHeight: 1.5, color: "var(--muted)" }}>{CONFIDENCE_MEANING[level]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Stat({ label, value, unit, labelColor = "var(--muted-strong)" }: { label: string; value: string; unit: string; labelColor?: string }) {
  return (
    <div>
      <dt className="ui" style={{ margin: "0 0 6px", fontSize: "0.63rem", textTransform: "uppercase", letterSpacing: "0.14em", color: labelColor }}>
        {label}
      </dt>
      <dd style={{ margin: 0, fontFamily: "var(--font-newsreader)", fontSize: "2.2rem", lineHeight: 1, letterSpacing: "-0.02em" }}>
        {value}
        {unit && <span style={{ fontFamily: "var(--font-plex)", fontSize: "0.8rem", color: "var(--muted)" }}> {unit}</span>}
      </dd>
    </div>
  );
}

function ActByRow({ event, onOpenContract }: { event: CalendarEvent; onOpenContract: (docId: string) => void }) {
  const kind = kindOfEvent(event);
  const urgent = (event.daysUntilDeadline ?? 999) <= 30;
  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: "7.5rem minmax(0, 1fr) auto",
        columnGap: "20px",
        rowGap: "4px",
        alignItems: "baseline",
        padding: "14px 0",
        borderTop: "1px solid var(--rule)",
      }}
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
}
