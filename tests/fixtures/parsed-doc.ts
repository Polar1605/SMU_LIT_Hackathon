/**
 * A hand-built ParsedDoc with known offsets, for testing verification without
 * touching pdfjs, tesseract or the filesystem.
 *
 * It deliberately contains every input that the normaliser has to survive:
 * a ligature, a hyphenated line break, curly quotes, an en-dash, collapsed
 * whitespace, a clause that runs across the page boundary, and an OCR page
 * where two words carry low confidence.
 */

import type { ParsedDoc, Page, Word } from "../../lib/types.ts";

const PAGE_ONE = `1.1 Term. This Agreement commences on 1 January 2026 and continues for twelve (12) months.

1.2 Fees. The Customer shall pay the “Subscription Fee” of S$40,000 per annum, exclusive of GST.

1.3 Indemnity. The Supplier shall provide an indem-
nity in respect of any claim that the deliverables infringe third party rights.

1.4 Confidentiality. Each party shall keep conﬁdential all information disclosed under this Agreement — including pricing — for the duration of the term and`;

const PAGE_TWO = `for three years afterwards.

2.1 Liability. The total liability of the Supplier shall not exceed $$100,000. in aggregate.

2.2 Notice. Ninety (90) business days notice is required to prevent renewal.`;

/** Words whose OCR confidence is deliberately poor, keyed by exact text. */
const LOW_CONFIDENCE: Record<string, number> = {
  "$$100,000.": 22,
  Ninety: 54,
};

const OCR_DEFAULT = 96;

function buildWords(text: string, pageOffset: number, ocr: boolean): Word[] {
  const words: Word[] = [];
  let line = 0;
  let lineStart = 0;

  for (const match of text.matchAll(/\S+|\n/g)) {
    if (match[0] === "\n") {
      line += 1;
      lineStart = match.index + 1;
      continue;
    }
    const column = match.index - lineStart;
    words.push({
      text: match[0],
      charStart: pageOffset + match.index,
      charEnd: pageOffset + match.index + match[0].length,
      // Synthetic but deterministic geometry: enough to assert boxes are
      // produced, grouped and unioned, without pretending to be a real layout.
      bbox: { x: 64 + column * 5, y: 60 + line * 14, w: match[0].length * 5, h: 10 },
      ocrConfidence: ocr ? (LOW_CONFIDENCE[match[0]] ?? OCR_DEFAULT) : null,
    });
  }

  return words;
}

function buildPage(pageNum: number, text: string, pageOffset: number, ocr: boolean): Page {
  return {
    pageNum,
    charStart: pageOffset,
    charEnd: pageOffset + text.length,
    width: 595.28,
    height: 841.89,
    ocr,
    words: buildWords(text, pageOffset, ocr),
  };
}

const PAGE_SEPARATOR = "\n\n";

export function makeFixtureDoc(): ParsedDoc {
  const fullText = PAGE_ONE + PAGE_SEPARATOR + PAGE_TWO;
  const pageTwoOffset = PAGE_ONE.length + PAGE_SEPARATOR.length;

  return {
    docId: "fixture",
    fileName: "fixture.pdf",
    title: "Fixture Agreement",
    format: "pdf",
    paginated: true,
    ocrPages: [2],
    fullText,
    pages: [
      buildPage(1, PAGE_ONE, 0, false),
      buildPage(2, PAGE_TWO, pageTwoOffset, true),
    ],
  };
}

/** An unpaginated document, to check that DOCX citations never claim a page. */
export function makeFixtureDocx(): ParsedDoc {
  const text = `PARTIES\n\nThis Agreement is made between Alpha Pte Ltd and Beta Pte Ltd.\n\n6. Term. This Agreement continues for twenty-four (24) months from the Effective Date.`;
  return {
    docId: "fixture-docx",
    fileName: "fixture.docx",
    title: "Fixture NDA",
    format: "docx",
    paginated: false,
    ocrPages: [],
    fullText: text,
    pages: [
      {
        pageNum: 1,
        charStart: 0,
        charEnd: text.length,
        width: 0,
        height: 0,
        ocr: false,
        words: buildWords(text, 0, false).map((w) => ({ ...w, bbox: null })),
      },
    ],
  };
}

/** Exported so tests can assert against the exact source text. */
export const FIXTURE_TEXT = { PAGE_ONE, PAGE_TWO, PAGE_SEPARATOR };
