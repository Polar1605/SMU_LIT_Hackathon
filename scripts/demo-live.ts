/**
 * Runs exactly one contract through a real, uncached extraction.
 *
 * The demo reads pre-computed results so it cannot fail on stage — which
 * invites the fair question of whether any of it runs at all. This answers that
 * in about a minute, on one document, with the timing and the verification
 * result printed.
 *
 * It works in a scratch directory with an empty cache, so the warm cache the
 * demo depends on is never touched and a network failure here costs nothing.
 *
 *   npm run demo:live
 *   npm run demo:live -- --doc msa
 */

import { mkdtemp, mkdir, copyFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import path from "node:path";

import { run as extract } from "./extract.ts";
import { verifyQuote } from "../lib/verify.ts";
import { activeModel } from "../lib/llm.ts";
import type { ParsedDoc } from "../lib/types.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      doc: { type: "string", default: "saas-subscription" },
      data: { type: "string", default: path.join(ROOT, "data") },
    },
  });

  const dataDir = path.resolve(values.data!);
  const parsedFile = path.join(dataDir, "parsed", `${values.doc}.json`);

  const doc = JSON.parse(await readFile(parsedFile, "utf8").catch(async () => {
    const available = (await readdir(path.join(dataDir, "parsed")))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
    throw new Error(`No parsed document "${values.doc}". Available: ${available.join(", ")}`);
  })) as ParsedDoc;

  // A scratch directory with no cache, so this is genuinely a live call and the
  // demo's warm cache is left exactly as it was.
  const scratch = await mkdtemp(path.join(tmpdir(), "clara-live-"));
  await mkdir(path.join(scratch, "parsed"), { recursive: true });
  await copyFile(parsedFile, path.join(scratch, "parsed", `${values.doc}.json`));

  console.log(`Live extraction, no cache, one document.`);
  console.log(`  document  ${doc.title} (${doc.fileName})`);
  console.log(`  ${doc.pages.length} page(s), ${doc.fullText.length} characters${doc.ocrPages.length ? `, OCR on page ${doc.ocrPages.join(", ")}` : ""}`);
  console.log(`  model     ${activeModel()}\n`);

  const started = Date.now();
  try {
    const results = await extract(
      { corpusDir: path.join(dataDir, "corpus"), dataDir: scratch, asOf: new Date(), windowDays: 90 },
      1,
    );
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    const extraction = results.get(doc.docId);
    if (!extraction) throw new Error("The extraction returned nothing.");

    // The point of the exercise: quotes the model just produced, re-located in
    // our own text. This is the same code path the pipeline uses.
    const quotes = [...extraction.fields, ...extraction.payments, ...extraction.grants].flatMap(
      (item) => item.quotes,
    );
    const verdicts = quotes.map((quote) => verifyQuote(quote.text, doc));
    const located = verdicts.filter((v) => v !== null);
    const byKind = located.reduce<Record<string, number>>((acc, v) => {
      acc[v!.matchKind] = (acc[v!.matchKind] ?? 0) + 1;
      return acc;
    }, {});

    console.log(`\nCompleted in ${seconds}s.`);
    console.log(`  ${extraction.fields.length} fields, ${extraction.payments.length} payment terms, ${extraction.grants.length} exclusivity grants`);
    console.log(`  ${quotes.length} quotes returned, ${located.length} located in the source document`);
    console.log(
      `    ${Object.entries(byKind).map(([kind, n]) => `${n} ${kind}`).join(", ") || "none"}` +
        `${quotes.length - located.length > 0 ? `, ${quotes.length - located.length} discarded as unverifiable` : ""}`,
    );

    const ambiguities = extraction.fields.flatMap((f) => f.ambiguities);
    if (ambiguities.length > 0) {
      console.log(`\n  Ambiguities the model raised:`);
      for (const item of ambiguities) console.log(`    - ${item}`);
    }
    console.log(`\nThe warm cache used by the dashboard was not touched.`);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

await main();
