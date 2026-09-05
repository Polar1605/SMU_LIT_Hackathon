/**
 * The second conflict class: two contracts between the *same parties* whose
 * terms cannot both be true of that one relationship.
 *
 * Where detectExclusivityConflicts asks "has the grantor promised the same
 * scope to two different people", this asks "do two agreements between the same
 * two companies say incompatible things" — a different liability cap in each, a
 * termination-for-convenience right one grants and the other denies, an
 * exclusivity one asserts and the other rules out.
 *
 * Like the exclusivity detector, this is deterministic and shows its working.
 * Every statement it makes is a CitedClaim carrying the clause it rests on, so
 * nothing in a finding is left without a source the reader can open. And like
 * that detector it refuses to be clever: entities are matched by exact
 * normalised name, never fuzzily, and a contract whose parties clause names no
 * recognisable company is left alone rather than guessed at.
 */

import { isValid, parseISO } from "date-fns";
import { weakest } from "./confidence.ts";
import { formatDate } from "./display.ts";
import {
  FIELD_LABELS,
  type Citation,
  type CitedClaim,
  type Confidence,
  type ContractResult,
  type ExclusivityConflict,
  type FieldId,
  type FieldResult,
  type PartyTermConflict,
  type PartyTermConflictKind,
} from "./types.ts";

/** Only a settled field can contradict another; an uncertain one is the thing in doubt. */
const SETTLED: Confidence[] = ["FOUND", "INFERRED"];

/** Tokens that mark a string as a company name rather than a role like "the Buyer". */
const COMPANY_FORM =
  /\b(pte\.?\s*ltd|ltd|limited|llc|l\.l\.c|inc|incorporated|corp|corporation|co\.|company|gmbh|plc|llp|\bl\.?p\.?\b|n\.v|s\.a|s\.r\.l|sarl|\bag\b|\bbv\b|holdings?|partners|group|trust|fund)\b/i;

/** Role words that are never an entity, even when they survive the split. */
const ROLE_WORDS = new Set([
  "buyer", "seller", "supplier", "vendor", "customer", "client", "purchaser",
  "distributor", "reseller", "licensor", "licensee", "consultant", "contractor",
  "provider", "party", "parties", "company", "counterparty", "the company",
]);

function normaliseEntity(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The company names in a parties field, as { display, key } pairs. A value that
 * yields no recognisable company is returned empty, and the caller skips the
 * contract rather than matching on role words.
 */
function partyEntities(field: FieldResult | undefined): { display: string; key: string }[] {
  if (!field?.value) return [];
  const out: { display: string; key: string }[] = [];
  const seen = new Set<string>();
  for (const part of field.value.split(/,| and | & |\(|\)|;/)) {
    const display = part.trim().replace(/\s+/g, " ");
    if (display.length < 4) continue;
    const key = normaliseEntity(display);
    if (ROLE_WORDS.has(key)) continue;
    if (!COMPANY_FORM.test(display)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ display, key });
  }
  return out;
}

function field(contract: ContractResult, fieldId: FieldId): FieldResult | undefined {
  return contract.fields.find((f) => f.fieldId === fieldId);
}

function dateIn(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /\d{4}-\d{2}-\d{2}/.exec(value);
  if (!match) return null;
  const parsed = parseISO(match[0]);
  return isValid(parsed) ? parsed : null;
}

interface Window {
  start: Date | null;
  end: Date | null;
  /** True when neither edge could be read, so overlap is assumed rather than shown. */
  unbounded: boolean;
}

function activeWindow(contract: ContractResult): Window {
  const start = dateIn(field(contract, "commencementDate")?.value);
  const end = dateIn(field(contract, "termEnd")?.value);
  return { start, end, unbounded: start === null && end === null };
}

function windowsOverlap(a: Window, b: Window): { overlaps: boolean; from: Date | null; to: Date | null } {
  const startA = a.start?.getTime() ?? -Infinity;
  const startB = b.start?.getTime() ?? -Infinity;
  const endA = a.end?.getTime() ?? Infinity;
  const endB = b.end?.getTime() ?? Infinity;
  const fromT = Math.max(startA, startB);
  const toT = Math.min(endA, endB);
  if (fromT > toT) return { overlaps: false, from: null, to: null };
  return {
    overlaps: true,
    from: Number.isFinite(fromT) ? new Date(fromT) : null,
    to: Number.isFinite(toT) ? new Date(toT) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Per-field contradiction tests                                       */
/* ------------------------------------------------------------------ */

function figureOf(value: string): string | null {
  const match = value.match(/(?:[A-Z]{1,4}\$?\s?)?\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;
  return match[0].replace(/\s+/g, "").replace(/,/g, "").toUpperCase();
}

function convenienceStance(value: string): "allows" | "forbids" | "unclear" {
  if (/\b(no|not|never|cannot|may not|excluded|neither party may terminate|without cause is not)\b/i.test(value)) {
    // "not less than 30 days" is a notice period, not a denial.
    if (!/\bnot less than\b|\bno later than\b|\bnot fewer than\b/i.test(value)) return "forbids";
  }
  if (/\b(may|can|entitled to|right to)\b.{0,40}\bterminat/i.test(value) || /for convenience|without cause|without reason/i.test(value)) {
    return "allows";
  }
  return "unclear";
}

function exclusivityStance(value: string): "restrictive" | "open" | "unclear" {
  if (/\bnon-?exclusive\b/i.test(value) || /\bno\b.{0,20}exclusiv/i.test(value)) return "open";
  if (/\b(exclusive|sole)\b/i.test(value)) return "restrictive";
  return "unclear";
}

interface FieldContradiction {
  kind: PartyTermConflictKind;
  fieldId: FieldId;
  statement: (aTitle: string, bTitle: string) => string;
}

function contradiction(fieldId: FieldId, aValue: string, bValue: string): FieldContradiction | null {
  if (fieldId === "liabilityCap") {
    const fa = figureOf(aValue);
    const fb = figureOf(bValue);
    if (fa && fb && fa !== fb) {
      return {
        kind: "liability-cap",
        fieldId,
        statement: (aTitle, bTitle) =>
          `${aTitle} and ${bTitle} put different ceilings on liability for the same relationship, so only one can be the operative cap — which turns on which agreement governs the matter in dispute.`,
      };
    }
    return null;
  }

  if (fieldId === "terminationForConvenience") {
    const sa = convenienceStance(aValue);
    const sb = convenienceStance(bValue);
    if ((sa === "allows" && sb === "forbids") || (sa === "forbids" && sb === "allows")) {
      return {
        kind: "termination-for-convenience",
        fieldId,
        statement: (aTitle, bTitle) =>
          `One of ${aTitle} and ${bTitle} gives a right to end the relationship for convenience and the other withholds it. Both cannot be the rule for the same parties at the same time.`,
      };
    }
    return null;
  }

  if (fieldId === "exclusivity") {
    const sa = exclusivityStance(aValue);
    const sb = exclusivityStance(bValue);
    if ((sa === "restrictive" && sb === "open") || (sa === "open" && sb === "restrictive")) {
      return {
        kind: "exclusivity",
        fieldId,
        statement: (aTitle, bTitle) =>
          `${aTitle} treats the arrangement as exclusive while ${bTitle} treats it as non-exclusive. The scope of what either side may do outside the relationship depends on which one controls.`,
      };
    }
    return null;
  }

  return null;
}

const CONTRADICTABLE: FieldId[] = ["liabilityCap", "terminationForConvenience", "exclusivity"];

/* ------------------------------------------------------------------ */

function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  return citations.filter((c) => {
    const key = `${c.docId}|${c.charStart}|${c.charEnd}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function periodPhrase(from: Date | null, to: Date | null): string {
  const f = from ? formatDate(from.toISOString().slice(0, 10)) : null;
  const t = to ? formatDate(to.toISOString().slice(0, 10)) : null;
  if (f && t) return `Both are live between ${f} and ${t}.`;
  if (f) return `Both are live from ${f} onwards, with no fixed end in either document.`;
  if (t) return `Both are live up to ${t}.`;
  return `Neither document bounds the period over which both are live.`;
}

function buildReasons(
  a: ContractResult,
  b: ContractResult,
  fa: FieldResult,
  fb: FieldResult,
  level: Confidence,
  termUnbounded: boolean,
): string[] {
  const reasons = [
    `Both contracts name the same parties and each states this field outright, so the contradiction is read straight off the two documents rather than inferred.`,
    `Reported as ${level}, the weaker of the two field readings (${a.title}: ${fa.confidence}; ${b.title}: ${fb.confidence}). A conflict is never more certain than the terms it is built on.`,
  ];
  if (termUnbounded) {
    reasons.push(
      `The term dates could not be read from at least one of the contracts, so they are assumed to be in force at the same time. Confirm both are current before acting on this.`,
    );
  }
  if (level !== "FOUND") {
    reasons.push(`Check both clauses in the source documents before acting on this.`);
  }
  for (const [contract, f] of [[a, fa], [b, fb]] as const) {
    for (const reason of f.reasons) reasons.push(`${contract.title}: ${reason}`);
  }
  return reasons;
}

/**
 * Every same-parties pair of contracts whose terms contradict, one finding per
 * contradicting field.
 *
 * `exclusivityConflicts` is passed in only to suppress a duplicate: when a doc
 * pair already carries a third-party exclusivity conflict, an exclusivity-field
 * contradiction between the same two documents is not reported again here.
 */
export function detectPartyTermConflicts(
  contracts: ContractResult[],
  exclusivityConflicts: ExclusivityConflict[] = [],
): PartyTermConflict[] {
  const exclusivityPairs = new Set(
    exclusivityConflicts.map((c) =>
      [c.grants[0].docId, c.grants[1].docId].sort().join("|"),
    ),
  );

  const out: PartyTermConflict[] = [];

  for (let i = 0; i < contracts.length; i += 1) {
    for (let j = i + 1; j < contracts.length; j += 1) {
      const left = contracts[i];
      const right = contracts[j];
      if (left.docId === right.docId) continue;

      // Canonical order so the pair — and every id built from it — is
      // independent of the order the documents arrived in.
      const [a, b] = left.docId <= right.docId ? [left, right] : [right, left];

      const partiesA = field(a, "parties");
      const partiesB = field(b, "parties");
      const entitiesA = partyEntities(partiesA);
      const entitiesB = partyEntities(partiesB);
      if (entitiesA.length < 2 || entitiesB.length < 2) continue;

      const keysB = new Set(entitiesB.map((e) => e.key));
      const shared = entitiesA.filter((e) => keysB.has(e.key));
      // Both sides of a bilateral relationship must appear in both contracts.
      if (shared.length < 2) continue;

      const partyCitations = dedupeCitations([
        ...(partiesA?.citations ?? []),
        ...(partiesB?.citations ?? []),
      ]);
      if (partyCitations.length === 0) continue;

      const windowA = activeWindow(a);
      const windowB = activeWindow(b);
      const termUnbounded = windowA.unbounded || windowB.unbounded;
      const overlap = windowsOverlap(windowA, windowB);
      if (!overlap.overlaps) continue;

      const pairKey = [a.docId, b.docId].sort().join("|");

      for (const fieldId of CONTRADICTABLE) {
        if (fieldId === "exclusivity" && exclusivityPairs.has(pairKey)) continue;

        const fa = field(a, fieldId);
        const fb = field(b, fieldId);
        if (!fa?.value || !fb?.value) continue;
        if (!SETTLED.includes(fa.confidence) || !SETTLED.includes(fb.confidence)) continue;
        if (fa.citations.length === 0 || fb.citations.length === 0) continue;
        if (fa.discardedQuoteCount > 0 || fb.discardedQuoteCount > 0) continue;

        const hit = contradiction(fieldId, fa.value, fb.value);
        if (!hit) continue;

        const levels: Confidence[] = [fa.confidence, fb.confidence];
        if (termUnbounded) levels.push("UNCERTAIN");
        const confidence = weakest(levels);
        const label = FIELD_LABELS[fieldId];
        const bothFieldCitations = dedupeCitations([...fa.citations, ...fb.citations]);

        const claims: CitedClaim[] = [
          {
            statement: `"${a.title}" and "${b.title}" are both agreements between ${shared
              .map((e) => e.display)
              .join(" and ")}.`,
            citations: partyCitations,
          },
          {
            statement: `"${a.title}" states ${label.toLowerCase()}: ${fa.value}`,
            citations: fa.citations,
          },
          {
            statement: `"${b.title}" states ${label.toLowerCase()}: ${fb.value}`,
            citations: fb.citations,
          },
          {
            statement: periodPhrase(overlap.from, overlap.to),
            citations: dedupeCitations([
              ...(field(a, "termEnd")?.citations ?? []),
              ...(field(b, "termEnd")?.citations ?? []),
              ...(field(a, "commencementDate")?.citations ?? []),
              ...(field(b, "commencementDate")?.citations ?? []),
            ]),
          },
          {
            statement: hit.statement(`"${a.title}"`, `"${b.title}"`),
            citations: bothFieldCitations,
          },
        ];

        out.push({
          id: `party-conflict:${a.docId}|${b.docId}:${fieldId}`,
          kind: hit.kind,
          fieldId,
          fieldLabel: label,
          contracts: [
            { docId: a.docId, docTitle: a.title, value: fa.value },
            { docId: b.docId, docTitle: b.title, value: fb.value },
          ],
          sharedParties: shared.map((e) => e.display),
          overlapFrom: overlap.from ? overlap.from.toISOString().slice(0, 10) : null,
          overlapTo: overlap.to ? overlap.to.toISOString().slice(0, 10) : null,
          confidence,
          reasons: buildReasons(a, b, fa, fb, confidence, termUnbounded),
          explanation: claims.map((c) => c.statement).join(" "),
          claims,
        });
      }
    }
  }

  return out.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
