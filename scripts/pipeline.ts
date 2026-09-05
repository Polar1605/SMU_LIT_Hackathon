/**
 * Runs the whole pipeline in one process against one corpus directory.
 *
 * Composed in-process rather than as chained npm scripts because argument
 * forwarding through `npm run a && npm run b` does not work, and the point of
 * this script is that a folder of documents we have never seen can be pointed at
 * it:
 *
 *   npm run pipeline -- --corpus ./their-folder
 *   npm run pipeline -- --as-of 2026-10-01 --window 120
 *   npm run pipeline -- --skip-eval
 */

import { parseArgs } from "node:util";
import path from "node:path";

import { run as ingest } from "./ingest.ts";
import { run as extract } from "./extract.ts";
import { run as compute } from "./compute.ts";
import { run as evaluate } from "./eval.ts";
import type { StageOpts } from "../lib/types.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

function heading(text: string): void {
  console.log(`\n${text}\n${"-".repeat(text.length)}`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      corpus: { type: "string", default: path.join(ROOT, "data", "corpus") },
      data: { type: "string", default: path.join(ROOT, "data") },
      "as-of": { type: "string" },
      window: { type: "string", default: "90" },
      "skip-eval": { type: "boolean", default: false },
    },
  });

  const opts: StageOpts = {
    corpusDir: path.resolve(values.corpus!),
    dataDir: path.resolve(values.data!),
    asOf: values["as-of"] ? new Date(`${values["as-of"]}T00:00:00`) : new Date(),
    windowDays: Number(values.window),
  };

  if (Number.isNaN(opts.asOf.getTime())) throw new Error(`--as-of is not a valid date: ${values["as-of"]}`);

  console.log(`corpus  ${opts.corpusDir}`);
  console.log(`as of   ${opts.asOf.toISOString().slice(0, 10)}, ${opts.windowDays}-day window`);

  heading("1. ingest");
  await ingest(opts);

  heading("2. extract");
  await extract(opts);

  heading("3. compute");
  await compute(opts);

  if (values["skip-eval"]) {
    console.log("\nskipping eval");
    return;
  }

  heading("4. eval");
  await evaluate(opts);
}

await main();
