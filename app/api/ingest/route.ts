/**
 * Parses one uploaded contract into a ParsedDoc.
 *
 * Reuses ingestPdf/ingestDocx unchanged from the CLI's ingest.ts — the same
 * functions that ingested 30 real CUAD contracts and the corpus's scanned
 * document. The only difference from the CLI path is where the bytes come
 * from: the CLI reads a file already on disk; this writes the uploaded bytes
 * to a scratch temp file first (the same pattern demo-live.ts and the
 * diag-ocr diagnostic already use), then calls the identical function.
 *
 * One document per request, called once per uploaded file by the browser —
 * see the design note in this route's sibling, /api/extract, for why the
 * whole batch is never one request.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";

import { assertOffsets, ingestDocx, ingestPdf } from "@/scripts/ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  let scratch: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file field in the upload." }, { status: 400 });
    }

    const fileName = file.name;
    const isPdf = /\.pdf$/i.test(fileName);
    const isDocx = /\.docx$/i.test(fileName);
    if (!isPdf && !isDocx) {
      return NextResponse.json(
        { error: `${fileName}: only .pdf and .docx are supported.` },
        { status: 415 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `${fileName}: ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds the ${MAX_BYTES / 1024 / 1024}MB limit per file.` },
        { status: 413 },
      );
    }

    scratch = await mkdtemp(path.join(tmpdir(), "aithena-ingest-"));
    // The directory only exists at runtime (mkdtemp), so Turbopack's build-time
    // tracer cannot resolve this path and — left unmarked — falls back to
    // bundling the ENTIRE project (public/corpus, all of data/cuad) into this
    // one function. This is genuinely dynamic, genuinely scoped to /tmp, and
    // exactly the case Next's own warning names this directive for.
    const scratchFile = path.join(/* turbopackIgnore: true */ scratch, "upload");
    await writeFile(scratchFile, Buffer.from(await file.arrayBuffer()));

    const doc = isPdf ? await ingestPdf(scratchFile, fileName) : await ingestDocx(scratchFile, fileName);

    // Same invariant the CLI enforces before trusting the result: every word's
    // offsets must round-trip against fullText. Uploaded input is untrusted,
    // so this matters at least as much here as it does on our own corpus.
    assertOffsets(doc);

    return NextResponse.json(doc);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (scratch) await rm(scratch, { recursive: true, force: true });
  }
}
