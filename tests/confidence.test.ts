/**
 * Confidence is what the user actually reads, and it is scored separately from
 * accuracy, so it gets its own tests despite the spec's short test list. It is a
 * pure function with no I/O, so the marginal cost is minutes.
 *
 * The tests that matter most are the pair distinguishing genuine silence
 * (NOT_FOUND) from a clause we could not resolve (UNCERTAIN), and the false
 * friends — "exclusive of GST" and "exclusive jurisdiction" — which appear in
 * contracts that have no exclusivity provision at all.
 */

import { describe, expect, it } from "vitest";
import { computeConfidence, hasCandidateClause, weakest } from "../lib/confidence.ts";
import type { ConfidenceInput } from "../lib/confidence.ts";

const base: ConfidenceInput = {
  evidenceType: "explicit",
  matchKinds: ["exact"],
  anyQuoteDiscarded: false,
  ambiguities: [],
  ocrMean: null,
  ocrMin: null,
  hasCandidateClause: false,
};

const verdict = (over: Partial<ConfidenceInput>) => computeConfidence({ ...base, ...over });

describe("the confidence ladder", () => {
  it("reports FOUND for an explicit, exactly matched, unambiguous field", () => {
    expect(verdict({}).level).toBe("FOUND");
  });

  it("reports INFERRED for a derived value", () => {
    const result = verdict({ evidenceType: "derived" });
    expect(result.level).toBe("INFERRED");
    expect(result.reasons.join(" ")).toMatch(/calculated from other terms/i);
  });

  it("destroys the answer when a citation could not be located", () => {
    const result = verdict({ anyQuoteDiscarded: true, matchKinds: [] });
    expect(result.level).toBe("UNCERTAIN");
    expect(result.reasons.join(" ")).toMatch(/could not be located/i);
  });

  it("refuses to report a value with no citation at all", () => {
    expect(verdict({ matchKinds: [] }).level).toBe("UNCERTAIN");
  });

  it("passes ambiguities through as the reasons the user sees", () => {
    const result = verdict({ ambiguities: ["Clause 12.4 may sit outside the cap."] });
    expect(result.level).toBe("UNCERTAIN");
    expect(result.reasons).toEqual(["Clause 12.4 may sit outside the cap."]);
  });

  it("will not report a money field it cannot reduce to one figure", () => {
    expect(verdict({ unresolvedAmount: true }).level).toBe("UNCERTAIN");
  });
});

describe("silence versus doubt", () => {
  it("says NOT_FOUND when the document is silent and nothing suggests otherwise", () => {
    const result = verdict({ evidenceType: "absent", matchKinds: [], hasCandidateClause: false });
    expect(result.level).toBe("NOT_FOUND");
    expect(result.reasons.join(" ")).toMatch(/no provision of this kind/i);
  });

  it("says UNCERTAIN when the model found nothing but related wording exists", () => {
    const result = verdict({ evidenceType: "absent", matchKinds: [], hasCandidateClause: true });
    expect(result.level).toBe("UNCERTAIN");
    expect(result.reasons.join(" ")).toMatch(/unread rather than absent/i);
  });
});

describe("OCR-limited spans", () => {
  it("cannot report FOUND when recognition was poor across the span", () => {
    expect(verdict({ ocrMean: 74, ocrMin: 22 }).level).toBe("UNCERTAIN");
  });

  it("hedges when the word carrying the value was badly recognised", () => {
    const result = verdict({ ocrMean: 94, ocrMin: 22, ocrMinIsValueScoped: true });
    expect(result.level).toBe("UNCERTAIN");
    expect(result.reasons.join(" ")).toMatch(/carrying this value/i);
  });

  it("hedges when two or more words across the span were badly recognised", () => {
    const result = verdict({ ocrMean: 94, ocrMin: 22, ocrPoorWordCount: 2 });
    expect(result.level).toBe("UNCERTAIN");
    expect(result.reasons.join(" ")).toMatch(/several words/i);
  });

  it("does not hedge on one poorly recognised word away from the value", () => {
    // A single low-confidence word on a scan is normal — usually a stray mark,
    // not the text that carries the answer. One is not enough on its own.
    expect(verdict({ ocrMean: 94, ocrMin: 22, ocrPoorWordCount: 1 }).level).toBe("FOUND");
  });

  it("allows FOUND on a clean scan", () => {
    expect(verdict({ ocrMean: 96, ocrMin: 95 }).level).toBe("FOUND");
  });

  it("allows FOUND on an ordinary scan averaging in the mid-80s", () => {
    // A typical Tesseract read of a legible page. The old floor of 90 hedged
    // on this; the value-carrying words are still clean (ocrMin 84).
    expect(verdict({ ocrMean: 85, ocrMin: 84 }).level).toBe("FOUND");
  });
});

describe("fuzzy citations cost a level", () => {
  it("downgrades FOUND to INFERRED when one of several quotes was only approximate", () => {
    expect(verdict({ matchKinds: ["exact", "fuzzy"] }).level).toBe("INFERRED");
  });

  it("falls to UNCERTAIN when every quote was only approximate", () => {
    expect(verdict({ matchKinds: ["fuzzy"] }).level).toBe("UNCERTAIN");
  });

  it("downgrades INFERRED to UNCERTAIN", () => {
    expect(verdict({ evidenceType: "derived", matchKinds: ["exact", "fuzzy"] }).level).toBe("UNCERTAIN");
  });

  it("leaves an exact-and-normalised mix at full confidence", () => {
    expect(verdict({ matchKinds: ["exact", "normalised"] }).level).toBe("FOUND");
  });
});

describe("weakest", () => {
  it("returns the least confident of its inputs", () => {
    expect(weakest(["FOUND", "INFERRED"])).toBe("INFERRED");
    expect(weakest(["FOUND", "UNCERTAIN", "INFERRED"])).toBe("UNCERTAIN");
    expect(weakest(["UNCERTAIN", "NOT_FOUND"])).toBe("NOT_FOUND");
    expect(weakest(["FOUND", "FOUND"])).toBe("FOUND");
  });

  it("treats no inputs as nothing found", () => {
    expect(weakest([])).toBe("NOT_FOUND");
  });
});

describe("candidate-clause probes", () => {
  it("fires on a real exclusivity provision", () => {
    expect(
      hasCandidateClause("exclusivity", "The Supplier appoints the Distributor as its exclusive distributor."),
    ).toBe(true);
  });

  it("fires on a sole appointment and on a restrictive covenant", () => {
    expect(hasCandidateClause("exclusivity", "appointed as sole distributor for the Territory")).toBe(true);
    expect(hasCandidateClause("exclusivity", "subject to the restrictive covenant in clause 9")).toBe(true);
  });

  it("is not fooled by 'exclusive of GST'", () => {
    expect(
      hasCandidateClause("exclusivity", "The Subscription Fee is S$40,000 per annum, exclusive of GST."),
    ).toBe(false);
  });

  it("is not fooled by 'exclusive jurisdiction'", () => {
    expect(
      hasCandidateClause("exclusivity", "The parties submit to the exclusive jurisdiction of the Singapore courts."),
    ).toBe(false);
  });

  it("still fires when a false friend sits alongside a real provision", () => {
    expect(
      hasCandidateClause(
        "exclusivity",
        "Fees are exclusive of GST. The Supplier appoints the Distributor as its exclusive distributor.",
      ),
    ).toBe(true);
  });

  it("finds no candidate in a document that genuinely has none", () => {
    const nda =
      "Each party shall keep the Confidential Information secret. Nothing in this Agreement grants any right other than the limited right to use it. The parties submit to the jurisdiction of the Singapore courts.";
    expect(hasCandidateClause("exclusivity", nda)).toBe(false);
  });
});
