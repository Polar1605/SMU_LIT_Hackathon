/**
 * Flattens every UNCERTAIN field, payment and grant across a portfolio into
 * one list for the Uncertainties tab. New in this pass — nothing in the
 * pipeline previously needed "every unsettled thing, regardless of kind" as a
 * single collection; the dashboard always grouped by contract instead.
 */

import type { Citation, Confidence, ContractResult } from "./types.ts";

export interface UncertaintyItem {
  id: string;
  docId: string;
  docTitle: string;
  /** e.g. "Liability cap", "Payment", "Exclusivity granted" — shown as the eyebrow. */
  kind: string;
  value: string;
  reasons: string[];
  citations: Citation[];
}

const UNCERTAIN: Confidence = "UNCERTAIN";

export function collectUncertainties(contracts: ContractResult[]): UncertaintyItem[] {
  const items: UncertaintyItem[] = [];

  for (const contract of contracts) {
    for (const field of contract.fields) {
      if (field.confidence !== UNCERTAIN) continue;
      items.push({
        id: `${contract.docId}-field-${field.fieldId}`,
        docId: contract.docId,
        docTitle: contract.title,
        kind: field.label,
        value: field.value ?? "Stated, but not settled — see the reason below.",
        reasons: field.reasons,
        citations: field.citations,
      });
    }

    for (const payment of contract.payments) {
      if (payment.confidence !== UNCERTAIN) continue;
      items.push({
        id: `${contract.docId}-payment-${payment.id}`,
        docId: contract.docId,
        docTitle: contract.title,
        kind: "Payment",
        value: payment.description,
        reasons: payment.reasons,
        citations: payment.citations,
      });
    }

    for (const grant of contract.grants) {
      if (grant.confidence !== UNCERTAIN) continue;
      items.push({
        id: `${contract.docId}-grant-${grant.id}`,
        docId: contract.docId,
        docTitle: contract.title,
        kind: "Exclusivity granted",
        value: `${grant.grantee} — ${grant.territoryLabel}, ${grant.productLabel}`,
        reasons: grant.reasons,
        citations: grant.citations,
      });
    }
  }

  return items;
}
