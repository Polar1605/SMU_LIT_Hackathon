/**
 * Generates the corpus from the answer key.
 *
 * Order matters and is the point: resolve the template into an absolute answer
 * key, generate prose FROM it, then assert that every ground-truth value is
 * actually present in the prose. If the assertion fails the script throws, so a
 * drifted answer key can never quietly become our scoreboard.
 *
 *   npm run corpus                      # as of today
 *   npm run corpus -- --as-of 2026-10-01
 */

import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import path from "node:path";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

import { renderPdf, type DocSpec } from "./corpus/render-pdf.ts";
import { PDF_BUILDERS, buildNda } from "./corpus/builders.ts";
import {
  longDate,
  resolveGroundTruth,
  type RawTemplate,
  type ResolvedContract,
  type ResolvedGroundTruth,
} from "./corpus/ground-truth.ts";
import { makeScannedPdf } from "./corpus/scan.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

/** Flattens a DocSpec back to plain text so we can assert against what we wrote. */
function specText(spec: DocSpec): string {
  return [spec.title, spec.subtitle ?? "", ...spec.clauses.map((c) => `${c.id} ${c.heading ?? ""} ${c.body}`)].join("\n");
}

/**
 * Every numeral we claim as ground truth must appear in the document. This is a
 * blunt check on purpose: it catches the failure that actually happens, which is
 * editing prose and forgetting to update the key (or vice versa).
 */
function auditContract(gt: ResolvedContract, text: string, clauseIds: Set<string>): string[] {
  const problems: string[] = [];

  for (const [fieldId, field] of Object.entries(gt.fields)) {
    if (field.absent) {
      if (field.value !== null) problems.push(`${fieldId}: marked absent but carries a value`);
      continue;
    }
    if (field.value === null) {
      problems.push(`${fieldId}: has no value and is not marked absent`);
      continue;
    }

    if (field.clauseId && !clauseIds.has(field.clauseId)) {
      problems.push(`${fieldId}: cites clause "${field.clauseId}", which the document does not contain`);
    }

    const needle = field.isDate ? longDate(field.value) : null;
    if (needle) {
      const appears = text.includes(needle);
      // An INFERRED field is one the reader must compute. If the document states
      // it outright, INFERRED is the wrong label and the key is lying to us — so
      // the audit checks both directions rather than only the easy one.
      if (field.expectedConfidence === "INFERRED" && appears) {
        problems.push(
          `${fieldId}: expected INFERRED, but the document states "${needle}" outright — it should be FOUND, or the prose should stop stating it`,
        );
      } else if (field.expectedConfidence !== "INFERRED" && !appears) {
        problems.push(`${fieldId}: date "${needle}" does not appear in the document`);
      }
      continue;
    }

    // For non-date values, every number in the claimed value must be findable.
    if (!field.isDate) {
      for (const numeral of field.value.match(/\d[\d,]*/g) ?? []) {
        if (!text.includes(numeral)) {
          problems.push(`${fieldId}: numeral "${numeral}" from the answer key does not appear in the document`);
        }
      }
    }
  }

  for (const payment of gt.payments) {
    if (!clauseIds.has(payment.clauseId)) {
      problems.push(`payment "${payment.description}": cites clause "${payment.clauseId}", which is missing`);
    }
  }
  for (const grant of gt.grants) {
    if (!clauseIds.has(grant.clauseId)) {
      problems.push(`grant to ${grant.grantee}: cites clause "${grant.clauseId}", which is missing`);
    }
    if (!text.includes(grant.exclusivityType)) {
      problems.push(`grant to ${grant.grantee}: the word "${grant.exclusivityType}" does not appear in the document`);
    }
  }

  return problems;
}

async function writeNda(gt: ResolvedContract, outPath: string): Promise<string> {
  const nda = buildNda(gt);
  const children: Paragraph[] = [
    new Paragraph({ text: nda.title, heading: HeadingLevel.HEADING_1 }),
  ];
  for (const section of nda.sections) {
    children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_2 }));
    for (const paragraph of section.paragraphs) {
      children.push(new Paragraph({ children: [new TextRun(paragraph)], spacing: { after: 160 } }));
    }
  }
  const doc = new Document({ sections: [{ children }] });
  await writeFile(outPath, await Packer.toBuffer(doc));

  return [nda.title, ...nda.sections.flatMap((s) => [s.heading, ...s.paragraphs])].join("\n");
}

/** Clause ids the NDA exposes, derived from its numbered headings. */
function ndaClauseIds(text: string): Set<string> {
  const ids = new Set<string>(["Parties"]);
  for (const match of text.matchAll(/^(\d+)\.\s/gm)) ids.add(match[1]);
  return ids;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "as-of": { type: "string" },
      data: { type: "string", default: path.join(ROOT, "data") },
    },
  });

  const asOf = values["as-of"] ? new Date(`${values["as-of"]}T00:00:00`) : new Date();
  if (Number.isNaN(asOf.getTime())) throw new Error(`--as-of is not a valid date: ${values["as-of"]}`);

  const dataDir = path.resolve(values.data!);
  const corpusDir = path.join(dataDir, "corpus");
  const buildDir = path.join(dataDir, "build");
  await mkdir(corpusDir, { recursive: true });
  await mkdir(buildDir, { recursive: true });

  const template = JSON.parse(
    readFileSync(path.join(dataDir, "ground-truth.template.json"), "utf8"),
  ) as RawTemplate;

  const resolved: ResolvedGroundTruth = resolveGroundTruth(template, asOf);
  await writeFile(
    path.join(dataDir, "ground-truth.json"),
    `${JSON.stringify(resolved, null, 2)}\n`,
  );
  console.log(`answer key   as of ${resolved.asOf} -> data/ground-truth.json`);

  const allProblems: string[] = [];

  for (const contract of resolved.contracts) {
    if (contract.format === "docx") {
      const outPath = path.join(corpusDir, contract.fileName);
      const text = await writeNda(contract, outPath);
      allProblems.push(
        ...auditContract(contract, text, ndaClauseIds(text)).map((p) => `${contract.docId}: ${p}`),
      );
      console.log(`docx         ${contract.fileName}`);
      continue;
    }

    const builder = PDF_BUILDERS[contract.docId];
    if (!builder) throw new Error(`No prose builder registered for "${contract.docId}"`);
    const spec = builder(contract);
    const bytes = await renderPdf(spec);

    const clauseIds = new Set(spec.clauses.map((c) => c.id));
    allProblems.push(
      ...auditContract(contract, specText(spec), clauseIds).map((p) => `${contract.docId}: ${p}`),
    );

    if (contract.scanned) {
      // The clean render is an intermediate; only the scanned artefact is ingested.
      const cleanPath = path.join(buildDir, `${contract.docId}-clean.pdf`);
      await writeFile(cleanPath, bytes);
      const result = await makeScannedPdf(cleanPath, path.join(corpusDir, contract.fileName));
      console.log(`scanned pdf  ${contract.fileName}  (${result.note})`);
    } else {
      await writeFile(path.join(corpusDir, contract.fileName), bytes);
      console.log(`pdf          ${contract.fileName}`);
    }
  }

  if (allProblems.length > 0) {
    console.error("\nGround truth does not match the generated prose:");
    for (const problem of allProblems) console.error(`  - ${problem}`);
    throw new Error(
      `${allProblems.length} ground-truth mismatch(es). Fix the key or the prose — never the audit.`,
    );
  }

  console.log(`\naudit        ${resolved.contracts.length} contracts, every ground-truth value located in its document`);
}

await main();
