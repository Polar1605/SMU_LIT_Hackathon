/**
 * Conflict detection is the one finding in the product that no single document
 * contains, so it is the one most likely to be wrong in a way nobody notices.
 * These tests are built from inline fixtures rather than the corpus so they keep
 * passing when the corpus is regenerated with different dates.
 *
 * The case that matters most is the planted one: an EXCLUSIVE appointment in one
 * agreement against a SOLE appointment in another over the same territory and
 * product. It is a real conflict, and the same document also carries a
 * ["WORLD-EXCEPT-SG"] restrictive covenant that must not be mistaken for cover
 * of ["SG"] — the trap is a detector clever enough to reason about geography.
 */

import { describe, expect, it } from "vitest";
import { detectExclusivityConflicts, grantsOverlap } from "../lib/conflicts.ts";
import type { ContractResult, Grant } from "../lib/types.ts";

function grant(over: Partial<Grant> & Pick<Grant, "id" | "docId">): Grant {
  return {
    docTitle: `Document ${over.docId}`,
    grantee: "Apex Scientific Pte Ltd",
    grantor: "Kestrel Instruments Limited",
    exclusivityType: "exclusive",
    territoryLabel: "Singapore",
    territoryCodes: ["SG"],
    productLabel: "Product Category X",
    productCodes: ["CATX"],
    start: "2025-01-01",
    end: "2027-12-31",
    confidence: "FOUND",
    reasons: [],
    citations: [],
    discardedQuoteCount: 0,
    scopeUnverified: false,
    ...over,
  };
}

function contract(docId: string, grants: Grant[]): ContractResult {
  return {
    docId,
    title: `Document ${docId}`,
    fileName: `${docId}.pdf`,
    format: "pdf",
    paginated: true,
    ocrPages: [],
    fields: [],
    payments: [],
    grants,
  };
}

/** The planted pair from our corpus: exclusive to Apex, sole to Lionbridge. */
const apexExclusive = grant({
  id: "g-apex",
  docId: "dist-a",
  docTitle: "Kestrel–Apex Distribution Agreement",
  grantee: "Apex Scientific Pte Ltd",
  exclusivityType: "exclusive",
});

/** The mirror-image covenant that lives in the same document as the grant above. */
const apexCovenant = grant({
  id: "g-apex-covenant",
  docId: "dist-a",
  docTitle: "Kestrel–Apex Distribution Agreement",
  grantee: "Kestrel Instruments Limited",
  grantor: "Apex Scientific Pte Ltd",
  exclusivityType: "exclusive",
  territoryLabel: "Worldwide excluding Singapore",
  territoryCodes: ["WORLD-EXCEPT-SG"],
});

const lionbridgeSole = grant({
  id: "g-lion",
  docId: "dist-b",
  docTitle: "Kestrel–Lionbridge Distribution Agreement",
  grantee: "Lionbridge Distribution Pte Ltd",
  exclusivityType: "sole",
  start: "2026-04-01",
  // An auto-renewing appointment genuinely has no end date to record.
  end: null,
});

describe("the planted exclusive-versus-sole conflict", () => {
  const conflicts = detectExclusivityConflicts([
    contract("dist-a", [apexExclusive, apexCovenant]),
    contract("dist-b", [lionbridgeSole]),
  ]);

  it("reports exactly one conflict between the two distribution agreements", () => {
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].grants.map((g) => g.id).sort()).toEqual(["g-apex", "g-lion"]);
  });

  it("reports the shared territory and product it overlapped on", () => {
    expect(conflicts[0].overlapTerritories).toEqual(["SG"]);
    expect(conflicts[0].overlapProducts).toEqual(["CATX"]);
  });

  it("opens the overlap window at the later start and closes it at the only fixed end", () => {
    expect(conflicts[0].overlapFrom).toBe("2026-04-01");
    // Lionbridge's appointment auto-renews with no end date, so the window is
    // bounded only by the Apex term, not by the missing one.
    expect(conflicts[0].overlapTo).toBe("2027-12-31");
  });

  it("does not treat the WORLD-EXCEPT-SG covenant as covering Singapore", () => {
    const overlap = grantsOverlap(apexCovenant, lionbridgeSole);
    expect(overlap.overlaps).toBe(false);
    expect(overlap.territories).toEqual([]);
  });

  it("names both documents, both grantees, the territory and the product in the explanation", () => {
    const { explanation } = conflicts[0];
    expect(explanation).toContain("Kestrel–Apex Distribution Agreement");
    expect(explanation).toContain("Kestrel–Lionbridge Distribution Agreement");
    expect(explanation).toContain("Apex Scientific Pte Ltd");
    expect(explanation).toContain("Lionbridge Distribution Pte Ltd");
    expect(explanation).toContain("SG");
    expect(explanation).toContain("CATX");
  });

  it("spells out that exclusive means nobody else and sole means no further appointment", () => {
    const { explanation } = conflicts[0];
    expect(explanation).toMatch(/nobody else may act/i);
    expect(explanation).toMatch(/appoint nobody else/i);
    expect(explanation).toMatch(/a sole appointment is still an appointment/i);
  });

  it("still conflicts when the Apex term is itself open-ended, saying so in plain English", () => {
    const openEnded = detectExclusivityConflicts([
      contract("dist-a", [{ ...apexExclusive, end: null }]),
      contract("dist-b", [lionbridgeSole]),
    ]);
    expect(openEnded).toHaveLength(1);
    expect(openEnded[0].overlapTo).toBeNull();
    expect(openEnded[0].explanation).toMatch(/no fixed end date/i);
  });
});

describe("what is not a conflict", () => {
  it("ignores grants whose territories do not intersect", () => {
    const conflicts = detectExclusivityConflicts([
      contract("a", [grant({ id: "g1", docId: "a", territoryCodes: ["SG"] })]),
      contract("b", [
        grant({ id: "g2", docId: "b", grantee: "Other Co Pte Ltd", territoryCodes: ["MY"] }),
      ]),
    ]);
    expect(conflicts).toEqual([]);
  });

  it("ignores grants whose product scopes do not intersect", () => {
    const conflicts = detectExclusivityConflicts([
      contract("a", [grant({ id: "g1", docId: "a", productCodes: ["CATX"] })]),
      contract("b", [
        grant({ id: "g2", docId: "b", grantee: "Other Co Pte Ltd", productCodes: ["CATY"] }),
      ]),
    ]);
    expect(conflicts).toEqual([]);
  });

  it("ignores grants whose date ranges do not overlap", () => {
    const conflicts = detectExclusivityConflicts([
      contract("a", [grant({ id: "g1", docId: "a", start: "2024-01-01", end: "2024-12-31" })]),
      contract("b", [
        grant({
          id: "g2",
          docId: "b",
          grantee: "Other Co Pte Ltd",
          start: "2025-01-01",
          end: "2025-12-31",
        }),
      ]),
    ]);
    expect(conflicts).toEqual([]);
  });

  it("never flags two non-exclusive grants, however completely they overlap", () => {
    const conflicts = detectExclusivityConflicts([
      contract("a", [grant({ id: "g1", docId: "a", exclusivityType: "non-exclusive" })]),
      contract("b", [
        grant({
          id: "g2",
          docId: "b",
          grantee: "Other Co Pte Ltd",
          exclusivityType: "non-exclusive",
        }),
      ]),
    ]);
    expect(conflicts).toEqual([]);
  });

  it("does not flag the same company holding the same rights under two agreements", () => {
    const conflicts = detectExclusivityConflicts([
      contract("a", [grant({ id: "g1", docId: "a", grantee: "Apex Scientific Pte Ltd" })]),
      contract("b", [grant({ id: "g2", docId: "b", grantee: "Apex Scientific Pte Ltd" })]),
    ]);
    expect(conflicts).toEqual([]);
  });

  it("treats the same grantee written with different casing and spacing as one entity", () => {
    const conflicts = detectExclusivityConflicts([
      contract("a", [grant({ id: "g1", docId: "a", grantee: "Apex Scientific Pte Ltd" })]),
      contract("b", [grant({ id: "g2", docId: "b", grantee: "  apex   SCIENTIFIC pte ltd " })]),
    ]);
    expect(conflicts).toEqual([]);
  });

  it("does not fuzzy-match two similar but distinct company names", () => {
    const conflicts = detectExclusivityConflicts([
      contract("a", [grant({ id: "g1", docId: "a", grantee: "Apex Scientific Pte Ltd" })]),
      contract("b", [
        grant({ id: "g2", docId: "b", grantee: "Apex Scientific Holdings Pte Ltd" }),
      ]),
    ]);
    expect(conflicts).toHaveLength(1);
  });

  it("never compares two grants inside a single document", () => {
    const exclusive = grant({ id: "g1", docId: "solo", grantee: "Apex Scientific Pte Ltd" });
    const covenant = grant({ id: "g2", docId: "solo", grantee: "Kestrel Instruments Limited" });
    expect(detectExclusivityConflicts([contract("solo", [exclusive, covenant])])).toEqual([]);
  });

  it("returns nothing for an empty corpus or a corpus with no grants", () => {
    expect(detectExclusivityConflicts([])).toEqual([]);
    expect(detectExclusivityConflicts([contract("a", []), contract("b", [])])).toEqual([]);
  });
});

describe("date ranges with open ends", () => {
  it("treats a null end as running forever, so an old grant still conflicts with a new one", () => {
    const conflicts = detectExclusivityConflicts([
      contract("a", [grant({ id: "g1", docId: "a", start: "2020-01-01", end: null })]),
      contract("b", [
        grant({
          id: "g2",
          docId: "b",
          grantee: "Other Co Pte Ltd",
          start: "2030-01-01",
          end: "2032-01-01",
        }),
      ]),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].overlapFrom).toBe("2030-01-01");
    expect(conflicts[0].overlapTo).toBe("2032-01-01");
  });

  it("treats a null start as running from before time, and reports the later start", () => {
    const overlap = grantsOverlap(
      grant({ id: "g1", docId: "a", start: null, end: "2026-06-30" }),
      grant({ id: "g2", docId: "b", start: "2025-01-01", end: null }),
    );
    expect(overlap.overlaps).toBe(true);
    expect(overlap.from).toBe("2025-01-01");
    expect(overlap.to).toBe("2026-06-30");
  });

  it("leaves both ends null when neither document bounds the period", () => {
    const overlap = grantsOverlap(
      grant({ id: "g1", docId: "a", start: null, end: null }),
      grant({ id: "g2", docId: "b", start: null, end: null }),
    );
    expect(overlap.overlaps).toBe(true);
    expect(overlap.from).toBeNull();
    expect(overlap.to).toBeNull();
  });

  it("counts a single shared day as an overlap, because both promises are live on it", () => {
    const overlap = grantsOverlap(
      grant({ id: "g1", docId: "a", start: "2025-01-01", end: "2026-01-01" }),
      grant({ id: "g2", docId: "b", start: "2026-01-01", end: "2027-01-01" }),
    );
    expect(overlap.overlaps).toBe(true);
    expect(overlap.from).toBe("2026-01-01");
    expect(overlap.to).toBe("2026-01-01");
  });
});

describe("codes are matched case-insensitively", () => {
  it("intersects lowercase codes with uppercase ones and reports them uppercased", () => {
    const overlap = grantsOverlap(
      grant({ id: "g1", docId: "a", territoryCodes: ["sg", "my"], productCodes: ["catx"] }),
      grant({ id: "g2", docId: "b", territoryCodes: ["SG"], productCodes: ["CATX", "CATY"] }),
    );
    expect(overlap.overlaps).toBe(true);
    expect(overlap.territories).toEqual(["SG"]);
    expect(overlap.products).toEqual(["CATX"]);
  });
});

describe("every restricting combination is caught", () => {
  const pair = (a: Grant["exclusivityType"], b: Grant["exclusivityType"]) =>
    detectExclusivityConflicts([
      contract("a", [grant({ id: "g1", docId: "a", exclusivityType: a })]),
      contract("b", [
        grant({ id: "g2", docId: "b", grantee: "Other Co Pte Ltd", exclusivityType: b }),
      ]),
    ]);

  it("flags exclusive against exclusive", () => {
    const conflicts = pair("exclusive", "exclusive");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].explanation).toMatch(/both grants are exclusive/i);
  });

  it("flags sole against sole and says the grantor promised the same restraint twice", () => {
    const conflicts = pair("sole", "sole");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].explanation).toMatch(/appoint nobody else/i);
    expect(conflicts[0].explanation).toMatch(/two different companies have been appointed/i);
  });

  it("flags exclusive against non-exclusive, explaining the non-exclusive grant restricts nobody", () => {
    const conflicts = pair("exclusive", "non-exclusive");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].explanation).toMatch(/no restriction/i);
    expect(conflicts[0].explanation).toMatch(/would breach/i);
  });

  it("flags sole against non-exclusive as a second appointment over the same scope", () => {
    const conflicts = pair("sole", "non-exclusive");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].explanation).toMatch(/second appointment/i);
  });
});

describe("confidence propagates and never launders", () => {
  const withConfidences = (a: Grant["confidence"], b: Grant["confidence"]) =>
    detectExclusivityConflicts([
      contract("a", [grant({ id: "g1", docId: "a", confidence: a })]),
      contract("b", [
        grant({ id: "g2", docId: "b", grantee: "Other Co Pte Ltd", confidence: b })
      ]),
    ])[0];

  it("stays UNCERTAIN when both grants were only UNCERTAIN", () => {
    const conflict = withConfidences("UNCERTAIN", "UNCERTAIN");
    expect(conflict.confidence).toBe("UNCERTAIN");
  });

  it("takes the weaker confidence when one grant was read with full confidence", () => {
    expect(withConfidences("FOUND", "UNCERTAIN").confidence).toBe("UNCERTAIN");
    expect(withConfidences("FOUND", "INFERRED").confidence).toBe("INFERRED");
    expect(withConfidences("FOUND", "FOUND").confidence).toBe("FOUND");
  });

  it("explains in the reasons which grant limited the confidence", () => {
    const conflict = withConfidences("FOUND", "UNCERTAIN");
    const reasons = conflict.reasons.join(" ");
    expect(reasons).toContain("UNCERTAIN");
    expect(reasons).toMatch(/never more certain than the grants it is built on/i);
    expect(reasons).toMatch(/check both clauses in the source documents/i);
  });

  it("carries each grant's own reasons through, attributed to its document", () => {
    const conflicts = detectExclusivityConflicts([
      contract("a", [
        grant({
          id: "g1",
          docId: "a",
          docTitle: "Agreement A",
          confidence: "UNCERTAIN",
          reasons: ["The territory schedule was unreadable on the scan."],
        }),
      ]),
      contract("b", [grant({ id: "g2", docId: "b", grantee: "Other Co Pte Ltd" })]),
    ]);
    expect(conflicts[0].reasons).toContain(
      "Agreement A: The territory schedule was unreadable on the scan.",
    );
  });
});

describe("output is deterministic", () => {
  const a = contract("dist-a", [apexExclusive, apexCovenant]);
  const b = contract("dist-b", [lionbridgeSole]);

  it("produces the same id whichever order the documents arrive in", () => {
    const forward = detectExclusivityConflicts([a, b]);
    const reverse = detectExclusivityConflicts([b, a]);
    expect(forward).toHaveLength(1);
    expect(reverse).toHaveLength(1);
    expect(forward[0].id).toBe(reverse[0].id);
  });

  it("produces the identical conflict object whichever order the documents arrive in", () => {
    expect(detectExclusivityConflicts([a, b])).toEqual(detectExclusivityConflicts([b, a]));
  });

  it("builds the id from both document ids and the shared codes", () => {
    const { id } = detectExclusivityConflicts([a, b])[0];
    expect(id).toContain("dist-a");
    expect(id).toContain("dist-b");
    expect(id).toContain("SG");
    expect(id).toContain("CATX");
  });

  it("never emits the same pair twice", () => {
    const conflicts = detectExclusivityConflicts([a, b]);
    expect(new Set(conflicts.map((c) => c.id)).size).toBe(conflicts.length);
  });

  it("gives distinct ids to distinct conflicting pairs within the same two documents", () => {
    const conflicts = detectExclusivityConflicts([
      contract("a", [
        grant({ id: "g1", docId: "a", productCodes: ["CATX"] }),
        grant({ id: "g2", docId: "a", productCodes: ["CATX"], territoryCodes: ["MY"] }),
      ]),
      contract("b", [
        grant({
          id: "g3",
          docId: "b",
          grantee: "Other Co Pte Ltd",
          territoryCodes: ["SG", "MY"],
        }),
      ]),
    ]);
    expect(conflicts).toHaveLength(2);
    expect(new Set(conflicts.map((c) => c.id)).size).toBe(2);
  });

  it("returns conflicts in a stable sorted order regardless of input order", () => {
    const c = contract("dist-c", [
      grant({
        id: "g-third",
        docId: "dist-c",
        docTitle: "Third Agreement",
        grantee: "Meridian Supply Pte Ltd",
        exclusivityType: "sole",
      }),
    ]);
    const one = detectExclusivityConflicts([a, b, c]).map((x) => x.id);
    const two = detectExclusivityConflicts([c, b, a]).map((x) => x.id);
    expect(one).toEqual(two);
    expect(one).toEqual([...one].sort());
  });

  it("ignores the same document handed in twice rather than conflicting it with itself", () => {
    expect(detectExclusivityConflicts([a, a])).toEqual([]);
  });
});
