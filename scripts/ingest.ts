/**
 * Reads a folder of contracts into ParsedDoc JSON.
 *
 * The invariant this stage exists to establish, and asserts before writing:
 *
 *     fullText.slice(word.charStart, word.charEnd) === word.text
 *
 * Every page number, bounding box and OCR confidence downstream is derived from
 * character offsets into fullText. If the offsets are wrong, verify.ts will
 * happily "verify" a quote against the wrong span and the whole trust argument
 * collapses quietly. So words are never assembled independently — they are read
 * back out of the assembled text, which makes the invariant true by construction
 * and the assertion a guard against future edits rather than decoration.
 *
 *   npm run ingest
 *   npm run ingest -- --corpus ./some-folder
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";
import mammoth from "mammoth";

import { openPdf, type RawTextItem } from "../lib/pdf.ts";
import type { BBox, Page, ParsedDoc, StageOpts, Word } from "../lib/types.ts";

/** Below this many non-whitespace characters, a PDF page is treated as an image. */
const IMAGE_PAGE_THRESHOLD = 40;
/** OCR renders at 2x so tesseract has enough pixels to be worth trusting. */
const OCR_SCALE = 2;

/* ------------------------------------------------------------------ */
/* Assembling page text while keeping a map back to source geometry    */
/* ------------------------------------------------------------------ */

interface Placed {
  /** Offset within the page text. */
  start: number;
  end: number;
  bbox: BBox;
  ocrConfidence: number | null;
}

/**
 * Joins pdfjs text items into readable page text.
 *
 * pdfjs emits runs of glyphs, not words: joining them naively produces
 * "caused bynegligence". Since the model quotes from whatever text we produce,
 * bad joins become bad quotes, so we insert a space when neither side already
 * has whitespace, and a newline where pdfjs reports a line ending.
 */
function assemblePdfPage(items: RawTextItem[], pageHeight: number): { text: string; placed: Placed[] } {
  let text = "";
  const placed: Placed[] = [];

  for (const item of items) {
    if (item.str.length > 0) {
      const needsSpace =
        text.length > 0 && !/\s$/.test(text) && !/^\s/.test(item.str);
      if (needsSpace) text += " ";

      const start = text.length;
      text += item.str;

      // PDF space has a bottom-left origin; ours is top-left.
      placed.push({
        start,
        end: text.length,
        bbox: {
          x: item.transform[4],
          y: pageHeight - (item.transform[5] + item.height),
          w: item.width,
          h: item.height,
        },
        ocrConfidence: null,
      });
    }
    if (item.hasEOL) text += "\n";
  }

  return { text, placed };
}

/**
 * Derives words from the assembled text rather than from the source runs, so
 * the offset invariant holds by construction. A word's box is the union of the
 * boxes of the runs it overlaps, each interpolated by character position.
 */
function wordsFromText(text: string, placed: Placed[], pageOffset: number): Word[] {
  const words: Word[] = [];

  for (const match of text.matchAll(/\S+/g)) {
    const wordStart = match.index;
    const wordEnd = wordStart + match[0].length;

    const boxes: BBox[] = [];
    const confidences: number[] = [];

    for (const run of placed) {
      if (run.end <= wordStart || run.start >= wordEnd) continue;

      const runLength = run.end - run.start;
      const from = Math.max(wordStart, run.start) - run.start;
      const to = Math.min(wordEnd, run.end) - run.start;
      if (runLength > 0) {
        boxes.push({
          x: run.bbox.x + (run.bbox.w * from) / runLength,
          y: run.bbox.y,
          w: (run.bbox.w * (to - from)) / runLength,
          h: run.bbox.h,
        });
      }
      if (run.ocrConfidence !== null) confidences.push(run.ocrConfidence);
    }

    words.push({
      text: match[0],
      charStart: pageOffset + wordStart,
      charEnd: pageOffset + wordEnd,
      bbox: boxes.length > 0 ? unionBoxes(boxes) : null,
      ocrConfidence: confidences.length > 0 ? Math.min(...confidences) : null,
    });
  }

  return words;
}

function unionBoxes(boxes: BBox[]): BBox {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}

/* ------------------------------------------------------------------ */
/* OCR                                                                 */
/* ------------------------------------------------------------------ */

interface OcrWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  lineIndex: number;
}

/**
 * tesseract.js has moved its word geometry between `data.words` and the nested
 * blocks tree across versions, so we accept either rather than pinning to one
 * shape and breaking on the next release.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenOcrWords(data: any): OcrWord[] {
  const out: OcrWord[] = [];
  let lineIndex = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pushLine = (line: any) => {
    for (const word of line.words ?? []) {
      if (typeof word.text !== "string" || word.text.trim() === "") continue;
      out.push({
        text: word.text,
        confidence: typeof word.confidence === "number" ? word.confidence : 0,
        bbox: word.bbox,
        lineIndex,
      });
    }
    lineIndex += 1;
  };

  if (Array.isArray(data.lines) && data.lines.length > 0) {
    data.lines.forEach(pushLine);
    return out;
  }

  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) pushLine(line);
    }
  }

  if (out.length === 0 && Array.isArray(data.words)) {
    for (const word of data.words) {
      if (typeof word.text !== "string" || word.text.trim() === "") continue;
      out.push({ text: word.text, confidence: word.confidence ?? 0, bbox: word.bbox, lineIndex: 0 });
    }
  }

  return out;
}

/** Rebuilds page text from OCR words, laying lines out in reading order. */
function assembleOcrPage(words: OcrWord[], scale: number): { text: string; placed: Placed[] } {
  let text = "";
  const placed: Placed[] = [];
  let currentLine = -1;

  for (const word of words) {
    if (currentLine !== -1 && word.lineIndex !== currentLine) text += "\n";
    else if (text.length > 0) text += " ";
    currentLine = word.lineIndex;

    const start = text.length;
    text += word.text;
    placed.push({
      start,
      end: text.length,
      bbox: {
        x: word.bbox.x0 / scale,
        y: word.bbox.y0 / scale,
        w: (word.bbox.x1 - word.bbox.x0) / scale,
        h: (word.bbox.y1 - word.bbox.y0) / scale,
      },
      ocrConfidence: word.confidence,
    });
  }

  return { text, placed };
}

/* ------------------------------------------------------------------ */
/* Per-format ingestion                                                */
/* ------------------------------------------------------------------ */

function titleFromFileName(fileName: string): string {
  return path
    .basename(fileName, path.extname(fileName))
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function ingestPdf(filePath: string, fileName: string): Promise<ParsedDoc> {
  const doc = await openPdf(filePath);
  const docId = path.basename(fileName, path.extname(fileName));
  const title = (await doc.getTitle()) ?? titleFromFileName(fileName);

  const pages: Page[] = [];
  const ocrPages: number[] = [];
  let fullText = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ocrWorker: any = null;

  try {
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
      const source = await doc.getPageText(pageNum);
      const digital = assemblePdfPage(source.items, source.height);

      let assembled = digital;
      let isOcr = false;

      if (digital.text.replace(/\s/g, "").length < IMAGE_PAGE_THRESHOLD) {
        if (!ocrWorker) {
          const { createWorker } = await import("tesseract.js");
          ocrWorker = await createWorker("eng");
        }
        const canvas = await doc.renderPage(pageNum, OCR_SCALE);
        const png = await canvas.encode("png");
        const { data } = await ocrWorker.recognize(png, {}, { blocks: true });
        const ocrWords = flattenOcrWords(data);
        if (ocrWords.length === 0) {
          throw new Error(
            `Page ${pageNum} of ${fileName} has no text layer and OCR returned no words. ` +
              `Refusing to emit an empty page rather than record a document we cannot read.`,
          );
        }
        assembled = assembleOcrPage(ocrWords, OCR_SCALE);
        isOcr = true;
        ocrPages.push(pageNum);
      }

      const pageOffset = fullText.length;
      const words = wordsFromText(assembled.text, assembled.placed, pageOffset);

      pages.push({
        pageNum,
        charStart: pageOffset,
        charEnd: pageOffset + assembled.text.length,
        width: source.width,
        height: source.height,
        ocr: isOcr,
        words,
      });

      fullText += assembled.text;
      if (pageNum < doc.numPages) fullText += "\n\n";
    }
  } finally {
    if (ocrWorker) await ocrWorker.terminate();
    await doc.close();
  }

  return {
    docId,
    fileName,
    title,
    format: "pdf",
    paginated: true,
    ocrPages,
    fullText,
    pages,
  };
}

async function ingestDocx(filePath: string, fileName: string): Promise<ParsedDoc> {
  const buffer = await readFile(filePath);
  const [raw, html] = await Promise.all([
    mammoth.extractRawText({ buffer }),
    mammoth.convertToHtml({ buffer }),
  ]);

  const text = raw.value.replace(/\r\n/g, "\n").trim();
  const placed: Placed[] = [];
  const words = wordsFromText(text, placed, 0);
  const docId = path.basename(fileName, path.extname(fileName));

  return {
    docId,
    fileName,
    title: titleFromFileName(fileName),
    format: "docx",
    // A reflowable format has no fixed pages, so we will never cite one.
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
        words,
      },
    ],
    html: html.value,
  };
}

/* ------------------------------------------------------------------ */

/** Guards the invariant the rest of the pipeline assumes. */
function assertOffsets(doc: ParsedDoc): void {
  for (const page of doc.pages) {
    if (doc.fullText.slice(page.charStart, page.charEnd).length !== page.charEnd - page.charStart) {
      throw new Error(`${doc.docId}: page ${page.pageNum} range falls outside fullText`);
    }
    for (const word of page.words) {
      if (doc.fullText.slice(word.charStart, word.charEnd) !== word.text) {
        throw new Error(
          `${doc.docId}: word offset mismatch on page ${page.pageNum}. ` +
            `Expected ${JSON.stringify(word.text)} at ${word.charStart}, ` +
            `found ${JSON.stringify(doc.fullText.slice(word.charStart, word.charEnd))}.`,
        );
      }
    }
  }
}

export async function run(opts: StageOpts): Promise<ParsedDoc[]> {
  const outDir = path.join(opts.dataDir, "parsed");
  await mkdir(outDir, { recursive: true });

  const entries = (await readdir(opts.corpusDir))
    .filter((f) => /\.(pdf|docx)$/i.test(f))
    .sort();

  if (entries.length === 0) {
    throw new Error(`No .pdf or .docx files found in ${opts.corpusDir}`);
  }

  const docs: ParsedDoc[] = [];
  for (const fileName of entries) {
    const filePath = path.join(opts.corpusDir, fileName);
    const doc = fileName.toLowerCase().endsWith(".docx")
      ? await ingestDocx(filePath, fileName)
      : await ingestPdf(filePath, fileName);

    assertOffsets(doc);
    await writeFile(path.join(outDir, `${doc.docId}.json`), `${JSON.stringify(doc, null, 2)}\n`);

    const wordCount = doc.pages.reduce((n, p) => n + p.words.length, 0);
    const ocrNote =
      doc.ocrPages.length > 0
        ? `OCR pages ${doc.ocrPages.join(",")} (mean confidence ${meanOcrConfidence(doc).toFixed(1)})`
        : doc.paginated
          ? "text layer"
          : "text layer, unpaginated";
    console.log(
      `${doc.fileName.padEnd(34)} ${String(doc.pages.length).padStart(2)}p ` +
        `${String(wordCount).padStart(5)}w  ${ocrNote}`,
    );
    docs.push(doc);
  }

  return docs;
}

export function meanOcrConfidence(doc: ParsedDoc): number {
  const values = doc.pages
    .flatMap((p) => p.words)
    .map((w) => w.ocrConfidence)
    .filter((c): c is number => c !== null);
  return values.length === 0 ? Number.NaN : values.reduce((a, b) => a + b, 0) / values.length;
}

if (import.meta.filename === process.argv[1]) {
  const ROOT = path.resolve(import.meta.dirname, "..");
  const { values } = parseArgs({
    options: {
      corpus: { type: "string", default: path.join(ROOT, "data", "corpus") },
      data: { type: "string", default: path.join(ROOT, "data") },
    },
  });
  await run({
    corpusDir: path.resolve(values.corpus!),
    dataDir: path.resolve(values.data!),
    asOf: new Date(),
    windowDays: 90,
  });
}
