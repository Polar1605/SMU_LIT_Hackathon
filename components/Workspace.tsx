"use client";

/**
 * The contract list and the field detail.
 *
 * The one structural rule worth stating: a field we cannot settle takes up MORE
 * room than one we can, because it carries the reason as body text. Interfaces
 * usually shrink doubt into a grey dash and give certainty the space; here the
 * user's real question is "what do I still not know", so uncertainty is the
 * largest thing on the page. There are no blank cells anywhere — every field
 * says either what the contract provides or why we cannot tell you.
 */

import { useState } from "react";
import type { CalendarEvent, Citation, ContractResult, FieldResult, Grant, PaymentTerm } from "@/lib/types";
import { citationRef, formatDate, formatMoney } from "@/lib/display";
import { ConfidenceMark } from "./ConfidenceMark";
import { EvidenceViewer } from "./EvidenceViewer";

const FREQUENCY_LABEL: Record<PaymentTerm["frequency"], string> = {
  "one-off": "once",
  monthly: "every month",
  quarterly: "every quarter",
  annually: "every year",
  "on-invoice": "on each invoice",
};

interface WorkspaceProps {
  contracts: ContractResult[];
  /** Used only to rank contracts by soonest upcoming obligation for the default list. */
  calendar?: CalendarEvent[];
  /** Lets the Calendar/Deadlines tabs route into a specific contract. Uncontrolled if omitted. */
  selectedDocId?: string | null;
  onSelectDocId?: (docId: string) => void;
}

const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** Earliest still-upcoming obligation for this contract, or null if it has none. */
function soonestDeadline(docId: string, calendar: CalendarEvent[]): string | null {
  const own = calendar.filter((e) => e.docId === docId && e.actionDeadline !== null && (e.daysUntilDeadline ?? -1) >= 0);
  if (own.length === 0) return null;
  return own.reduce((min, e) => (e.actionDeadline! < min ? e.actionDeadline! : min), own[0].actionDeadline!);
}

export function Workspace({ contracts, calendar = [], selectedDocId, onSelectDocId }: WorkspaceProps) {
  const [internalId, setInternalId] = useState(contracts[0]?.docId ?? "");
  const selectedId = selectedDocId ?? internalId;
  const setSelectedId = onSelectDocId ?? setInternalId;
  const [evidence, setEvidence] = useState<{ citation: Citation; contract: ContractResult } | null>(null);

  const [docQuery, setDocQuery] = useState("");
  const [docLetter, setDocLetter] = useState<string | null>(null);
  const [docSuggestOpen, setDocSuggestOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const selected = contracts.find((c) => c.docId === selectedId) ?? contracts[0];
  if (!selected) return null;

  const show = (citation: Citation) => setEvidence({ citation, contract: selected });

  const soonestByDoc = new Map(contracts.map((c) => [c.docId, soonestDeadline(c.docId, calendar)]));
  const query = docQuery.trim().toLowerCase();

  // Default: the five contracts with the soonest upcoming obligation, soonest
  // first; contracts with none sort last, alphabetically. A search query or a
  // letter filter replaces this with the full (unlimited) matching set —
  // each cancels the other, per the design's own interaction rules.
  const byDefaultOrder = [...contracts].sort((a, b) => {
    const da = soonestByDoc.get(a.docId);
    const db = soonestByDoc.get(b.docId);
    if (da && db) return da < db ? -1 : da > db ? 1 : 0;
    if (da) return -1;
    if (db) return 1;
    return a.title.localeCompare(b.title);
  });

  const filtered = query
    ? byDefaultOrder.filter((c) => c.title.toLowerCase().includes(query))
    : docLetter
      ? byDefaultOrder.filter((c) => c.title.toUpperCase().startsWith(docLetter))
      : null;

  const shownContracts = filtered ?? byDefaultOrder.slice(0, 5);
  const filterActive = query.length > 0 || docLetter !== null;

  const listNote = query
    ? `${filtered!.length} match${filtered!.length === 1 ? "" : "es"} for "${docQuery.trim()}"`
    : docLetter
      ? `Starting with ${docLetter}`
      : "Five soonest by obligation date";

  const suggestions = query
    ? byDefaultOrder.filter((c) => c.title.toLowerCase().includes(query)).slice(0, 6)
    : [];

  const lettersPresent = new Set(contracts.map((c) => c.title[0]?.toUpperCase()).filter(Boolean));

  function clearFilter(): void {
    setDocQuery("");
    setDocLetter(null);
    setDocSuggestOpen(false);
  }

  function pick(docId: string, title: string): void {
    setSelectedId(docId);
    setDocQuery(title);
    setDocSuggestOpen(false);
    setHighlightIndex(-1);
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (!docSuggestOpen || suggestions.length === 0) {
      if (e.key === "Escape") setDocSuggestOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      const target = suggestions[highlightIndex] ?? suggestions[0];
      if (target) {
        e.preventDefault();
        pick(target.docId, target.title);
      }
    } else if (e.key === "Escape") {
      setDocSuggestOpen(false);
      setHighlightIndex(-1);
    }
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <nav aria-label="Contracts" className="lg:w-60 lg:shrink-0">
        <h2 className="mb-2.5 text-[1.1rem]">Contracts</h2>

        <div className="relative mb-2.5">
          <input
            type="search"
            value={docQuery}
            onChange={(e) => {
              setDocQuery(e.target.value);
              setDocLetter(null);
              setDocSuggestOpen(true);
              setHighlightIndex(-1);
            }}
            onFocus={() => query.length > 0 && setDocSuggestOpen(true)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search by contract name"
            aria-label="Search contracts by name"
            className="w-full"
            style={{ border: "1px solid var(--input-border)", borderRadius: "3px", background: "var(--card)", padding: "9px 11px", fontSize: "0.85rem", color: "var(--ink)" }}
          />
          {docSuggestOpen && query.length > 0 && (
            <div role="listbox" className="absolute left-0 right-0 z-25" style={{ top: "calc(100% + 2px)", background: "var(--card)", border: "1px solid var(--input-border)", boxShadow: "var(--shadow-float-sm)" }}>
              {suggestions.length === 0 ? (
                <p style={{ margin: 0, padding: "10px 11px", fontSize: "0.82rem", color: "var(--muted)" }}>No contract by that name.</p>
              ) : (
                suggestions.map((c, i) => (
                  <button
                    key={c.docId}
                    type="button"
                    role="option"
                    aria-selected={i === highlightIndex}
                    onClick={() => pick(c.docId, c.title)}
                    className="row-hover block w-full border-0 bg-transparent text-left"
                    style={{ padding: "9px 11px", borderBottom: "1px solid var(--wash-alt)", background: i === highlightIndex ? "var(--wash-alt)" : undefined }}
                  >
                    <span style={{ display: "block", fontFamily: "var(--font-newsreader)", fontSize: "0.98rem", lineHeight: 1.25 }}>{c.title}</span>
                    <span className="ui" style={{ display: "block", marginTop: "2px", fontSize: "0.62rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-strong)" }}>
                      {c.format}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div role="group" aria-label="Jump to letter" className="mb-3 grid" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))", gap: "1px" }}>
          {AZ.map((letter) => {
            const has = lettersPresent.has(letter);
            const active = docLetter === letter;
            return (
              <button
                key={letter}
                type="button"
                disabled={!has}
                onClick={() => {
                  if (!has) return;
                  setDocLetter(active ? null : letter);
                  setDocQuery("");
                  setDocSuggestOpen(false);
                }}
                className="ref row-hover"
                style={{
                  border: 0,
                  borderRadius: "2px",
                  padding: "3px 0",
                  color: active ? "#fbfcfe" : has ? "var(--accent-blue)" : "var(--disabled)",
                  background: active ? "var(--header)" : "transparent",
                  fontWeight: has ? 600 : 400,
                  cursor: has ? "pointer" : "default",
                }}
              >
                {letter}
              </button>
            );
          })}
        </div>

        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="ui" style={{ margin: 0, fontSize: "0.62rem", fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-strong)" }}>
            {listNote}
          </p>
          {filterActive && (
            <button type="button" onClick={clearFilter} className="cite ref" style={{ color: "var(--accent-blue)" }}>
              Clear
            </button>
          )}
        </div>

        <ul className="card divide-y overflow-hidden" style={{ borderColor: "var(--border)" }}>
          {shownContracts.map((contract) => {
            const active = contract.docId === selected.docId;
            const unsettled = contract.fields.filter((f) => f.confidence === "UNCERTAIN").length;
            const soonest = soonestByDoc.get(contract.docId);
            return (
              <li key={contract.docId}>
                <button
                  type="button"
                  onClick={() => setSelectedId(contract.docId)}
                  aria-current={active ? "true" : undefined}
                  className="row-hover w-full cursor-pointer border-l-[3px] px-3 py-2.5 text-left"
                  style={{
                    borderLeftColor: active ? "var(--header)" : "transparent",
                    background: active ? "var(--surface-sunk)" : "var(--surface)",
                  }}
                >
                  <span
                    className="block text-[0.87rem] leading-snug"
                    style={{ fontWeight: active ? 600 : 400 }}
                  >
                    {contract.title}
                  </span>
                  <span className="ui mt-1 flex flex-wrap items-center gap-1.5 text-[0.68rem] uppercase tracking-wide">
                    <span style={{ color: "var(--ink-faint)" }}>{contract.format}</span>
                    {contract.ocrPages.length > 0 && (
                      <span className="rounded px-1" style={{ color: "var(--inferred)", background: "var(--inferred-bg)" }}>
                        scanned
                      </span>
                    )}
                    {unsettled > 0 && (
                      <span className="rounded px-1" style={{ color: "var(--uncertain)", background: "var(--uncertain-bg)" }}>
                        {unsettled} unsettled
                      </span>
                    )}
                    {soonest && <span style={{ color: "var(--accent-blue)" }}>next {formatDate(soonest)}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {shownContracts.length === 0 && (
          <p style={{ margin: "10px 0 0", fontSize: "0.83rem", color: "var(--muted)" }}>No contract matches that filter.</p>
        )}
      </nav>

      <section aria-label={`${selected.title} details`} className="min-w-0 flex-1">
        <div className="card overflow-hidden">
          <header className="card-head px-4 py-3">
            <h2 className="text-[1.2rem]">{selected.title}</h2>
            <p className="ref mt-1" style={{ color: "var(--ink-faint)" }}>
              {selected.fileName}
              {!selected.paginated && " · no fixed pagination"}
              {selected.ocrPages.length > 0 && ` · read by character recognition, pages ${selected.ocrPages.join(", ")}`}
            </p>
          </header>
          {selected.fields.map((field) => (
            <FieldRow key={field.fieldId} field={field} onCite={show} />
          ))}
        </div>

        {selected.payments.length > 0 && (
          <>
            <h3 className="mb-2 mt-6 text-[1.05rem]">What has to be paid</h3>
            <div className="card overflow-hidden">
              {selected.payments.map((payment) => (
                <PaymentRow key={payment.id} payment={payment} onCite={show} />
              ))}
            </div>
          </>
        )}

        {selected.grants.length > 0 && (
          <>
            <h3 className="mb-2 mt-6 text-[1.05rem]">Exclusivity granted</h3>
            <div className="card overflow-hidden">
              {selected.grants.map((grant) => (
                <GrantRow key={grant.id} grant={grant} onCite={show} />
              ))}
            </div>
          </>
        )}
      </section>

      {evidence && (
        <EvidenceViewer
          citation={evidence.citation}
          contract={evidence.contract}
          onClose={() => setEvidence(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CitationButtons({ citations, onCite }: { citations: Citation[]; onCite: (c: Citation) => void }) {
  if (citations.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {citations.map((citation, i) => (
        <button key={i} type="button" onClick={() => onCite(citation)} className="cite ref">
          {citationRef(citation)}
        </button>
      ))}
    </div>
  );
}

function Row({
  label,
  children,
  emphasis,
}: {
  label: string;
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className="row-hover grid gap-x-5 gap-y-1.5 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[12rem_1fr]"
      style={{
        borderColor: "var(--border)",
        background: emphasis ? "var(--uncertain-bg)" : "transparent",
      }}
    >
      <div className="ui text-[0.78rem] uppercase tracking-wide" style={{ color: "var(--ink-faint)" }}>
        {label}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function FieldRow({ field, onCite }: { field: FieldResult; onCite: (c: Citation) => void }) {
  const unsettled = field.confidence === "UNCERTAIN" || field.confidence === "NOT_FOUND";

  return (
    <Row label={field.label} emphasis={field.confidence === "UNCERTAIN"}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <span className="min-w-0 flex-1 text-[0.92rem] leading-relaxed">
          {field.value ?? <NoValue confidence={field.confidence} label={field.label} />}
        </span>
        <ConfidenceMark level={field.confidence} />
      </div>

      {/* The reason is the row's body when we cannot settle it — not a footnote. */}
      {unsettled &&
        field.reasons.map((reason, i) => (
          <p
            key={i}
            className="mt-2 border-l-2 pl-3 text-[0.85rem] leading-relaxed"
            style={{
              borderColor: field.confidence === "UNCERTAIN" ? "var(--uncertain)" : "var(--silent)",
              color: "var(--ink-soft)",
            }}
          >
            {reason}
          </p>
        ))}

      {field.discardedQuoteCount > 0 && (
        <p className="mt-2 text-[0.85rem]" style={{ color: "var(--alert)" }}>
          {field.discardedQuoteCount} supporting quote
          {field.discardedQuoteCount === 1 ? " was" : "s were"} discarded because we could not find
          {field.discardedQuoteCount === 1 ? " it" : " them"} in the document. The extracted answer was
          thrown away rather than shown to you.
        </p>
      )}

      <CitationButtons citations={field.citations} onCite={onCite} />
    </Row>
  );
}

/** Never an empty cell: say what we found, in words that claim no more than we know. */
function NoValue({ confidence, label }: { confidence: FieldResult["confidence"]; label: string }) {
  return (
    <span style={{ color: "var(--ink-faint)" }}>
      {confidence === "NOT_FOUND"
        ? `No ${label.toLowerCase()} provision identified in this document`
        : "No value shown — see below"}
    </span>
  );
}

function PaymentRow({ payment, onCite }: { payment: PaymentTerm; onCite: (c: Citation) => void }) {
  return (
    <Row
      label={formatMoney(payment.amountMinor, payment.currency)}
      emphasis={payment.confidence === "UNCERTAIN"}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <span className="min-w-0 flex-1 text-[0.92rem] leading-relaxed">
          {payment.description}
          <span style={{ color: "var(--ink-soft)" }}> — {FREQUENCY_LABEL[payment.frequency]}</span>
          {payment.firstDueDate && (
            <span style={{ color: "var(--ink-soft)" }}>, next {formatDate(payment.firstDueDate)}</span>
          )}
        </span>
        <ConfidenceMark level={payment.confidence} />
      </div>

      {payment.conditional && payment.conditionNote && (
        <p
          className="mt-2 border-l-2 pl-3 text-[0.85rem] leading-relaxed"
          style={{ borderColor: "var(--uncertain)", color: "var(--ink-soft)" }}
        >
          {payment.conditionNote}
        </p>
      )}

      <CitationButtons citations={payment.citations} onCite={onCite} />
    </Row>
  );
}

const EXCLUSIVITY_MEANING: Record<Grant["exclusivityType"], string> = {
  exclusive: "nobody else may act in this scope, normally including the supplier itself",
  sole: "the supplier may still act itself, but promises to appoint nobody else",
  "non-exclusive": "no restriction on appointing others",
};

function GrantRow({ grant, onCite }: { grant: Grant; onCite: (c: Citation) => void }) {
  return (
    <Row label={grant.exclusivityType} emphasis={grant.confidence === "UNCERTAIN"}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <span className="min-w-0 flex-1 text-[0.92rem] leading-relaxed">
          {grant.grantee} — {grant.territoryLabel}, {grant.productLabel}
          <span className="mt-0.5 block text-[0.85rem]" style={{ color: "var(--ink-soft)" }}>
            {EXCLUSIVITY_MEANING[grant.exclusivityType]}
            {grant.start && ` · from ${formatDate(grant.start)}`}
            {grant.end ? ` to ${formatDate(grant.end)}` : " · no fixed end date"}
          </span>
        </span>
        <ConfidenceMark level={grant.confidence} />
      </div>

      {grant.confidence === "UNCERTAIN" &&
        grant.reasons.map((reason, i) => (
          <p
            key={i}
            className="mt-2 border-l-2 pl-3 text-[0.85rem] leading-relaxed"
            style={{ borderColor: "var(--uncertain)", color: "var(--ink-soft)" }}
          >
            {reason}
          </p>
        ))}

      <CitationButtons citations={grant.citations} onCite={onCite} />
    </Row>
  );
}
