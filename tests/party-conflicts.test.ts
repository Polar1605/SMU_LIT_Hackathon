/**
 * The same-parties conflict class. Like the exclusivity detector, this finding
 * exists in no single document, so it is the kind that goes wrong quietly.
 * These tests are inline fixtures, not the corpus, so they survive regeneration.
 *
 * Two properties matter most: it must not fire on contracts that merely share a
 * role word ("the Buyer"), and every statement it makes must carry the clause
 * it rests on.
 */

import { describe, expect, it } from "vitest";
import { detectPartyTermConflicts } from "../lib/party-conflicts.ts";
import type {
  Citation,
  Confidence,
  ContractResult,
  FieldId,
  FieldResult,
} from "../lib/types.ts";

function citation(docId: string, clauseId: string): Citation {
  return {
    docId,
    docTitle: `Document ${docId}`,
    clauseId,
    clauseSource: "structure",
    pageNum: 1,
    charStart: 10,
    charEnd: 40,
    quotedText: "…",
    matchKind: "exact",
    bboxes: [],
    spansPages: false,
    ocrConfidenceMean: null,
    ocrConfidenceMin: null,
  };
}

function fieldResult(
  fieldId: FieldId,
  value: string | null,
  confidence: Confidence,
  docId: string,
): FieldResult {
  return {
    fieldId,
    label: fieldId,
    value,
    confidence,
    reasons: [],
    citations: value === null ? [] : [citation(docId, `${fieldId}-clause`)],
    ambiguities: [],
    evidenceType: value === null ? "absent" : "explicit",
    discardedQuoteCount: 0,
  };
}

interface FieldSpec {
  value: string | null;
  confidence?: Confidence;
}

function contract(
  docId: string,
  fields: Partial<Record<FieldId, FieldSpec>>,
): ContractResult {
  const entries = Object.entries(fields) as [FieldId, FieldSpec][];
  return {
    docId,
    title: `Document ${docId}`,
    fileName: `${docId}.pdf`,
    format: "pdf",
    paginated: true,
    ocrPages: [],
    fields: entries.map(([fieldId, spec]) =>
      fieldResult(fieldId, spec.value, spec.confidence ?? "FOUND", docId),
    ),
    payments: [],
    grants: [],
  };
}

const PARTIES = "Meridian Retail Pte Ltd (Buyer) and Foundry Components Pte Ltd (Supplier)";
const SAME_TERM = {
  commencementDate: { value: "2026-01-01" },
  termEnd: { value: "2028-12-31" },
} as const;

describe("a liability-cap contradiction between two agreements with the same parties", () => {
  const msa = contract("msa", {
    parties: { value: PARTIES },
    ...SAME_TERM,
    liabilityCap: { value: "Capped at S$100,000 in aggregate." },
  });
  const supply = contract("supply", {
    parties: { value: PARTIES },
    ...SAME_TERM,
    liabilityCap: { value: "Supplier's liability is limited to S$500,000." },
  });

  const conflicts = detectPartyTermConflicts([msa, supply]);

  it("reports exactly one conflict, on the liability cap", () => {
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe("liability-cap");
    expect(conflicts[0].fieldId).toBe("liabilityCap");
  });

  it("names the shared parties, not the role words", () => {
    expect(conflicts[0].sharedParties.sort()).toEqual([
      "Foundry Components Pte Ltd",
      "Meridian Retail Pte Ltd",
    ]);
  });

  it("gives every claim in the argument at least one citation", () => {
    for (const claim of conflicts[0].claims) {
      expect(claim.citations.length).toBeGreaterThan(0);
    }
  });

  it("builds a stable id that does not depend on document order", () => {
    const reverse = detectPartyTermConflicts([supply, msa]);
    expect(reverse[0].id).toBe(conflicts[0].id);
    expect(detectPartyTermConflicts([msa, supply])).toEqual(reverse);
  });

  it("carries the weaker of the two field confidences", () => {
    const softened = detectPartyTermConflicts([
      msa,
      contract("supply", {
        parties: { value: PARTIES },
        ...SAME_TERM,
        liabilityCap: { value: "Supplier's liability is limited to S$500,000.", confidence: "INFERRED" },
      }),
    ]);
    expect(softened[0].confidence).toBe("INFERRED");
  });
});

describe("what is not a same-parties conflict", () => {
  it("does not fire when the two contracts only share a role word", () => {
    const a = contract("a", {
      parties: { value: "Acme Industries Pte Ltd (Buyer) and Nord Supply Pte Ltd (Supplier)" },
      ...SAME_TERM,
      liabilityCap: { value: "Capped at S$100,000." },
    });
    const b = contract("b", {
      parties: { value: "Zenith Trading Pte Ltd (Buyer) and Delta Works Pte Ltd (Supplier)" },
      ...SAME_TERM,
      liabilityCap: { value: "Capped at S$900,000." },
    });
    expect(detectPartyTermConflicts([a, b])).toEqual([]);
  });

  it("does not fire when only one party is shared", () => {
    const a = contract("a", {
      parties: { value: "Meridian Retail Pte Ltd and Foundry Components Pte Ltd" },
      ...SAME_TERM,
      liabilityCap: { value: "Capped at S$100,000." },
    });
    const b = contract("b", {
      parties: { value: "Meridian Retail Pte Ltd and Harlow Logistics Pte Ltd" },
      ...SAME_TERM,
      liabilityCap: { value: "Capped at S$400,000." },
    });
    expect(detectPartyTermConflicts([a, b])).toEqual([]);
  });

  it("does not fire on an uncertain field — that is the thing in doubt, not evidence", () => {
    const a = contract("a", {
      parties: { value: PARTIES },
      ...SAME_TERM,
      liabilityCap: { value: "Possibly S$100,000, subject to an indemnity schedule.", confidence: "UNCERTAIN" },
    });
    const b = contract("b", {
      parties: { value: PARTIES },
      ...SAME_TERM,
      liabilityCap: { value: "Capped at S$400,000." },
    });
    expect(detectPartyTermConflicts([a, b])).toEqual([]);
  });

  it("does not fire when the two terms do not overlap in time", () => {
    const a = contract("a", {
      parties: { value: PARTIES },
      commencementDate: { value: "2020-01-01" },
      termEnd: { value: "2021-12-31" },
      liabilityCap: { value: "Capped at S$100,000." },
    });
    const b = contract("b", {
      parties: { value: PARTIES },
      commencementDate: { value: "2026-01-01" },
      termEnd: { value: "2028-12-31" },
      liabilityCap: { value: "Capped at S$400,000." },
    });
    expect(detectPartyTermConflicts([a, b])).toEqual([]);
  });

  it("does not fire when the two caps are the same figure", () => {
    const a = contract("a", { parties: { value: PARTIES }, ...SAME_TERM, liabilityCap: { value: "Capped at S$100,000." } });
    const b = contract("b", { parties: { value: PARTIES }, ...SAME_TERM, liabilityCap: { value: "Liability shall not exceed S$100,000." } });
    expect(detectPartyTermConflicts([a, b])).toEqual([]);
  });
});

describe("termination-for-convenience and exclusivity contradictions", () => {
  it("flags one agreement allowing exit for convenience against another denying it", () => {
    const a = contract("a", {
      parties: { value: PARTIES },
      ...SAME_TERM,
      terminationForConvenience: { value: "Either party may terminate for convenience on 60 days' notice." },
    });
    const b = contract("b", {
      parties: { value: PARTIES },
      ...SAME_TERM,
      terminationForConvenience: { value: "There is no right to terminate for convenience; termination is for cause only." },
    });
    const conflicts = detectPartyTermConflicts([a, b]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe("termination-for-convenience");
    expect(conflicts[0].claims.every((c) => c.citations.length > 0)).toBe(true);
  });

  it("flags an exclusive arrangement against a non-exclusive one", () => {
    const a = contract("a", {
      parties: { value: PARTIES },
      ...SAME_TERM,
      exclusivity: { value: "Foundry is appointed as exclusive supplier of the components." },
    });
    const b = contract("b", {
      parties: { value: PARTIES },
      ...SAME_TERM,
      exclusivity: { value: "The appointment is non-exclusive; Meridian may source elsewhere." },
    });
    const conflicts = detectPartyTermConflicts([a, b]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe("exclusivity");
  });

  it("does not double-report an exclusivity-field contradiction the exclusivity detector already owns", () => {
    const a = contract("a", {
      parties: { value: PARTIES },
      ...SAME_TERM,
      exclusivity: { value: "Foundry is the exclusive supplier." },
    });
    const b = contract("b", {
      parties: { value: PARTIES },
      ...SAME_TERM,
      exclusivity: { value: "The arrangement is non-exclusive." },
    });
    const withGrantConflict = detectPartyTermConflicts([a, b], [
      {
        id: "x",
        // Only the doc ids are read off this for the suppression check.
        grants: [
          { docId: "a" } as never,
          { docId: "b" } as never,
        ],
        overlapTerritories: [],
        overlapProducts: [],
        overlapFrom: null,
        overlapTo: null,
        confidence: "FOUND",
        reasons: [],
        explanation: "",
        claims: [],
      },
    ]);
    expect(withGrantConflict).toEqual([]);
  });
});
