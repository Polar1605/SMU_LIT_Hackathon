/**
 * Escalation briefs — the cross-contract conflicts CLARA cannot settle on its own.
 *
 * A single contract's fields are either found, inferred, or reported as
 * uncertain in place; they do not need a separate handover. A conflict between
 * two contracts is different: resolving it is a legal judgement about how one
 * agreement bears on another, and that is the question to put to a lawyer. The
 * brief is the deliverable — a structured handover that separates what is
 * established from what is unresolved, so the hour bought from an adviser is
 * spent on the answer rather than on the reading.
 *
 * Every line under ESTABLISHED carries a citation that verified. Nothing enters
 * a brief on the strength of a quote we could not locate.
 */

import type {
  Citation,
  ContractResult,
  EscalationBrief,
  ExclusivityConflict,
  PartyTermConflict,
  PaymentTerm,
} from "./types.ts";

// "one-off" is deliberately absent: a single fee is not an annual
// commitment, and counting it — even at x1 — would misrepresent a one-time
// payment as a recurring yearly cost. Found live: a real RMB50 million
// one-off cooperation fee in a CUAD contract was inflating "committed a
// year" by fifty million until this was excluded.
const ANNUAL_MULTIPLIER: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  annually: 1,
};

/**
 * Annualised contract value, used to size the exposure line.
 *
 * Deliberately conservative: obligations with no fixed amount (net-30 from an
 * invoice, for instance) contribute nothing, and we say so rather than guessing.
 */
function exposureLine(payments: PaymentTerm[]): string {
  const priced = payments.filter((p) => p.amountMinor !== null && p.currency !== null);
  if (priced.length === 0) {
    return "Contract value could not be determined from the documents, so the size of this exposure is unknown.";
  }

  const byCurrency = new Map<string, number>();
  for (const payment of priced) {
    const multiplier = ANNUAL_MULTIPLIER[payment.frequency] ?? 0;
    if (multiplier === 0) continue;
    byCurrency.set(
      payment.currency!,
      (byCurrency.get(payment.currency!) ?? 0) + payment.amountMinor! * multiplier,
    );
  }

  const parts = [...byCurrency.entries()].map(([currency, minor]) => {
    const symbol = currency === "SGD" ? "S$" : `${currency} `;
    return `${symbol}${(minor / 100).toLocaleString("en-SG")}`;
  });

  const unpriced = payments.length - priced.length;
  const caveat = unpriced > 0
    ? ` Excludes ${unpriced} obligation${unpriced === 1 ? "" : "s"} the contract does not put a figure on.`
    : "";

  return `Known contract value is ${parts.join(" plus ")} per year.${caveat}`;
}

/** One row of evidence per distinct span, however many claims point at it. */
function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  return citations.filter((c) => {
    const key = `${c.docId}|${c.charStart}|${c.charEnd}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const PARTY_CONFLICT_QUESTION: Record<PartyTermConflict["kind"], string> = {
  "liability-cap":
    "Which of the two agreements caps liability for a dispute of this kind, and does either one expressly override the other?",
  "termination-for-convenience":
    "For this relationship, is there a right to terminate for convenience or not, and which agreement settles it?",
  exclusivity:
    "Is the arrangement between these parties exclusive or not, and which agreement controls where the two disagree?",
};

export function buildEscalations(
  contracts: ContractResult[],
  conflicts: ExclusivityConflict[],
  partyConflicts: PartyTermConflict[] = [],
): EscalationBrief[] {
  const briefs: EscalationBrief[] = [];

  for (const conflict of conflicts) {
    const [a, b] = conflict.grants;
    const involved = contracts.filter((c) => c.docId === a.docId || c.docId === b.docId);

    briefs.push({
      id: `conflict-${conflict.id}`,
      severity: "high",
      issue: conflict.explanation,
      documents: [...a.citations, ...b.citations],
      established: [
        ...a.citations.slice(0, 1).map((citation) => ({
          statement: `${a.docTitle} grants ${a.exclusivityType} rights to ${a.grantee} for ${a.territoryLabel} (${a.productLabel})`,
          citation,
        })),
        ...b.citations.slice(0, 1).map((citation) => ({
          statement: `${b.docTitle} grants ${b.exclusivityType} rights to ${b.grantee} for ${b.territoryLabel} (${b.productLabel})`,
          citation,
        })),
      ],
      unresolved: [
        `Whether the later appointment is permitted by, or breaches, the earlier grant.`,
        ...conflict.reasons,
      ],
      question: `Do the ${a.exclusivityType} rights granted to ${a.grantee} prevent the appointment of ${b.grantee} over the same territory and product category?`,
      exposure: exposureLine(involved.flatMap((c) => c.payments)),
    });
  }

  for (const pc of partyConflicts) {
    const involved = contracts.filter(
      (c) => c.docId === pc.contracts[0].docId || c.docId === pc.contracts[1].docId,
    );

    briefs.push({
      id: `conflict-${pc.id}`,
      severity: pc.kind === "termination-for-convenience" ? "medium" : "high",
      issue: pc.explanation,
      documents: dedupeCitations(pc.claims.flatMap((claim) => claim.citations)),
      // Every step of the argument except the closing inconsistency is a settled
      // fact with a clause behind it; that is exactly what belongs here.
      established: pc.claims
        .slice(0, -1)
        .filter((claim) => claim.citations.length > 0)
        .map((claim) => ({ statement: claim.statement, citation: claim.citations[0] })),
      unresolved: [
        `Which agreement governs this term for the relationship, and whether either one supersedes the other.`,
        ...pc.reasons,
      ],
      question: PARTY_CONFLICT_QUESTION[pc.kind],
      exposure: exposureLine(involved.flatMap((c) => c.payments)),
    });
  }

  // Highest severity first, so the most costly unknown is read first.
  return briefs.sort((x, y) => (x.severity === y.severity ? 0 : x.severity === "high" ? -1 : 1));
}
