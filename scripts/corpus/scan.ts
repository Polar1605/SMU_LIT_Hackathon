/**
 * Turns a clean PDF into a scanned-looking one: rasterise each page, add slight
 * skew and sensor noise, re-embed as JPEGs with no text layer.
 *
 * The point is not realism for its own sake. It is that ingest.ts must reach
 * this document through OCR, and OCR gives us per-word confidence, which is what
 * lets a field read off a bad scan be structurally incapable of being FOUND.
 *
 * Fallback ladder if rasterisation fights us (hard 30-minute timebox in the
 * spec): @napi-rs/canvas -> pdf-to-img -> render once in a browser and commit
 * the JPEG. This module implements the first rung and fails loudly rather than
 * quietly shipping a text-layer PDF that would make the OCR path a lie.
 */

import { writeFile } from "node:fs/promises";
import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";
import { openPdf } from "../../lib/pdf.ts";

/** Rendered at 2x so OCR has enough pixels to work with. */
const RENDER_SCALE = 2;
const SKEW_DEGREES = 0.7;
const JPEG_QUALITY = 68;
const NOISE_AMPLITUDE = 16;
/** Fixed so a corpus rebuild reproduces the same scan, and so eval numbers are stable. */
const NOISE_SEED = 0x5eed1234;

/** mulberry32 — small, deterministic, good enough for film grain. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * pdf-lib stamps the current time into every document, which would make the
 * corpus differ byte-for-byte on each rebuild even with the noise seeded. Fixed
 * dates make the whole corpus reproducible, so eval numbers move only when the
 * pipeline changes.
 */
export function stampFixedMetadata(doc: PDFDocument): void {
  const epoch = new Date(Date.UTC(2020, 0, 1));
  doc.setCreationDate(epoch);
  doc.setModificationDate(epoch);
  doc.setProducer("CLARA corpus generator");
  doc.setCreator("CLARA corpus generator");
}

interface RasterPage {
  jpeg: Buffer;
  widthPt: number;
  heightPt: number;
}

/** Light film-grain, applied in place. Enough to cost OCR confidence, not enough to destroy it. */
function addNoise(ctx: SKRSContext2D, width: number, height: number, rand: () => number): void {
  const image = ctx.getImageData(0, 0, width, height);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const jitter = (rand() - 0.5) * NOISE_AMPLITUDE;
    data[i] = Math.max(0, Math.min(255, data[i] + jitter));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + jitter));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + jitter));
  }
  ctx.putImageData(image, 0, 0);
}

async function rasterise(pdfPath: string): Promise<RasterPage[]> {
  const doc = await openPdf(pdfPath);
  const rand = seededRandom(NOISE_SEED);
  const pages: RasterPage[] = [];

  try {
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
      const clean = await doc.renderPage(pageNum, RENDER_SCALE);
      const { width, height } = clean;

      // Re-draw with a slight rotation about the centre, on a paper-white ground.
      const skewed = createCanvas(width, height);
      const ctx = skewed.getContext("2d");
      ctx.fillStyle = "#fdfdfb";
      ctx.fillRect(0, 0, width, height);
      ctx.translate(width / 2, height / 2);
      ctx.rotate((SKEW_DEGREES * Math.PI) / 180);
      ctx.translate(-width / 2, -height / 2);
      ctx.drawImage(await loadImage(await clean.encode("png")), 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      addNoise(ctx, width, height, rand);

      pages.push({
        jpeg: await skewed.encode("jpeg", JPEG_QUALITY),
        widthPt: width / RENDER_SCALE,
        heightPt: height / RENDER_SCALE,
      });
    }
  } finally {
    await doc.close();
  }

  return pages;
}

export async function makeScannedPdf(
  cleanPdfPath: string,
  outPath: string,
): Promise<{ pageCount: number; note: string }> {
  let pages: RasterPage[];
  try {
    pages = await rasterise(cleanPdfPath);
  } catch (cause) {
    throw new Error(
      `Rasterising ${cleanPdfPath} failed, so the scanned document cannot be built. ` +
        `Next rungs of the fallback ladder are pdf-to-img, then rendering once in a browser ` +
        `and committing the JPEG. Refusing to emit a text-layer PDF dressed up as a scan.`,
      { cause },
    );
  }

  const out = await PDFDocument.create();
  out.setTitle("Supply Agreement (scanned)");
  stampFixedMetadata(out);
  for (const page of pages) {
    const image = await out.embedJpg(page.jpeg);
    const pdfPage = out.addPage([page.widthPt, page.heightPt]);
    pdfPage.drawImage(image, { x: 0, y: 0, width: page.widthPt, height: page.heightPt });
  }
  await writeFile(outPath, await out.save());

  return {
    pageCount: pages.length,
    note: `${pages.length} page(s) rasterised at ${RENDER_SCALE}x, ${SKEW_DEGREES}° skew, JPEG q${JPEG_QUALITY}, no text layer`,
  };
}
