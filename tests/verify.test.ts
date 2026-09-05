/**
 * Verification is the load-bearing claim of this whole system: no quote reaches
 * the user unless we located it in our own text. These tests exist to make that
 * claim checkable rather than asserted.
 *
 * The most important test in the file is the one asserting that an unlocatable
 * quote returns null — because that is what forces the caller to destroy the
 * extraction rather than degrade it into a hedged answer with a fabricated quote
 * still on screen.
 */

import { describe, expect, it } from "vitest";
import { normalise, similarity } from "../lib/normalise.ts";
import { FUZZY_THRESHOLD, verifyQuote } from "../lib/verify.ts";
import { FIXTURE_TEXT, makeFixtureDoc, makeFixtureDocx } from "./fixtures/parsed-doc.ts";

const doc = makeFixtureDoc();

describe("normalise", () => {
  it("maps every normalised character back to a real original index", () => {
    const { text, map } = normalise(doc.fullText);
    expect(map).toHaveLength(text.length);
    for (const index of map) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(doc.fullText.length);
    }
  });

  it("keeps the map non-decreasing, so spans never invert", () => {
    const { map } = normalise(doc.fullText);
    for (let i = 1; i < map.length; i += 1) expect(map[i]).toBeGreaterThanOrEqual(map[i - 1]);
  });

  it("collapses whitespace runs to a single space", () => {
    expect(normalise("a   \n\t b").text).toBe("a b");
  });

  it("expands ligatures", () => {
    expect(normalise("conﬁdential").text).toBe("confidential");
  });

  it("maps both halves of an expanded ligature back to the one source character", () => {
    const { text, map } = normalise("aﬁb");
    expect(text).toBe("afib");
    expect(map[1]).toBe(1);
    expect(map[2]).toBe(1);
    expect(map[3]).toBe(2);
  });

  it("removes a hyphen at a line break", () => {
    expect(normalise("indem-\nnity").text).toBe("indemnity");
  });

  it("does not remove a hyphen that is not at a line break", () => {
    expect(normalise("twenty-four").text).toBe("twenty-four");
  });

  it("unifies curly quotes and dashes", () => {
    expect(normalise("“Subscription Fee” – — ’").text).toBe(`"subscription fee" - - '`);
  });
});

describe("similarity", () => {
  it("is 1 for identical strings and 0 for nothing in common", () => {
    expect(similarity("abc", "abc")).toBe(1);
    expect(similarity("aaaa", "bbbb")).toBe(0);
  });

  it("degrades with edit distance", () => {
    expect(similarity("the quick brown fox", "the quick brown box")).toBeGreaterThan(0.9);
    expect(similarity("the quick brown fox", "entirely different")).toBeLessThan(0.5);
  });
});

describe("verifyQuote — tier 1, exact", () => {
  it("locates an exact substring and reports the span", () => {
    const quote = "The total liability of the Supplier shall not exceed";
    const result = verifyQuote(quote, doc);

    expect(result).not.toBeNull();
    expect(result!.matchKind).toBe("exact");
    expect(doc.fullText.slice(result!.charStart, result!.charEnd)).toBe(quote);
  });

  it("returns OUR text at the span, not the string the model supplied", () => {
    // The model offers straight quotes; the document has curly ones.
    const result = verifyQuote(`the "Subscription Fee" of S$40,000`, doc);

    expect(result).not.toBeNull();
    expect(result!.quotedText).toContain("“Subscription Fee”");
    expect(result!.quotedText).toBe(doc.fullText.slice(result!.charStart, result!.charEnd));
  });
});

describe("verifyQuote — tier 2, normalised", () => {
  it("matches across collapsed whitespace", () => {
    const result = verifyQuote("This    Agreement\n\n  commences on 1 January 2026", doc);
    expect(result?.matchKind).toBe("normalised");
  });

  it("matches a ligature written out in full", () => {
    const result = verifyQuote("shall keep confidential all information", doc);
    expect(result?.matchKind).toBe("normalised");
    expect(result!.quotedText).toContain("ﬁ");
  });

  it("matches across a hyphenated line break", () => {
    const result = verifyQuote("provide an indemnity in respect of any claim", doc);
    expect(result?.matchKind).toBe("normalised");
  });

  it("matches when the model straightens curly quotes and dashes", () => {
    const result = verifyQuote("under this Agreement - including pricing - for the duration", doc);
    expect(result?.matchKind).toBe("normalised");
  });

  it("matches regardless of case", () => {
    const result = verifyQuote("THE TOTAL LIABILITY OF THE SUPPLIER", doc);
    expect(result?.matchKind).toBe("normalised");
  });
});

describe("verifyQuote — tier 3, fuzzy", () => {
  const NEAR_MISS =
    "The Supplier shall provide an indemnity in respect of each claim that the deliverables infringe third party rights";

  it("accepts a near-miss above the threshold and labels it fuzzy", () => {
    // "any claim" misquoted as "each claim" — the sort of paraphrase a model
    // makes, in a sentence that is unmistakably the same clause.
    expect(verifyQuote(NEAR_MISS, doc)?.matchKind).toBe("fuzzy");
  });

  it("still returns our text rather than the model's approximation", () => {
    const result = verifyQuote(NEAR_MISS, doc)!;
    expect(result.quotedText).toBe(doc.fullText.slice(result.charStart, result.charEnd));
    // Our text has the word broken across a line; the model's did not.
    expect(result.quotedText).toContain("indem-");
    expect(result.quotedText).toContain("any claim");
  });
});

describe("verifyQuote — tier 4, discard", () => {
  it("returns null for a quote that is not in the document at all", () => {
    const result = verifyQuote(
      "The Supplier warrants that the Platform will be free from all defects in perpetuity",
      doc,
    );
    expect(result).toBeNull();
  });

  it("returns null rather than stretching to a weak partial match", () => {
    expect(verifyQuote("liability shall be entirely unlimited and uncapped forever", doc)).toBeNull();
  });

  it("returns null for an empty or whitespace-only quote", () => {
    expect(verifyQuote("", doc)).toBeNull();
    expect(verifyQuote("   \n  ", doc)).toBeNull();
  });

  it("never returns a fuzzy match whose span is below the stated threshold", () => {
    const quote =
      "The Supplier shall provide an indemnity in respect of each claim that the deliverables infringe third party rights";
    const result = verifyQuote(quote, doc)!;

    expect(result.matchKind).toBe("fuzzy");
    const score = similarity(normalise(quote).text, normalise(result.quotedText).text);
    expect(score).toBeGreaterThanOrEqual(FUZZY_THRESHOLD);
  });
});

describe("verifyQuote — page derivation", () => {
  it("derives the page from the matched offsets, on page 1", () => {
    const result = verifyQuote("This Agreement commences on 1 January 2026", doc);
    expect(result!.pageNum).toBe(1);
    expect(result!.spansPages).toBe(false);
  });

  it("derives page 2 for text on the second page", () => {
    const result = verifyQuote("Ninety (90) business days notice is required", doc);
    expect(result!.pageNum).toBe(2);
  });

  it("flags a span that crosses the page boundary and reports its starting page", () => {
    const quote = "for the duration of the term and\n\nfor three years afterwards.";
    const result = verifyQuote(quote, doc);

    expect(result).not.toBeNull();
    expect(result!.spansPages).toBe(true);
    expect(result!.pageNum).toBe(1);
    expect([...new Set(result!.bboxes.map((b) => b.pageNum))]).toEqual([1, 2]);
  });

  it("reports no page at all for an unpaginated document", () => {
    const docx = makeFixtureDocx();
    const result = verifyQuote("This Agreement continues for twenty-four (24) months", docx);
    expect(result).not.toBeNull();
    expect(result!.pageNum).toBeNull();
  });
});

describe("verifyQuote — OCR confidence over the span", () => {
  it("carries the worst and mean confidence of the words the span covers", () => {
    const result = verifyQuote("shall not exceed $$100,000. in aggregate", doc);

    expect(result!.ocrConfidenceMin).toBe(22);
    expect(result!.ocrConfidenceMean).toBeGreaterThan(22);
    expect(result!.ocrConfidenceMean).toBeLessThan(96);
  });

  it("reports clean confidence for a span that avoids the damaged words", () => {
    const result = verifyQuote("notice is required to prevent renewal", doc);
    expect(result!.ocrConfidenceMin).toBe(96);
  });

  it("reports null confidence for text that was never OCR'd", () => {
    const result = verifyQuote("This Agreement commences on 1 January 2026", doc);
    expect(result!.ocrConfidenceMin).toBeNull();
    expect(result!.ocrConfidenceMean).toBeNull();
  });
});

describe("verifyQuote — bounding boxes", () => {
  it("returns a box for every word the span covers, grouped by page", () => {
    const result = verifyQuote("Ninety (90) business days", doc);
    expect(result!.bboxes.length).toBeGreaterThan(0);
    expect(result!.bboxes.every((b) => b.pageNum === 2)).toBe(true);
    expect(result!.bboxes.every((b) => b.box.w > 0 && b.box.h > 0)).toBe(true);
  });

  it("returns no boxes for a document without geometry", () => {
    const docx = makeFixtureDocx();
    const result = verifyQuote("Alpha Pte Ltd and Beta Pte Ltd", docx);
    expect(result!.bboxes).toEqual([]);
  });
});

describe("fixture integrity", () => {
  it("keeps word offsets consistent with fullText", () => {
    for (const page of doc.pages) {
      for (const word of page.words) {
        expect(doc.fullText.slice(word.charStart, word.charEnd)).toBe(word.text);
      }
    }
  });

  it("splits the two pages where the test expects", () => {
    expect(doc.fullText.startsWith(FIXTURE_TEXT.PAGE_ONE)).toBe(true);
    expect(doc.fullText.endsWith(FIXTURE_TEXT.PAGE_TWO)).toBe(true);
  });
});
