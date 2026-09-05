/**
 * The pdfjs boilerplate, in one place.
 *
 * pdfjs is awkward to use from Node — it needs the legacy build, a filesystem
 * path to its bundled standard fonts (with a forward slash, which path.sep is
 * not on Windows), and a canvas implementation supplied from outside. Rather
 * than repeat that in scan.ts, ingest.ts and the inspector, it lives here.
 *
 * pdfjs ships no useful types for the legacy build, so the boundary is typed
 * loosely and narrowed into our own shapes immediately.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { createCanvas, type Canvas } from "@napi-rs/canvas";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A pdfjs text item: a run of glyphs with a transform matrix. */
export interface RawTextItem {
  str: string;
  /** [a, b, c, d, e, f] — e and f are x and y in PDF space (bottom-left origin). */
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

export interface PdfPageText {
  pageNum: number;
  /** Points. */
  width: number;
  height: number;
  items: RawTextItem[];
}

export function standardFontDir(): string {
  const require = createRequire(import.meta.url);
  const entry = require.resolve("pdfjs-dist/package.json");
  const dir = path.join(path.dirname(entry), "standard_fonts").replaceAll("\\", "/");
  return `${dir}/`;
}

export async function loadPdfjs(): Promise<any> {
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

export interface OpenPdf {
  numPages: number;
  getTitle(): Promise<string | null>;
  getPageText(pageNum: number): Promise<PdfPageText>;
  renderPage(pageNum: number, scale: number): Promise<Canvas>;
  close(): Promise<void>;
}

export async function openPdf(filePath: string): Promise<OpenPdf> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await readFile(filePath));
  const doc = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    standardFontDataUrl: standardFontDir(),
  }).promise;

  return {
    numPages: doc.numPages,

    async getTitle(): Promise<string | null> {
      const meta = await doc.getMetadata().catch(() => null);
      const title = meta?.info?.Title;
      return typeof title === "string" && title.trim() ? title.trim() : null;
    },

    async getPageText(pageNum: number): Promise<PdfPageText> {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = (content.items as any[])
        .filter((item) => typeof item.str === "string")
        .map((item) => ({
          str: item.str as string,
          transform: item.transform as number[],
          width: item.width as number,
          height: item.height as number,
          hasEOL: item.hasEOL as boolean | undefined,
        }));
      return { pageNum, width: viewport.width, height: viewport.height, items };
    },

    async renderPage(pageNum: number, scale: number): Promise<Canvas> {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx as any, viewport }).promise;
      return canvas;
    },

    async close(): Promise<void> {
      await doc.cleanup();
    },
  };
}
