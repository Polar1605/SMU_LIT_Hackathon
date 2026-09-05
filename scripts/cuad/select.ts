/**
 * Chooses a sample of CUAD contracts to test against, and fetches them.
 *
 * The selection rule is stated here because it bounds every claim the eval can
 * make. Contracts are picked for FIELD COVERAGE first — how many of the
 * provisions we extract the annotators actually found — and then for the
 * smallest documents among those, to keep the run affordable.
 *
 * That biases the sample twice, and the report has to say so: towards shorter
 * contracts, which are the easier end of the distribution, and towards ones
 * where the provisions exist. It does not remove the absence cases, because a
 * contract with six of eight provisions still gives two genuine silences to
 * test NOT_FOUND against, and CUAD marks absence with an empty cell.
 *
 *   npm run cuad:select -- --count 10
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";

const HF = "https://huggingface.co/datasets/theatticusproject/cuad/resolve/main/CUAD_v1";

/**
 * Our field ids against CUAD's category columns.
 *
 * `termLength` and `terminationForCause` have no CUAD equivalent and are left
 * out rather than mapped onto something approximate — scoring a field against a
 * category that does not mean the same thing would be worse than not scoring it.
 */
export const FIELD_TO_CUAD: Record<string, string> = {
  parties: "Parties",
  commencementDate: "Effective Date",
  termEnd: "Expiration Date",
  renewalType: "Renewal Term",
  renewalNoticeDays: "Notice Period To Terminate Renewal",
  terminationForConvenience: "Termination For Convenience",
  liabilityCap: "Cap On Liability",
  exclusivity: "Exclusivity",
};

/** Fully quoted CSV with embedded newlines — the span columns contain prose. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** CUAD's headers are inconsistent about the space before "Answer". */
function answerColumn(headers: string[], category: string): number {
  const normalise = (s: string) => s.toLowerCase().replace(/[\s-]+/g, " ").trim();
  const target = normalise(`${category} answer`);
  return headers.findIndex((h) => normalise(h) === target);
}

export interface CuadContract {
  /** The value in the CSV's first column, which keys everything. */
  filename: string;
  pdfPath: string;
  sizeBytes: number;
  /** fieldId -> { spans, answer }. An empty answer means the annotators found none. */
  fields: Record<string, { spans: string; answer: string }>;
  coverage: number;
}

async function main(): Promise<void> {
  const ROOT = path.resolve(import.meta.dirname, "..", "..");
  const { values } = parseArgs({
    options: {
      count: { type: "string", default: "10" },
      data: { type: "string", default: path.join(ROOT, "data", "cuad") },
      "min-coverage": { type: "string", default: "5" },
      /** "smallest" keeps the run cheap; "spread" samples across document length. */
      strategy: { type: "string", default: "smallest" },
    },
  });

  const dataDir = path.resolve(values.data!);
  const count = Number(values.count);
  const minCoverage = Number(values["min-coverage"]);

  const rows = parseCsv(await readFile(path.join(dataDir, "master_clauses.csv"), "utf8"));
  const headers = rows[0];
  const pdfs = JSON.parse(await readFile(path.join(dataDir, "_pdfs.json"), "utf8")) as {
    path: string;
    size: number;
  }[];

  // Match CSV rows to PDFs on the stem, since extensions vary in case.
  const byStem = new Map<string, { path: string; size: number }>();
  for (const pdf of pdfs) {
    const stem = path.basename(pdf.path).replace(/\.pdf$/i, "").toLowerCase();
    byStem.set(stem, pdf);
  }

  const columns = Object.entries(FIELD_TO_CUAD).map(([fieldId, category]) => ({
    fieldId,
    spanCol: headers.findIndex((h) => h.trim().toLowerCase() === category.toLowerCase()),
    answerCol: answerColumn(headers, category),
  }));

  const missing = columns.filter((c) => c.spanCol === -1 || c.answerCol === -1);
  if (missing.length > 0) {
    throw new Error(
      `Could not locate CUAD columns for: ${missing.map((m) => m.fieldId).join(", ")}. ` +
        `The dataset schema may have changed.`,
    );
  }

  const contracts: CuadContract[] = [];
  for (const row of rows.slice(1)) {
    if (row.length < headers.length) continue;
    const filename = row[0]?.trim();
    if (!filename) continue;

    const pdf = byStem.get(filename.replace(/\.pdf$/i, "").toLowerCase());
    if (!pdf) continue;

    const fields: CuadContract["fields"] = {};
    let coverage = 0;
    for (const column of columns) {
      const answer = (row[column.answerCol] ?? "").trim();
      const spans = (row[column.spanCol] ?? "").trim();
      fields[column.fieldId] = { spans, answer };
      if (answer && answer !== "[]") coverage += 1;
    }

    contracts.push({ filename, pdfPath: pdf.path, sizeBytes: pdf.size, fields, coverage });
  }

  console.log(`${contracts.length} contracts matched between the answer key and the PDFs`);

  const eligible = contracts
    .filter((c) => c.coverage >= minCoverage)
    .sort((a, b) => a.sizeBytes - b.sizeBytes);

  console.log(`${eligible.length} have at least ${minCoverage} of our ${columns.length} fields answered`);

  // Anything already selected stays selected. Its extraction is cached, so
  // keeping it is free, and the earlier numbers stay comparable.
  let existing: CuadContract[] = [];
  try {
    existing = (JSON.parse(await readFile(path.join(dataDir, "selection.json"), "utf8")) as {
      contracts: CuadContract[];
    }).contracts;
    console.log(`${existing.length} already selected and cached; keeping them`);
  } catch {
    // First run.
  }
  const already = new Set(existing.map((c) => c.filename));

  const remaining = eligible.filter((c) => !already.has(c.filename));
  const need = Math.max(0, count - existing.length);

  let added: CuadContract[];
  if (values.strategy === "spread") {
    // Evenly spaced across the length-sorted list, so the sample stops being
    // only short documents. Deterministic — no randomness to reproduce.
    added = [];
    for (let i = 0; i < need && remaining.length > 0; i += 1) {
      const index = Math.min(remaining.length - 1, Math.round((i * (remaining.length - 1)) / Math.max(1, need - 1)));
      const [picked] = remaining.splice(index, 1);
      added.push(picked);
    }
  } else {
    added = remaining.slice(0, need);
  }

  const chosen = [...existing, ...added].sort((a, b) => a.sizeBytes - b.sizeBytes);
  console.log(`selecting ${added.length} more by "${values.strategy}" -> ${chosen.length} total`);
  if (chosen.length < count) {
    console.warn(`Only ${chosen.length} met the bar; continuing with those.`);
  }

  const corpusDir = path.join(dataDir, "corpus");
  await mkdir(corpusDir, { recursive: true });

  console.log(`\ndownloading ${chosen.length}:`);
  for (const contract of chosen) {
    const outName = `${path.basename(contract.pdfPath)}`;
    const url = `${HF}/${contract.pdfPath.replace(/^CUAD_v1\//, "")}`
      .split("/")
      .map((part, i) => (i > 2 ? encodeURIComponent(part) : part))
      .join("/");

    const response = await fetch(url);
    if (!response.ok) throw new Error(`${outName}: HTTP ${response.status} fetching ${url}`);
    await writeFile(path.join(corpusDir, outName), Buffer.from(await response.arrayBuffer()));

    console.log(
      `  ${String(Math.round(contract.sizeBytes / 1024)).padStart(4)}KB  ` +
        `${contract.coverage}/${columns.length} fields  ${outName.slice(0, 72)}`,
    );
  }

  await writeFile(
    path.join(dataDir, "selection.json"),
    `${JSON.stringify({ selectedAt: new Date().toISOString(), minCoverage, contracts: chosen }, null, 2)}\n`,
  );
  console.log(`\nanswer key for the sample -> data/cuad/selection.json`);
}

// Only run when invoked directly: eval.ts imports the field map from here, and
// a module that downloads a dataset as a side effect of being imported is a trap.
if (import.meta.filename === process.argv[1]) {
  await main();
}
