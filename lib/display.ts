/**
 * How values are worded on screen.
 *
 * Kept in one place because the wording is a product decision, not a detail.
 * Two rules run through all of it: never phrase a finding as advice, and never
 * state an absolute we cannot support. The contract having no exclusivity
 * clause is reported as "no exclusivity provision identified" — what we did and
 * did not find — rather than "this contract has no exclusivity", which is a
 * claim about the world that our reading cannot guarantee.
 */

import type { Citation, Confidence } from "./types.ts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(iso: string | null): string {
  if (!iso) return "no date";
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return iso;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function formatDayMonth(iso: string): { day: string; month: string } {
  const [, month, day] = iso.slice(0, 10).split("-").map(Number);
  return { day: String(day), month: MONTHS[month - 1].toUpperCase() };
}

/** Integer minor units to a display string. Never divides, to avoid float drift. */
export function formatMoney(amountMinor: number | null, currency: string | null): string {
  if (amountMinor === null) return "amount not fixed";
  const digits = String(Math.abs(amountMinor)).padStart(3, "0");
  const major = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = digits.slice(-2);
  const symbol = currency === "SGD" ? "S$" : currency ? `${currency} ` : "";
  return cents === "00" ? `${symbol}${major}` : `${symbol}${major}.${cents}`;
}

export function daysLabel(days: number | null): string {
  if (days === null) return "no fixed date";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 0) return `${Math.abs(days)} days ago`;
  return `${days} days`;
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  FOUND: "Found",
  INFERRED: "Calculated",
  UNCERTAIN: "Uncertain",
  NOT_FOUND: "Not stated",
};

export const CONFIDENCE_MEANING: Record<Confidence, string> = {
  FOUND: "Stated in the contract, and we located every supporting quote in the document.",
  INFERRED: "Not written down; worked out from terms that are, each of which is cited.",
  UNCERTAIN: "The document does not settle this, or we could not read it reliably.",
  NOT_FOUND: "No provision of this kind was identified in this document.",
};

export const CONFIDENCE_VAR: Record<Confidence, string> = {
  FOUND: "var(--found)",
  INFERRED: "var(--inferred)",
  UNCERTAIN: "var(--uncertain)",
  NOT_FOUND: "var(--silent)",
};

export const CONFIDENCE_WASH: Record<Confidence, string> = {
  FOUND: "var(--found-wash)",
  INFERRED: "var(--inferred-wash)",
  UNCERTAIN: "var(--uncertain-wash)",
  NOT_FOUND: "var(--silent-wash)",
};

/**
 * A citation reference. A document with no fixed pagination says so plainly
 * instead of being given a page number that does not exist.
 */
export function citationRef(citation: Citation): string {
  const clause = citation.clauseId.trim();
  const clauseLabel = /^[\d.]+$/.test(clause) ? `cl. ${clause}` : clause;
  if (citation.pageNum === null) return `${clauseLabel}, no page numbering`;
  return citation.spansPages
    ? `${clauseLabel}, pages ${citation.pageNum}–${citation.pageNum + 1}`
    : `${clauseLabel}, page ${citation.pageNum}`;
}

const MATCH_NOTE: Record<Citation["matchKind"], string> = {
  exact: "Quote matched the document exactly.",
  normalised: "Quote matched after reconciling spacing, quotation marks and hyphenation.",
  fuzzy: "Quote matched only approximately, so confidence was reduced by one level.",
};

export function matchNote(citation: Citation): string {
  const base = MATCH_NOTE[citation.matchKind];
  if (citation.ocrConfidenceMean === null) return base;
  return `${base} Read from a scan; character recognition averaged ${citation.ocrConfidenceMean.toFixed(0)} out of 100 across this passage${
    citation.ocrConfidenceMin !== null ? `, lowest word ${citation.ocrConfidenceMin.toFixed(0)}` : ""
  }.`;
}
