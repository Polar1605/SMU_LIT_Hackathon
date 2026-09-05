/**
 * Escalation briefs — what AITHENA produces at the edge of what it can settle.
 *
 * The brief is not an apology for failing. It is the deliverable: a structured
 * handover that separates what is established from what is unresolved, so the
 * person who picks it up can start from the question rather than from the
 * documents. An SME paying for an hour of a lawyer's time should spend it on
 * the answer, not on the reading.
 *
 * Every line under ESTABLISHED carries a citation that verified. Nothing enters
 * a brief on the strength of a quote we could not locate.
 */

import type {
  Citation,
  ContractResult,
  EscalationBrief,
  ExclusivityConflict,
  FieldResult,
  PaymentTerm,
} from "./types.ts";

/** Fields where not knowing the answer is itself commercially dangerous. */
const ESCALATING_FIELDS: Record<string, { severity: "high" | "medium"; subject: string }> = {
  liabilityCap: { severity: "high", subject: "the limit on what this contract could cost you" },
  exclusivity: { severity: "high", subject: "an exclusivity or restrictive covenant" },
  terminationForConvenience: { severity: "medium", subject: "your right to end this contract early" },
  terminationForCause: { severity: "medium", subject: "your right to end this contract for breach" },
};

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

function established(fields: FieldResult[]): { statement: string; citation: Citation }[] {
  const out: { statement: string; citation: Citation }[] = [];
  for (const field of fields) {
    // Only settled facts belong here. An UNCERTAIN field is the thing being
    // escalated, not evidence supporting the escalation.
    if (field.confidence !== "FOUND" && field.confidence !== "INFERRED") continue;
    if (field.value === null || field.citations.length === 0) continue;
    out.push({ statement: `${field.label}: ${field.value}`, citation: field.citations[0] });
  }
  return out;
}

function citationsFor(fields: FieldResult[]): Citation[] {
  return fields.flatMap((f) => f.citations);
}

export function buildEscalations(
  contracts: ContractResult[],
  conflicts: ExclusivityConflict[],
): EscalationBrief[] {
  const briefs: EscalationBrief[] = [];

  for (const contract of contracts) {
    for (const field of contract.fields) {
      const rule = ESCALATING_FIELDS[field.fieldId];
      if (!rule || field.confidence !== "UNCERTAIN") continue;

      briefs.push({
        id: `${contract.docId}-${field.fieldId}`,
        severity: rule.severity,
        issue: field.value
          ? `${contract.title} states ${field.label.toLowerCase()} as ${field.value}, but the position is not settled by the document.`
          : `${contract.title} does not settle ${rule.subject}.`,
        documents: field.citations,
        established: established(contract.fields).slice(0, 4),
        unresolved: field.reasons,
        question: questionFor(field, contract),
        exposure: exposureLine(contract.payments),
      });
    }
  }

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

  // Highest severity first, so the most costly unknown is read first.
  return briefs.sort((x, y) => (x.severity === y.severity ? 0 : x.severity === "high" ? -1 : 1));
}

/** The single question a lawyer should be asked, phrased so it can be answered. */
function questionFor(field: FieldResult, contract: ContractResult): string {
  switch (field.fieldId) {
    case "liabilityCap":
      return `In ${contract.title}, does the stated liability cap actually limit every head of loss, or do the indemnities and carve-outs leave exposure uncapped?`;
    case "exclusivity":
      return `In ${contract.title}, what exclusivity or restrictive covenant applies, and to which territory and product scope?`;
    case "terminationForConvenience":
      return `In ${contract.title}, on what notice can we end this contract without cause, and when does that notice take effect?`;
    case "terminationForCause":
      return `In ${contract.title}, what triggers a right to terminate for breach, and what cure period applies?`;
    default:
      return `In ${contract.title}, what is the correct position on ${field.label.toLowerCase()}?`;
  }
}
