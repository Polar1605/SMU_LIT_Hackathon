/**
 * Copies the things the browser fetches at runtime into `public/`.
 *
 * The evidence viewer loads source documents over HTTP, pdfjs loads its parser
 * worker from our own origin, and unpaginated documents need their text to show
 * a cited passage in context. None of that is bundled by Next, so it has to be
 * published as static assets.
 *
 * `public/` is generated output and stays out of git. That means a deployment
 * building from a clean checkout would otherwise serve a dashboard whose every
 * "view the clause" button 404s — which is the one thing this system exists to
 * prove. So this runs as `prebuild` as well as at the end of `compute`, and the
 * inputs it needs (data/corpus, data/parsed) are committed.
 *
 *   npm run publish-assets
 */

import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import path from "node:path";

import type { ParsedDoc } from "../lib/types.ts";

export interface PublishResult {
  copied: number;
  unavailable: { stage: string; reason: string }[];
}

export async function publishViewerAssets(corpusDir: string, dataDir: string): Promise<PublishResult> {
  const publicDir = path.resolve(import.meta.dirname, "..", "public");
  const publicCorpus = path.join(publicDir, "corpus");
  const publicParsed = path.join(publicDir, "parsed");
  await mkdir(publicCorpus, { recursive: true });
  await mkdir(publicParsed, { recursive: true });

  const unavailable: PublishResult["unavailable"] = [];
  let copied = 0;

  const documents = (await readdir(corpusDir).catch(() => [] as string[])).filter((f) =>
    /\.(pdf|docx)$/i.test(f),
  );

  if (documents.length === 0) {
    unavailable.push({
      stage: "viewer",
      reason: `No documents found in ${corpusDir}, so no source documents can be shown alongside the findings.`,
    });
  }

  for (const fileName of documents) {
    try {
      await copyFile(path.join(corpusDir, fileName), path.join(publicCorpus, fileName));
      copied += 1;
    } catch {
      unavailable.push({
        stage: "viewer",
        reason: `${fileName} could not be published for the evidence viewer, so its clauses cannot be shown in context.`,
      });
    }
  }

  // An unpaginated document has no page to render, so the viewer shows the cited
  // span in its surrounding text. Only the text is published — the full parsed
  // record carries per-word geometry the browser never needs.
  const parsedDir = path.join(dataDir, "parsed");
  for (const file of (await readdir(parsedDir).catch(() => [] as string[])).filter((f) => f.endsWith(".json"))) {
    const doc = JSON.parse(await readFile(path.join(parsedDir, file), "utf8")) as ParsedDoc;
    if (doc.paginated) continue;
    await writeFile(
      path.join(publicParsed, `${doc.docId}.json`),
      JSON.stringify({ fullText: doc.fullText, html: doc.html ?? null }),
    );
  }

  // pdfjs runs its parser in a worker, which must be served from our origin.
  try {
    const workerSource = createRequire(import.meta.url).resolve("pdfjs-dist/build/pdf.worker.min.mjs");
    await copyFile(workerSource, path.join(publicDir, "pdf.worker.min.mjs"));
  } catch {
    unavailable.push({
      stage: "viewer",
      reason: "The pdfjs worker could not be published, so PDF pages cannot be rendered in the browser.",
    });
  }

  return { copied, unavailable };
}

if (import.meta.filename === process.argv[1]) {
  const ROOT = path.resolve(import.meta.dirname, "..");
  const { values } = parseArgs({
    options: {
      corpus: { type: "string", default: path.join(ROOT, "data", "corpus") },
      data: { type: "string", default: path.join(ROOT, "data") },
    },
  });

  const result = await publishViewerAssets(path.resolve(values.corpus!), path.resolve(values.data!));
  console.log(`published ${result.copied} source document(s) for the evidence viewer`);
  for (const item of result.unavailable) console.log(`  unavailable [${item.stage}] ${item.reason}`);
}
