/**
 * Quote verification — the load-bearing claim of the system.
 *
 * A quote the model produced is not evidence. It becomes evidence only once we
 * have found it in the text WE extracted, and can say where. Four tiers, in
 * order of decreasing certainty:
 *
 *   1. exact       the string is in our text, character for character
 *   2. normalised  it is there once whitespace, ligatures, line-break hyphens,
 *                  quotes, dashes and case are reconciled
 *   3. fuzzy       it is there to within an edit-distance threshold; the caller
 *                  must downgrade confidence for relying on it
 *   4. nothing     return null, and the caller destroys the extraction
 *
 * Tier 4 is the one that matters. Returning null is not a failure of this
 * module; it is the module working. A quote we cannot locate must never reach
 * the user, whatever the model claimed.
 *
 * Everything else — page number, bounding boxes, OCR confidence — is derived
 * from the matched offsets. The model is never asked where its quote lives, and
 * would not be believed if it said.
 */

import { bigramCounts, bigramDice, normalise, similarity } from "./normalise.ts";
import type { BBox, MatchKind, ParsedDoc, Word } from "./types.ts";

export const FUZZY_THRESHOLD = 0.92;
/** Below this mean OCR confidence over a span, a field cannot be FOUND. */
export const OCR_MEAN_FLOOR = 90;
/** Or below this for any single word in the span — one garbled figure is enough. */
export const OCR_MIN_FLOOR = 60;

/** Shortlist size for the coarse pass before edit distance is paid for. */
const FUZZY_CANDIDATES = 3;

export interface VerifyResult {
  matchKind: MatchKind;
  charStart: number;
  charEnd: number;
  /** null when the document is not paginated. Derived from offsets, never claimed. */
  pageNum: number | null;
  spansPages: boolean;
  bboxes: { pageNum: number; box: BBox }[];
  ocrConfidenceMean: number | null;
  ocrConfidenceMin: number | null;
  /** Our text at the span. Never the model's version of it. */
  quotedText: string;
}

/* ------------------------------------------------------------------ */
/* Deriving everything else from a matched span                        */
/* ------------------------------------------------------------------ */

function wordsInSpan(doc: ParsedDoc, charStart: number, charEnd: number): { pageNum: number; word: Word }[] {
  const hits: { pageNum: number; word: Word }[] = [];
  for (const page of doc.pages) {
    if (page.charEnd <= charStart || page.charStart >= charEnd) continue;
    for (const word of page.words) {
      if (word.charEnd <= charStart || word.charStart >= charEnd) continue;
      hits.push({ pageNum: page.pageNum, word });
    }
  }
  return hits;
}

function buildResult(
  doc: ParsedDoc,
  charStart: number,
  charEnd: number,
  matchKind: MatchKind,
): VerifyResult {
  const touchedPages = doc.pages.filter((p) => p.charEnd > charStart && p.charStart < charEnd);
  const hits = wordsInSpan(doc, charStart, charEnd);

  // Weight OCR confidence by how much of each word the span actually covers, so
  // a long clean quote is not rescued by, nor condemned by, one edge word.
  let weighted = 0;
  let weight = 0;
  let min: number | null = null;
  for (const { word } of hits) {
    if (word.ocrConfidence === null) continue;
    const overlap = Math.min(charEnd, word.charEnd) - Math.max(charStart, word.charStart);
    if (overlap <= 0) continue;
    weighted += word.ocrConfidence * overlap;
    weight += overlap;
    min = min === null ? word.ocrConfidence : Math.min(min, word.ocrConfidence);
  }

  return {
    matchKind,
    charStart,
    charEnd,
    pageNum: doc.paginated ? (touchedPages[0]?.pageNum ?? null) : null,
    spansPages: touchedPages.length > 1,
    bboxes: hits
      .filter((h): h is { pageNum: number; word: Word & { bbox: BBox } } => h.word.bbox !== null)
      .map((h) => ({ pageNum: h.pageNum, box: h.word.bbox })),
    ocrConfidenceMean: weight > 0 ? weighted / weight : null,
    ocrConfidenceMin: min,
    quotedText: doc.fullText.slice(charStart, charEnd),
  };
}

/* ------------------------------------------------------------------ */
/* The fuzzy tier                                                      */
/* ------------------------------------------------------------------ */

/**
 * Coarse pass with a cheap bigram score to shortlist windows, then edit
 * distance on the shortlist. Scanning every offset with Levenshtein would be
 * accurate and far too slow; scanning with bigrams alone would accept
 * reorderings that are not the same sentence.
 */
function findFuzzy(haystack: string, needle: string): { start: number; end: number; score: number } | null {
  const length = needle.length;
  if (length < 12 || haystack.length < length) return null;

  const needleBigrams = bigramCounts(needle);
  const coarseStep = Math.max(1, Math.floor(length / 8));

  const shortlist: { offset: number; score: number }[] = [];
  for (let offset = 0; offset + length <= haystack.length; offset += coarseStep) {
    shortlist.push({ offset, score: bigramDice(needleBigrams, haystack.slice(offset, offset + length)) });
  }
  shortlist.sort((a, b) => b.score - a.score);

  let best: { start: number; end: number; score: number } | null = null;
  const fineStep = Math.max(1, Math.floor(length / 40));

  for (const candidate of shortlist.slice(0, FUZZY_CANDIDATES)) {
    const from = Math.max(0, candidate.offset - Math.floor(length / 8));
    const to = Math.min(haystack.length - 1, candidate.offset + Math.floor(length / 8));

    for (let offset = from; offset <= to; offset += fineStep) {
      // The true span may be slightly longer than the quote (a dropped word, an
      // expanded ligature), so try a little slack as well as the exact length.
      for (const windowLength of [length, Math.round(length * 1.08)]) {
        const end = Math.min(haystack.length, offset + windowLength);
        const score = similarity(needle, haystack.slice(offset, end));
        if (!best || score > best.score) best = { start: offset, end, score };
      }
    }
  }

  return best && best.score >= FUZZY_THRESHOLD ? best : null;
}

/* ------------------------------------------------------------------ */

export function verifyQuote(quote: string, doc: ParsedDoc): VerifyResult | null {
  if (quote.trim().length === 0) return null;

  // Tier 1 — exact.
  const exactIndex = doc.fullText.indexOf(quote);
  if (exactIndex !== -1) {
    return buildResult(doc, exactIndex, exactIndex + quote.length, "exact");
  }

  const haystack = normalise(doc.fullText);
  const needle = normalise(quote);
  if (needle.text.length === 0) return null;

  /** Normalised offsets back to original offsets, via the map. */
  const toOriginal = (start: number, endExclusive: number): [number, number] => [
    haystack.map[start],
    haystack.map[endExclusive - 1] + 1,
  ];

  // Tier 2 — normalised.
  const normalisedIndex = haystack.text.indexOf(needle.text);
  if (normalisedIndex !== -1) {
    const [start, end] = toOriginal(normalisedIndex, normalisedIndex + needle.text.length);
    return buildResult(doc, start, end, "normalised");
  }

  // Tier 3 — fuzzy, and the caller downgrades for it.
  const fuzzy = findFuzzy(haystack.text, needle.text);
  if (fuzzy) {
    const [start, end] = toOriginal(fuzzy.start, fuzzy.end);
    return buildResult(doc, start, end, "fuzzy");
  }

  // Tier 4 — we could not find it. The caller must discard the extraction.
  return null;
}
