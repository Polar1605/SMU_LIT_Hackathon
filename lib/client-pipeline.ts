/**
 * Runs the upload pipeline from the browser: one file at a time through
 * /api/ingest then /api/extract, then assembleContract/assembleResults locally
 * — the exact functions the CLI calls, imported directly rather than
 * reimplemented, so the live and offline paths can never quietly drift apart.
 *
 * Deliberately not React — this is plain async code with a progress callback,
 * so it is easy to reason about and easy to reuse if the UI around it changes.
 *
 * One request per document, not one request for the whole batch: a portfolio
 * of 40-80 contracts at up to ~200s each would run far past any realistic
 * serverless duration limit as a single call. Per-document requests keep each
 * call short, let progress render as each document lands, and mean one
 * document failing never takes the rest of the batch down with it.
 */

import { assembleContract, assembleResults } from "./assemble.ts";
import type { ContractResult, ParsedDoc, Results } from "./types.ts";

export type DocumentStatus = "queued" | "ingesting" | "extracting" | "done" | "failed";

export interface DocumentProgress {
  id: string;
  fileName: string;
  status: DocumentStatus;
  error?: string;
}

export interface UploadedDocument {
  /** The original bytes, kept so the evidence viewer can render pages without re-uploading. */
  bytes: ArrayBuffer;
  parsedDoc: ParsedDoc;
}

export interface PipelineOutcome {
  results: Results;
  /** Keyed by docId, so the evidence viewer can find a document's own source bytes. */
  documents: Map<string, UploadedDocument>;
}

async function postFile(file: File): Promise<ParsedDoc> {
  const body = new FormData();
  body.set("file", file);
  const response = await fetch("/api/ingest", { method: "POST", body });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Ingest failed with HTTP ${response.status}`);
  return payload as ParsedDoc;
}

async function postExtract(doc: ParsedDoc) {
  const response = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(doc),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Extraction failed with HTTP ${response.status}`);
  return payload;
}

/** Runs `count` workers pulling from `items` concurrently, in array order otherwise unspecified. */
async function runPool<T>(items: T[], count: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const pull = async (): Promise<void> => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(count, items.length) }, pull));
}

export interface RunUploadPipelineOptions {
  files: File[];
  asOf: Date;
  windowDays: number;
  concurrency?: number;
  onProgress?: (progress: DocumentProgress[]) => void;
}

/** Well clear of Vercel's per-request duration ceiling and typical rate limits at once. */
const DEFAULT_CONCURRENCY = 6;

export async function runUploadPipeline(opts: RunUploadPipelineOptions): Promise<PipelineOutcome> {
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const progress: DocumentProgress[] = opts.files.map((file, i) => ({
    id: `${i}-${file.name}`,
    fileName: file.name,
    status: "queued",
  }));
  const report = () => opts.onProgress?.(progress.map((p) => ({ ...p })));
  report();

  const contracts: ContractResult[] = [];
  const documents = new Map<string, UploadedDocument>();

  await runPool(opts.files, concurrency, async (file) => {
    const row = progress.find((p) => p.fileName === file.name && p.status === "queued")!;
    try {
      row.status = "ingesting";
      report();
      const bytes = await file.arrayBuffer();
      // The route also reads the file; a second arrayBuffer() read of the same
      // File object is fine (File/Blob bodies are re-readable), and this keeps
      // the original bytes for the evidence viewer without a second upload.
      const doc = await postFile(file);

      row.status = "extracting";
      report();
      const extraction = await postExtract(doc);

      const contract = assembleContract(doc, extraction);
      contracts.push(contract);
      documents.set(doc.docId, { bytes, parsedDoc: doc });

      row.status = "done";
      report();
    } catch (error) {
      row.status = "failed";
      row.error = error instanceof Error ? error.message : String(error);
      report();
    }
  });

  const assembled = assembleResults({
    contracts,
    asOf: opts.asOf,
    windowDays: opts.windowDays,
    model: "gpt-5.5-2026-04-23",
  });

  const failed = progress.filter((p) => p.status === "failed");
  const results: Results = {
    generatedAt: new Date().toISOString(),
    ...assembled,
    unavailable: failed.map((p) => ({
      stage: "ingest-or-extract",
      reason: `${p.fileName} could not be processed and is not included: ${p.error}`,
    })),
  };

  return { results, documents };
}
