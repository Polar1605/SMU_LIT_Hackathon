/**
 * Writes a folder of the source contracts under readable names, for handing to
 * someone who wants to read the originals before looking at what CLARA made
 * of them.
 *
 * The NDA is rendered to PDF here so the whole set opens the same way. That is a
 * COPY for reading — the corpus keeps the .docx as the ingested original,
 * because a word-processor file having no fixed pagination is the case that
 * makes CLARA say "no page numbering" instead of inventing a page number. If
 * the DOCX were replaced, that behaviour would quietly disappear.
 *
 *   npm run exports
 */

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";

import { renderPdf, type Clause } from "./corpus/render-pdf.ts";
import { buildNda } from "./corpus/builders.ts";
import type { ResolvedContract, ResolvedGroundTruth } from "./corpus/ground-truth.ts";

/** Reading order for someone being walked through the set. */
const ORDER = [
  "saas-subscription",
  "distribution-a",
  "distribution-b",
  "msa",
  "mutual-nda",
  "supplier-agreement",
];

const NOTE: Record<string, string> = {
  "saas-subscription": "auto-renews; notice period sits in cl. 12.3, away from the renewal clause",
  "distribution-a": "grants exclusive Singapore rights",
  "distribution-b": "grants sole rights over the same territory and product",
  msa: "liability cap with a possible carve-out in the indemnity schedule",
  "mutual-nda": "no exclusivity provision at all; originally a Word file",
  "supplier-agreement": "scanned, no text layer; notice in business days",
};

function safeName(index: number, title: string): string {
  const clean = title.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim();
  return `${String(index + 1).padStart(2, "0")} ${clean}.pdf`;
}

async function ndaToPdf(contract: ResolvedContract): Promise<Uint8Array> {
  const nda = buildNda(contract);
  const clauses: Clause[] = nda.sections.map((section) => ({
    id: section.heading,
    heading: section.heading,
    unnumbered: true,
    body: section.paragraphs.join("\n\n"),
  }));

  return renderPdf({
    docId: contract.docId,
    title: nda.title,
    subtitle: "Reading copy. The original ingested by CLARA is a Word file with no fixed pagination.",
    font: "helvetica",
    clauses,
  });
}

async function main(): Promise<void> {
  const ROOT = path.resolve(import.meta.dirname, "..");
  const { values } = parseArgs({
    options: {
      data: { type: "string", default: path.join(ROOT, "data") },
      out: { type: "string", default: path.join(ROOT, "data", "exports") },
    },
  });

  const dataDir = path.resolve(values.data!);
  const outDir = path.resolve(values.out!);
  await mkdir(outDir, { recursive: true });

  const truth = JSON.parse(
    await readFile(path.join(dataDir, "ground-truth.json"), "utf8"),
  ) as ResolvedGroundTruth;

  const ordered = ORDER.map((id) => truth.contracts.find((c) => c.docId === id)).filter(
    (c): c is ResolvedContract => c !== undefined,
  );

  const index: string[] = [
    "# The six contracts CLARA read",
    "",
    "Synthetic documents between invented companies — no real client material appears anywhere in",
    "this project. Read them first, then open CLARA and click any clause reference to see the",
    "same passage highlighted in the source.",
    "",
  ];

  for (const [i, contract] of ordered.entries()) {
    const outName = safeName(i, contract.title);

    if (contract.format === "docx") {
      await writeFile(path.join(outDir, outName), await ndaToPdf(contract));
    } else {
      await copyFile(path.join(dataDir, "corpus", contract.fileName), path.join(outDir, outName));
    }

    console.log(`${outName.padEnd(46)} ${NOTE[contract.docId] ?? ""}`);
    index.push(`${i + 1}. **${contract.title}** — ${NOTE[contract.docId] ?? ""}`);
    index.push(`   \`${outName}\` (ingested as \`${contract.fileName}\`)`);
    index.push("");
  }

  await writeFile(path.join(outDir, "README.md"), `${index.join("\n")}\n`);
  console.log(`\n${ordered.length} documents written to ${outDir}`);
}

await main();
