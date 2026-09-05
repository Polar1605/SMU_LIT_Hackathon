/**
 * Diagnostic only — not part of the upload feature.
 *
 * @napi-rs/canvas is a native binary. It works on the machine that built this
 * app; that says nothing about whether it loads inside a Vercel serverless
 * function, which runs on different infrastructure with its own bundling and
 * size limits. Scanned-document ingestion — a must-have requirement — depends
 * on it, so this is tested in isolation before any upload code is built on top
 * of an unproven assumption.
 *
 * Fetches the already-public scanned demo PDF over HTTP (rather than reading
 * from the filesystem, whose runtime layout inside a serverless function is
 * not guaranteed to match `public/`), rasterizes one page with the same
 * @napi-rs/canvas call ingest.ts uses, and runs the same tesseract.js OCR path.
 * If this route 500s or times out, the risk was real and ingest.ts's OCR path
 * needs a different rasterizer before upload is built on it. If it returns
 * recognizable text, the risk is cleared.
 *
 * Delete this route once the answer is known either way.
 */

import { NextResponse } from "next/server";
import { openPdf } from "@/lib/pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const started = Date.now();
  const steps: string[] = [];

  try {
    const pdfUrl = new URL("/corpus/supplier-agreement-scanned.pdf", request.url);
    steps.push(`fetching ${pdfUrl.pathname}`);
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Could not fetch the test PDF: HTTP ${pdfResponse.status}`);
    }
    const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
    steps.push(`fetched ${pdfBytes.length} bytes`);

    // openPdf() and renderPage() are the exact functions ingest.ts calls for
    // every scanned page. If @napi-rs/canvas cannot load here, this is where
    // it fails.
    const { writeFile, mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const scratch = await mkdtemp(path.join(tmpdir(), "diag-ocr-"));
    const scratchFile = path.join(scratch, "scan.pdf");
    await writeFile(scratchFile, pdfBytes);

    steps.push("opening PDF with pdfjs");
    const doc = await openPdf(scratchFile);
    steps.push(`opened, ${doc.numPages} page(s)`);

    steps.push("rasterizing page 1 with @napi-rs/canvas");
    const canvas = await doc.renderPage(1, 2);
    const png = await canvas.encode("png");
    steps.push(`rasterized, ${png.length} bytes of PNG`);
    await doc.close();
    await rm(scratch, { recursive: true, force: true });

    steps.push("running tesseract.js OCR");
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    const { data } = await worker.recognize(png);
    await worker.terminate();
    steps.push("OCR complete");

    return NextResponse.json({
      ok: true,
      elapsedMs: Date.now() - started,
      steps,
      ocrConfidence: data.confidence,
      textSample: data.text.slice(0, 300),
      textLength: data.text.length,
      // The proof that matters: does the recognized text contain wording we
      // know is in this document, e.g. from clause 1 ("SUPPLY OF GOODS").
      containsExpectedWording: /SUPPLY OF GOODS/i.test(data.text),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        elapsedMs: Date.now() - started,
        steps,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}
