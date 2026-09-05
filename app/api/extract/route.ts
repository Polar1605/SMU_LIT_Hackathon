/**
 * Extracts one contract's fields, payments and grants from its ParsedDoc.
 *
 * Reuses the identical prompt and schema scripts/extract.ts sends from the
 * CLI — SYSTEM_PROMPT and userPrompt() are imported, not re-typed, so the live
 * upload path and the offline pipeline can never quietly drift onto different
 * wording. Calls the same lib/llm.ts helper the CLI uses, pointed at a
 * scratch, per-request cache directory rather than the CLI's persistent one:
 * Vercel's filesystem is not persistent across invocations, so disk-caching
 * an uploaded document's response would not survive to be reused anyway, and
 * a live upload only ever needs to succeed once.
 *
 * One document per request — not one request for the whole batch — is a
 * deliberate design choice, not an accident of convenience. A single request
 * covering 40-80 contracts at up to ~200s each would run far past any
 * realistic serverless duration ceiling; per-document requests keep each call
 * short enough to plausibly fit, let the browser show progress as each one
 * lands, and mean one failing document never takes the rest of the batch
 * down with it.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";

import { callStructured } from "@/lib/llm";
import { EXTRACTION_SCHEMA, EXTRACTION_SCHEMA_NAME, type RawExtraction } from "@/lib/schema";
import { SYSTEM_PROMPT, userPrompt } from "@/scripts/extract";
import type { ParsedDoc } from "@/lib/types";

export const runtime = "nodejs";
// The generous end of what Vercel's Node runtime will accept in code; the
// plan's actual ceiling may clamp this lower at runtime, which needs to be
// verified live rather than assumed, same as the OCR rasterization risk.
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  let scratch: string | null = null;

  try {
    const doc = (await request.json()) as ParsedDoc;
    if (!doc?.fullText || !doc?.docId) {
      return NextResponse.json({ error: "Request body is not a ParsedDoc." }, { status: 400 });
    }

    scratch = await mkdtemp(path.join(tmpdir(), "aithena-extract-"));

    const { data } = await callStructured<RawExtraction>({
      system: SYSTEM_PROMPT,
      user: userPrompt(doc),
      schemaName: EXTRACTION_SCHEMA_NAME,
      schema: EXTRACTION_SCHEMA,
      cacheDir: scratch,
      label: doc.docId,
    });

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (scratch) await rm(scratch, { recursive: true, force: true });
  }
}
