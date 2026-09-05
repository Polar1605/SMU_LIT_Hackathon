/**
 * One structured call per document, cached from the first call.
 *
 * No retrieval layer: six contracts fit comfortably in context, and chunking
 * would introduce a failure mode (a clause split across chunks) in exchange for
 * nothing at this scale.
 *
 * The prompt's job is to make the model's incentives match the verifier's. It is
 * told plainly that quotes are programmatically re-located in the source and
 * that an unfindable quote destroys the field — which makes copying exactly the
 * cheapest strategy available to it, rather than tidying as it goes.
 *
 * Extraction is embarrassingly parallel — no contract depends on another — so
 * documents run concurrently. The ceiling is the token-per-minute rate limit
 * rather than latency: at roughly 15k tokens a contract against a 500k TPM
 * allowance, ~30 can be in flight before the tier is the binding constraint,
 * and a modest limit keeps well clear of 429s.
 *
 * Two properties matter more than speed, and both come from the cache. Every
 * completed call is written to disk before anything else runs, so a failure at
 * document 63 of 80 resumes at 63 rather than restarting. And because the cache
 * key hashes the document text, an unchanged file costs nothing on a re-run —
 * which is what makes iterating on the eval affordable.
 *
 *   npm run extract
 *   npm run extract -- --corpus ./some-folder --concurrency 12
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";
import pLimit from "p-limit";

import { callStructured } from "../lib/llm.ts";
import { EXTRACTION_SCHEMA, EXTRACTION_SCHEMA_NAME, type RawExtraction } from "../lib/schema.ts";
import type { ParsedDoc, StageOpts } from "../lib/types.ts";

/** Well clear of a 500k TPM tier at ~15k tokens a contract, and of 500 RPM. */
export const DEFAULT_CONCURRENCY = 8;

/** Exported so the upload API route sends the model the identical prompt the CLI uses. */
export const SYSTEM_PROMPT = `You extract contractual terms from a single agreement and return them as structured data.

HOW YOUR QUOTES ARE USED
Every quote you return is programmatically searched for in the exact document text you were given. If a quote cannot be located, the entire field is discarded and reported to the user as unverifiable — your answer is thrown away, not corrected. So copy spans character-for-character from the text supplied below. Do not tidy spacing, do not straighten quotation marks, do not fix apparent typos, and do not join text that the document separates. If the document text contains obvious character-recognition errors because it came from a scan, quote the errors exactly as they appear; that is what the document says as far as anyone can tell, and it is recorded honestly downstream.

Never state a page number. Page numbers are derived from where your quote is found, and anything you assert about location is ignored.

SILENCE IS AN ANSWER, AND IT IS NOT THE SAME AS DOUBT
If the agreement genuinely contains no provision of a kind, set found to false and evidenceType to "absent" with no quotes. That is a real, useful answer. Do not manufacture a near-miss clause to appear responsive, and do not hedge a genuine silence into a maybe. Conversely, if a provision exists but you cannot pin it to one unambiguous answer, return what the document says AND list the reason in ambiguities. Those two situations are recorded differently and both matter.

EVIDENCE TYPE
  explicit — the answer is stated in the text.
  derived  — the answer follows from other stated facts, for example an end date computed from a start date plus a stated duration. Still quote every input you relied on.
  absent   — the document is silent.

AMBIGUITIES
List anything that stops the answer being a single plain fact, naming the clause that creates the doubt. Examples worth catching: a liability cap that a separate schedule or indemnity may sit outside of; a notice period expressed in business days when no holiday calendar is available; a figure that depends on an event the contract does not date; two clauses that pull in different directions.

Be discriminating. An ambiguity you raise makes the field render to the user as uncertain, so raising one where the position is actually clear is not caution, it is noise that buries the doubts that matter. In particular, the carve-outs that appear in substantially every commercial contract — death or personal injury caused by negligence, fraud or fraudulent misrepresentation, and liability that cannot lawfully be limited — are universal and legally unavoidable. Do NOT report them as ambiguities in a liability cap; they do not put a commercially material head of liability outside the stated ceiling. Do report a carve-out that could: an indemnity or schedule whose relationship to the cap is left unresolved, an uncapped category of loss, or a cap that a later clause contradicts.

FIELDS
  parties                    Who is contracting, with the defined role each takes.
  commencementDate           When the agreement starts. YYYY-MM-DD.
  termLength                 The duration of the current term, e.g. "12 months".
  termEnd                    When the current term ends. YYYY-MM-DD. If the document states it, that is explicit; if you had to compute it from commencement plus duration, that is derived.
  renewalType                How and whether it renews: automatically, only by written agreement, or not at all.
  renewalNoticeDays          The notice needed to STOP a renewal. This is often in a termination clause rather than beside the renewal clause, so look through the whole document and follow cross-references. Absent when nothing renews automatically.
  terminationForConvenience  Who may walk away without cause, and on what notice.
  terminationForCause        Termination on breach, insolvency and similar.
  liabilityCap               The ceiling on liability. If a schedule, indemnity or carve-out may sit outside the cap, still report the figure but say so in ambiguities — an uncapped exposure hiding behind a stated cap is the single most costly thing to miss.
  exclusivity                Exclusivity, sole appointment or restrictive covenants. Beware false friends: "exclusive of GST" is about tax, not exclusivity.

PAYMENTS
Every payment obligation, with amounts in minor units (S$40,000 is 4000000) and the currency separate. Use frequency "on-invoice" where payment is due a number of days after an invoice rather than on a calendar date, set conditional to true, and leave firstDueDate null — a due date that depends on an undated event is not a date.

GRANTS
Every exclusivity or restrictive-covenant grant, normalised so overlaps between documents can be computed in code. Distinguish exclusive (nobody else, usually including the grantor) from sole (the grantor may still act itself, but will appoint nobody else) from non-exclusive, reading the substance of the clause rather than the label it uses. Resolve product scope through any schedule the clause cross-refers to.

Name the grantee and grantor as the LEGAL ENTITIES they are, resolving defined terms back to the parties clause: write "Apex Scientific Pte Ltd", never "the Distributor". Grants from different documents are compared against each other to detect conflicts, and a defined role term means nothing outside the document that defines it.

Make no claim that does not come from this document. No statutes, no market practice, no view on enforceability.`;

/** Exported so the upload API route builds the identical prompt the CLI uses. */
export function userPrompt(doc: ParsedDoc): string {
  const provenance = doc.ocrPages.length
    ? `This text came from optical character recognition of a scanned document (pages ${doc.ocrPages.join(", ")}). It may contain recognition errors. Quote them exactly as they appear.`
    : doc.paginated
      ? `This text was extracted from a PDF text layer.`
      : `This text came from a word-processor file, which has no fixed pagination.`;

  return `Document: ${doc.title}
File: ${doc.fileName}
${provenance}

--- BEGIN DOCUMENT TEXT ---
${doc.fullText}
--- END DOCUMENT TEXT ---`;
}

export async function run(opts: StageOpts, concurrency = DEFAULT_CONCURRENCY): Promise<Map<string, RawExtraction>> {
  const parsedDir = path.join(opts.dataDir, "parsed");
  const outDir = path.join(opts.dataDir, "extractions");
  const cacheDir = path.join(opts.dataDir, "cache");
  await mkdir(outDir, { recursive: true });
  await mkdir(cacheDir, { recursive: true });

  const files = (await readdir(parsedDir)).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) {
    throw new Error(`No parsed documents in ${parsedDir}. Run ingest first.`);
  }

  const results = new Map<string, RawExtraction>();
  const failures: { docId: string; reason: string }[] = [];
  const limit = pLimit(concurrency);
  const started = Date.now();

  await Promise.all(
    files.map((file) =>
      limit(async () => {
        const doc = JSON.parse(await readFile(path.join(parsedDir, file), "utf8")) as ParsedDoc;
        const began = Date.now();

        try {
          const { data, cached, model } = await callStructured<RawExtraction>({
            system: SYSTEM_PROMPT,
            user: userPrompt(doc),
            schemaName: EXTRACTION_SCHEMA_NAME,
            schema: EXTRACTION_SCHEMA,
            cacheDir,
            label: doc.docId,
          });

          await writeFile(path.join(outDir, `${doc.docId}.json`), `${JSON.stringify(data, null, 2)}
`);
          results.set(doc.docId, data);

          const absent = data.fields.filter((f) => f.evidenceType === "absent").length;
          const ambiguous = data.fields.filter((f) => f.ambiguities.length > 0).length;
          const quotes = data.fields.reduce((n, f) => n + f.quotes.length, 0);
          console.log(
            `${doc.docId.padEnd(30)} ${cached ? "cached " : "called "} ` +
              `${String(data.fields.length).padStart(2)} fields, ${String(quotes).padStart(3)} quotes, ` +
              `${absent} absent, ${ambiguous} ambiguous, ${data.payments.length} payments, ${data.grants.length} grants` +
              `${cached ? "" : `  (${((Date.now() - began) / 1000).toFixed(1)}s, ${model})`}`,
          );
        } catch (error) {
          // One document failing must not lose the other seventy-nine. The
          // failure is recorded and compute reports the contract as unavailable
          // rather than quietly omitting it.
          const reason = error instanceof Error ? error.message : String(error);
          failures.push({ docId: doc.docId, reason });
          console.error(`${doc.docId.padEnd(30)} FAILED  ${reason}`);
        }
      }),
    ),
  );

  if (files.length > 1) {
    console.log(
      `
${results.size}/${files.length} extracted in ${((Date.now() - started) / 1000).toFixed(1)}s ` +
        `at concurrency ${concurrency}`,
    );
  }
  if (failures.length > 0) {
    console.error(
      `${failures.length} document(s) failed and have no extraction. Re-run to retry just those; ` +
        `everything that succeeded is cached.`,
    );
  }

  return results;
}

if (import.meta.filename === process.argv[1]) {
  const ROOT = path.resolve(import.meta.dirname, "..");
  const { values } = parseArgs({
    options: {
      corpus: { type: "string", default: path.join(ROOT, "data", "corpus") },
      data: { type: "string", default: path.join(ROOT, "data") },
      concurrency: { type: "string", default: String(DEFAULT_CONCURRENCY) },
    },
  });
  await run({
    corpusDir: path.resolve(values.corpus!),
    dataDir: path.resolve(values.data!),
    asOf: new Date(),
    windowDays: 90,
  }, Number(values.concurrency));
}
