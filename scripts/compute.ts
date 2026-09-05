/**
 * Turns extractions into results.json — the only file the app reads by
 * default (the upload feature reaches the same logic a different way).
 *
 * This is a thin Node wrapper. Every actual decision — verification,
 * confidence, calendar, conflicts, escalation — lives in lib/assemble.ts,
 * which imports nothing Node-only so the browser upload path can call the
 * exact same functions. This file's job is the parts only a filesystem can
 * do: reading the corpus directory, reading questions.json, publishing viewer
 * assets, writing the result.
 *
 *   npm run compute
 *   npm run compute -- --corpus ./some-folder --as-of 2026-10-01
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";

import { assembleContract, assembleResults } from "../lib/assemble.ts";
import { DEFAULT_MODEL } from "../lib/llm.ts";
import { publishViewerAssets } from "./publish-assets.ts";
import type { RawExtraction } from "../lib/schema.ts";
import type { ContractResult, ParsedDoc, Results, StageOpts } from "../lib/types.ts";

export async function run(opts: StageOpts): Promise<Results> {
  const parsedDir = path.join(opts.dataDir, "parsed");
  const extractionsDir = path.join(opts.dataDir, "extractions");
  const unavailable: { stage: string; reason: string }[] = [];

  const files = (await readdir(parsedDir)).filter((f) => f.endsWith(".json")).sort();
  const contracts: ContractResult[] = [];

  for (const file of files) {
    const doc = JSON.parse(await readFile(path.join(parsedDir, file), "utf8")) as ParsedDoc;

    let extraction: RawExtraction;
    try {
      extraction = JSON.parse(
        await readFile(path.join(extractionsDir, `${doc.docId}.json`), "utf8"),
      ) as RawExtraction;
    } catch {
      // Never invent a result for a document we failed to extract.
      unavailable.push({
        stage: "extract",
        reason: `${doc.fileName} was ingested but has no extraction, so no terms are reported for it. Run: npm run extract`,
      });
      continue;
    }

    contracts.push(assembleContract(doc, extraction));
  }

  // Questions are optional: a judge's folder need not carry any.
  let questions: { id: string; question: string }[] | undefined;
  try {
    const questionsFile = JSON.parse(
      await readFile(path.join(opts.dataDir, "questions.json"), "utf8"),
    ) as { questions: { id: string; question: string }[] };
    questions = questionsFile.questions;
  } catch {
    unavailable.push({ stage: "refusals", reason: "No data/questions.json, so no refusal examples are shown." });
  }

  const assembled = assembleResults({
    contracts,
    asOf: opts.asOf,
    windowDays: opts.windowDays,
    model: process.env.AITHENA_MODEL ?? DEFAULT_MODEL,
    questions,
  });

  const published = await publishViewerAssets(opts.corpusDir, opts.dataDir);
  unavailable.push(...published.unavailable);

  const results: Results = {
    generatedAt: new Date().toISOString(),
    ...assembled,
    unavailable,
  };

  await writeFile(path.join(opts.dataDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);

  const counts = contracts.flatMap((c) => c.fields).reduce<Record<string, number>>((acc, f) => {
    acc[f.confidence] = (acc[f.confidence] ?? 0) + 1;
    return acc;
  }, {});
  const discarded = contracts.reduce(
    (n, c) =>
      n + [...c.fields, ...c.payments, ...c.grants].reduce((m, item) => m + item.discardedQuoteCount, 0),
    0,
  );

  console.log(
    `${contracts.length} contracts  ` +
      `FOUND ${counts.FOUND ?? 0}  INFERRED ${counts.INFERRED ?? 0}  ` +
      `UNCERTAIN ${counts.UNCERTAIN ?? 0}  NOT_FOUND ${counts.NOT_FOUND ?? 0}`,
  );
  console.log(
    `${assembled.calendar.length} calendar events, ${assembled.conflicts.length} conflict(s), ` +
      `${assembled.escalations.length} escalation(s), ${assembled.refusals.length} refusal(s), ${discarded} quote(s) discarded`,
  );
  for (const item of unavailable) console.log(`  unavailable [${item.stage}] ${item.reason}`);

  return results;
}

if (import.meta.filename === process.argv[1]) {
  const ROOT = path.resolve(import.meta.dirname, "..");
  const { values } = parseArgs({
    options: {
      corpus: { type: "string", default: path.join(ROOT, "data", "corpus") },
      data: { type: "string", default: path.join(ROOT, "data") },
      "as-of": { type: "string" },
      window: { type: "string", default: "90" },
    },
  });
  await run({
    corpusDir: path.resolve(values.corpus!),
    dataDir: path.resolve(values.data!),
    asOf: values["as-of"] ? new Date(`${values["as-of"]}T00:00:00`) : new Date(),
    windowDays: Number(values.window),
  });
}
