/**
 * Exclusivity conflict detection. Deterministic, no LLM.
 *
 * The model's only job upstream was to normalise scope language into codes and
 * dates; deciding whether two grants can both be honoured is arithmetic, and
 * arithmetic is something we can show our working for. So nothing here asks a
 * model anything, and every conflict we emit can be re-derived from the two
 * grants it names.
 *
 * Overlap is plain set intersection on codes, deliberately. A grant over
 * ["WORLD-EXCEPT-SG"] does not intersect ["SG"], and that is the correct answer
 * for the right reason — the codes differ. Teaching this module geography
 * ("WORLD covers SG", "EU contains DE") would let it invent overlaps the
 * documents never stated, which is exactly the failure mode the whole system is
 * built to avoid. If a real corpus needs that reasoning, it belongs upstream in
 * normalisation where a human can see the codes it produced.
 */

import { isValid, parseISO } from "date-fns";
import { weakest } from "./confidence.ts";
import { formatDate } from "./display.ts";
import type {
  Confidence,
  ContractResult,
  ExclusivityConflict,
  ExclusivityType,
  Grant,
} from "./types.ts";

/**
 * What each flavour of exclusivity actually promises, written for someone who
 * has to act on it. The exclusive/sole distinction is the one users get wrong:
 * "sole" sounds absolute but leaves the grantor free to compete.
 */
const MEANING: Record<ExclusivityType, string> = {
  exclusive:
    "exclusive rights (nobody else may act in that scope, normally including the grantor itself)",
  sole: "sole rights (the grantor may still act itself, but promises to appoint nobody else)",
  "non-exclusive": "non-exclusive rights (no restriction on the grantor or on anyone else)",
};

/** Only these two flavours restrict anyone, so only these two can be breached. */
function restricts(type: ExclusivityType): boolean {
  return type === "exclusive" || type === "sole";
}

/** Codes are matched case-insensitively; they are machine tokens, not prose. */
function normaliseCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Entity names are compared exactly after trimming, collapsing whitespace and
 * casefolding — and no further. Fuzzy matching here would silently decide that
 * "Apex Scientific Pte Ltd" and "Apex Scientific Holdings Pte Ltd" are one
 * company, which either hides a real conflict or invents one. Two names that
 * differ are two entities until a human says otherwise.
 */
function normaliseEntity(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function intersectCodes(a: string[], b: string[]): string[] {
  const right = new Set(b.map(normaliseCode));
  const shared = new Set(a.map(normaliseCode).filter((code) => right.has(code)));
  return [...shared].sort();
}

interface Bound {
  /** ±Infinity for an unbounded (or unreadable) edge, so comparisons just work. */
  time: number;
  /** The original date string, or null wherever the edge is unbounded. */
  label: string | null;
}

/**
 * A null start or end means genuinely unbounded, not missing: an auto-renewing
 * appointment has no end date to record, and treating that as "ends today"
 * would make the longest-running conflicts the ones we fail to report.
 *
 * An unparseable date is also treated as unbounded. That errs towards flagging,
 * which is the right direction for a review tool — we would rather surface a
 * pair for a human to dismiss than stay quiet because a date was malformed.
 */
function bound(date: string | null, unbounded: number): Bound {
  if (date === null) return { time: unbounded, label: null };
  const parsed = parseISO(date);
  if (!isValid(parsed)) return { time: unbounded, label: null };
  return { time: parsed.getTime(), label: date };
}

/**
 * Do these two grants cover the same ground — same territory, same product,
 * overlapping in time? This answers scope only. Whether that overlap is a
 * *problem* depends on the grantees and the exclusivity flavours, and that
 * judgement lives in detectExclusivityConflicts.
 */
export function grantsOverlap(
  a: Grant,
  b: Grant,
): {
  overlaps: boolean;
  territories: string[];
  products: string[];
  from: string | null;
  to: string | null;
} {
  const territories = intersectCodes(a.territoryCodes, b.territoryCodes);
  const products = intersectCodes(a.productCodes, b.productCodes);

  const startA = bound(a.start, -Infinity);
  const startB = bound(b.start, -Infinity);
  const endA = bound(a.end, Infinity);
  const endB = bound(b.end, Infinity);

  // The overlap window is the later start to the earlier end.
  const from = startA.time >= startB.time ? startA : startB;
  const to = endA.time <= endB.time ? endA : endB;

  // Inclusive: a single shared day is a day on which both promises are live.
  const timeOverlaps = from.time <= to.time;

  return {
    overlaps: territories.length > 0 && products.length > 0 && timeOverlaps,
    territories,
    products,
    from: from.label,
    to: to.label,
  };
}

/** Plain-English window, used in the explanation a non-lawyer reads. */
function periodPhrase(from: string | null, to: string | null): string {
  const f = from === null ? null : formatDate(from);
  const t = to === null ? null : formatDate(to);
  if (f !== null && t !== null) return `between ${f} and ${t}`;
  if (f !== null) return `from ${f} onwards, with no fixed end date in either document`;
  if (t !== null) return `up to ${t}, with no start date fixed in either document`;
  return "over a period that neither document bounds";
}

/**
 * Why this particular pairing cannot stand. Spelled out per combination rather
 * than as one generic sentence, because the reason a user needs to act differs:
 * an exclusive-vs-sole clash is a breach of the exclusive grant, while
 * sole-vs-sole is the grantor having promised the same restraint twice.
 */
function whyInconsistent(a: Grant, b: Grant): string {
  const pair = restricts(a.exclusivityType) ? [a, b] : [b, a];
  const [restricted, other] = pair;

  if (a.exclusivityType === "exclusive" && b.exclusivityType === "exclusive") {
    return (
      `Both grants are exclusive, and each one promises that nobody but its own grantee may act in that scope. ` +
      `They cannot both be honoured.`
    );
  }

  if (restricted.exclusivityType === "exclusive" && other.exclusivityType === "sole") {
    return (
      `The exclusive grant to ${restricted.grantee} forbids any other appointment in that scope, ` +
      `yet ${other.grantee} has been appointed for the same territory, product and period — ` +
      `and a sole appointment is still an appointment. Honouring the second breaches the first.`
    );
  }

  if (restricted.exclusivityType === "sole" && other.exclusivityType === "exclusive") {
    return (
      `The exclusive grant to ${other.grantee} forbids any other appointment in that scope, ` +
      `yet ${restricted.grantee} has been appointed for the same territory, product and period — ` +
      `and a sole appointment is still an appointment. Honouring the second breaches the first.`
    );
  }

  if (a.exclusivityType === "sole" && b.exclusivityType === "sole") {
    return (
      `Each grant promises that the grantor will appoint nobody else for that territory and product, ` +
      `yet two different companies have been appointed. The grantor has given the same promise twice.`
    );
  }

  if (restricted.exclusivityType === "exclusive") {
    return (
      `The exclusive grant to ${restricted.grantee} means nobody else may act in that scope. ` +
      `The grant to ${other.grantee} is non-exclusive, so it restricts nobody itself, ` +
      `but exercising it would breach ${restricted.grantee}'s exclusivity.`
    );
  }

  return (
    `${restricted.grantee}'s sole appointment promises the grantor will appoint nobody else ` +
    `for that territory and product. The grant to ${other.grantee} is non-exclusive and restricts nobody itself, ` +
    `but it is a second appointment over the same scope, which is what the sole appointment ruled out.`
  );
}

function explain(
  a: Grant,
  b: Grant,
  territories: string[],
  products: string[],
  from: string | null,
  to: string | null,
): string {
  const scope = `product ${products.join(", ")} in territory ${territories.join(", ")}`;
  return (
    `"${a.docTitle}" grants ${a.grantee} ${MEANING[a.exclusivityType]} over ${scope}. ` +
    `"${b.docTitle}" grants ${b.grantee} ${MEANING[b.exclusivityType]} over the same ${scope}. ` +
    `The two grants overlap ${periodPhrase(from, to)}. ` +
    whyInconsistent(a, b)
  );
}

/**
 * Reasons carry the confidence story forward. A conflict is a claim built on two
 * other claims, and if either was shaky the conflict is shaky — we say which one
 * and why, rather than presenting a clean-looking finding on soft evidence.
 */
function buildReasons(a: Grant, b: Grant, level: Confidence): string[] {
  const reasons = [
    `Both grants were located and their scopes overlap, so this conflict follows arithmetically from the two documents rather than from any judgement about them.`,
    `Reported as ${level}, the weaker of the two underlying grants (${a.docTitle}: ${a.confidence}; ${b.docTitle}: ${b.confidence}). A conflict is never more certain than the grants it is built on.`,
  ];

  if (level !== "FOUND") {
    reasons.push(
      `Check both clauses in the source documents before acting on this: at least one of the grants was not read with full confidence.`,
    );
  }

  for (const grant of [a, b]) {
    for (const reason of grant.reasons) reasons.push(`${grant.docTitle}: ${reason}`);
  }

  return reasons;
}

/** Sort key that makes the pair order — and therefore the id — input-order independent. */
function grantKey(grant: Grant): string {
  return `${grant.docId}::${grant.id}`;
}

/**
 * Every cross-document pair of grants that cannot both be honoured.
 *
 * Grants inside one document are never compared: a single agreement routinely
 * carries an exclusive appointment plus its mirror-image restrictive covenant,
 * and those are two halves of one bargain, not a contradiction.
 */
export function detectExclusivityConflicts(contracts: ContractResult[]): ExclusivityConflict[] {
  // A grant whose citation could not be located has a scope we cannot stand
  // behind, and a conflict is an assertion about two scopes overlapping. Better
  // to report no conflict than one built on text we failed to find.

  const conflicts: ExclusivityConflict[] = [];

  for (let i = 0; i < contracts.length; i += 1) {
    for (let j = i + 1; j < contracts.length; j += 1) {
      // Guard against the same document appearing twice in the input; a doc
      // cannot conflict with itself, whatever the array says.
      if (contracts[i].docId === contracts[j].docId) continue;

      for (const left of contracts[i].grants) {
        for (const right of contracts[j].grants) {
          // Canonical order, so a-vs-b and b-vs-a produce one identical conflict.
          const [a, b] = grantKey(left) <= grantKey(right) ? [left, right] : [right, left];

          // R1 for grants: a scope resting on a quote we could not locate is
          // not established, and a conflict is an assertion that two scopes
          // overlap. Better to report none than one built on unfound text.
          if (a.scopeUnverified || b.scopeUnverified) continue;
          if (!restricts(a.exclusivityType) && !restricts(b.exclusivityType)) continue;
          if (normaliseEntity(a.grantee) === normaliseEntity(b.grantee)) continue;

          const overlap = grantsOverlap(a, b);
          if (!overlap.overlaps) continue;

          const confidence = weakest([a.confidence, b.confidence]);
          const codes = [...overlap.territories, ...overlap.products].join("+");

          conflicts.push({
            id: `conflict:${grantKey(a)}|${grantKey(b)}:${codes}`,
            grants: [a, b],
            overlapTerritories: overlap.territories,
            overlapProducts: overlap.products,
            overlapFrom: overlap.from,
            overlapTo: overlap.to,
            confidence,
            reasons: buildReasons(a, b, confidence),
            explanation: explain(a, b, overlap.territories, overlap.products, overlap.from, overlap.to),
          });
        }
      }
    }
  }

  // Sorted by id: the same corpus must produce a byte-identical results.json
  // whatever order the extraction stage happened to finish its documents in.
  return conflicts.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
