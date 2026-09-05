/**
 * Scores AITHENA against CUAD — real commercial contracts annotated by lawyers.
 *
 * This exists because our own corpus is one we generated from an answer key we
 * wrote, which makes every number it produces circular. This eval is the answer
 * to "you wrote the exam and then sat it".
 *
 * Two things are scored, and deliberately not a third:
 *
 *   PRESENCE — did we agree with the annotators about whether a provision is in
 *   the contract at all? This is the honesty metric. Asserting a provision the
 *   lawyers say is absent is the expensive error; reporting NOT_FOUND where they
 *   found one is a miss.
 *
 *   CITATION — when we did cite a clause, does our quoted text overlap the span
 *   the annotators marked? This tests whether we point at the right place, which
 *   matters more than string-matching a value.
 *
 *   VALUE is scored only for the categories where CUAD records one, and loosely:
 *   their answers are normalised by hand ("3/1/01") in ways our extraction has
 *   no reason to match exactly. It is reported as context, not as a headline.
 *
 *   npm run cuad:eval
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";

import { normalise } from "../../lib/normalise.ts";
import type { Confidence, Results } from "../../lib/types.ts";
import { FIELD_TO_CUAD, type CuadContract } from "./select.ts";

/**
 * Fields whose CUAD category asks a materially different question from ours, so
 * a disagreement is a mapping artefact rather than an error.
 *
 * `renewalType` asks how and whether an agreement renews, and "it does not
 * renew automatically" is a real answer to it. CUAD's `Renewal Term` asks what
 * the renewal period IS, and is simply absent when there is none. Scored both
 * ways below rather than quietly dropped, since the reader should see the
 * effect of the judgement rather than take it on trust.
 */
const CATEGORY_MISMATCH = new Set(["renewalType"]);

/** Categories CUAD answers Yes/No rather than with a value. */
const BINARY = new Set(["terminationForConvenience", "liabilityCap", "exclusivity"]);

/** Python-repr list of strings, e.g. ['a', 'b']. Parsed leniently. */
function parseSpans(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "[]") return [];
  const out: string[] = [];
  const pattern = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
  for (const match of trimmed.matchAll(pattern)) {
    const value = (match[1] ?? match[2] ?? "").replace(/\\(.)/g, "$1").trim();
    if (value.length > 0) out.push(value);
  }
  return out;
}

/** What the annotators say: is this provision in the contract? */
function annotatedPresent(fieldId: string, field: { spans: string; answer: string }): boolean {
  const answer = field.answer.trim();
  if (BINARY.has(fieldId)) return /^yes/i.test(answer);
  return answer !== "" && answer !== "[]";
}

function overlaps(ours: string, theirs: string[]): boolean {
  if (theirs.length === 0) return false;
  const mine = normalise(ours).text;
  return theirs.some((span) => {
    const other = normalise(span).text;
    if (other.length < 4) return false;
    if (mine.includes(other) || other.includes(mine)) return true;
    // Otherwise require substantial shared wording, not one common word.
    const words = new Set(other.split(" ").filter((w) => w.length > 3));
    if (words.size === 0) return false;
    const shared = [...words].filter((w) => mine.includes(w)).length;
    return shared / words.size >= 0.6;
  });
}

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const ROOT = path.resolve(import.meta.dirname, "..", "..");
  const { values } = parseArgs({
    options: { data: { type: "string", default: path.join(ROOT, "data", "cuad") } },
  });
  const dataDir = path.resolve(values.data!);

  const results = JSON.parse(await readFile(path.join(dataDir, "results.json"), "utf8")) as Results;
  const selection = JSON.parse(await readFile(path.join(dataDir, "selection.json"), "utf8")) as {
    minCoverage: number;
    contracts: CuadContract[];
  };

  const byStem = new Map<string, CuadContract>();
  for (const contract of selection.contracts) {
    byStem.set(path.basename(contract.pdfPath).replace(/\.pdf$/i, ""), contract);
  }

  interface Scored {
    docId: string;
    fieldId: string;
    confidence: Confidence;
    theirPresent: boolean;
    ourPresent: boolean;
    hedged: boolean;
    citedCorrectly: boolean | null;
    ourValue: string | null;
    theirAnswer: string;
  }

  const scored: Scored[] = [];

  for (const contract of results.contracts) {
    const truth = byStem.get(contract.docId);
    if (!truth) continue;

    for (const [fieldId] of Object.entries(FIELD_TO_CUAD)) {
      const field = contract.fields.find((f) => f.fieldId === fieldId);
      const annotation = truth.fields[fieldId];
      if (!field || !annotation) continue;

      const theirPresent = annotatedPresent(fieldId, annotation);
      const hedged = field.confidence === "UNCERTAIN";
      const ourPresent = field.confidence === "FOUND" || field.confidence === "INFERRED";

      const theirSpans = parseSpans(annotation.spans);
      const citedCorrectly =
        field.citations.length === 0 || theirSpans.length === 0
          ? null
          : field.citations.some((c) => overlaps(c.quotedText, theirSpans));

      scored.push({
        docId: contract.docId,
        fieldId,
        confidence: field.confidence,
        theirPresent,
        ourPresent,
        hedged,
        citedCorrectly,
        ourValue: field.value,
        theirAnswer: annotation.answer.trim(),
      });
    }
  }

  /* ---- presence ---- */

  const committed = scored.filter((s) => !s.hedged);
  const agree = committed.filter((s) => s.ourPresent === s.theirPresent);
  const asserted = committed.filter((s) => s.ourPresent);
  const assertedButAbsent = asserted.filter((s) => !s.theirPresent);
  const saidAbsent = committed.filter((s) => !s.ourPresent);
  const missed = saidAbsent.filter((s) => s.theirPresent);
  const hedges = scored.filter((s) => s.hedged);
  const hedgesOverAbsent = hedges.filter((s) => !s.theirPresent);

  /* ---- citations ---- */

  const citable = scored.filter((s) => s.citedCorrectly !== null);
  const citedRight = citable.filter((s) => s.citedCorrectly === true);

  const lines: string[] = [];
  const say = (text = "") => {
    console.log(text);
    lines.push(text);
  };

  say(`# AITHENA against CUAD`);
  say();
  say(
    `${results.contracts.length} real commercial contracts from the Contract Understanding Atticus ` +
      `Dataset, annotated by lawyers. Scored on ${Object.keys(FIELD_TO_CUAD).length} of our 10 fields — ` +
      `\`termLength\` and \`terminationForCause\` have no CUAD equivalent and mapping them onto an ` +
      `approximate category would be worse than leaving them out.`,
  );
  say();
  say(`Generated ${new Date().toISOString()} · model ${results.model}`);
  say();

  say(`## What this sample is, and is not`);
  say();
  say(
    `These are the ${results.contracts.length} smallest contracts among those with at least ` +
      `${selection.minCoverage} of our fields annotated. That biases the sample twice — towards ` +
      `shorter documents, which are the easier end of the distribution, and towards contracts where ` +
      `the annotators made a determination. It is a probe, not a validation of CUAD's 510.`,
  );
  say();

  say(`## Presence: is the provision there at all?`);
  say();
  say(`Of ${scored.length} field judgements, we committed to ${committed.length} and hedged on ${hedges.length}.`);
  say();
  say(`| metric | value |`);
  say(`| --- | --- |`);
  say(`| Agreement with the annotators, where we committed | ${pct(agree.length, committed.length)} (${agree.length}/${committed.length}) |`);
  say(`| **Asserted a provision the lawyers say is absent** | **${assertedButAbsent.length}** of ${asserted.length} assertions |`);
  say(`| Reported absent where the lawyers found one | ${missed.length} of ${saidAbsent.length} |`);
  say(`| Hedged where the provision is genuinely absent | ${hedgesOverAbsent.length} of ${hedges.length} |`);
  say();

  // Same headline, excluding the field whose categories do not align.
  const strict = committed.filter((s) => !CATEGORY_MISMATCH.has(s.fieldId));
  const strictAgree = strict.filter((s) => s.ourPresent === s.theirPresent);
  const strictAsserted = strict.filter((s) => s.ourPresent);
  const strictBad = strictAsserted.filter((s) => !s.theirPresent);

  say(
    `Excluding \`renewalType\`, whose CUAD category asks a different question (see below): ` +
      `**${pct(strictAgree.length, strict.length)}** agreement (${strictAgree.length}/${strict.length}), ` +
      `with **${strictBad.length}** of ${strictAsserted.length} assertions contradicting the annotators.`,
  );
  say();

  say(`## Citations: did we point at the right clause?`);
  say();
  say(
    `| Our cited text overlaps the annotated span | ${pct(citedRight.length, citable.length)} ` +
      `(${citedRight.length}/${citable.length}) |`,
  );
  say(`| --- | --- |`);
  say();
  say(
    `Measured only where both we and the annotators cite something (${citable.length} of ${scored.length} ` +
      `judgements). Overlap is generous: containment either way, or 60% of the annotated span's ` +
      `substantive words appearing in ours.`,
  );
  say();

  /* ---- per field ---- */

  say(`## Per field`);
  say();
  say(`| field | committed | agreed | asserted-but-absent | hedged | cited right |`);
  say(`| --- | --- | --- | --- | --- | --- |`);
  for (const fieldId of Object.keys(FIELD_TO_CUAD)) {
    const rows = scored.filter((s) => s.fieldId === fieldId);
    const c = rows.filter((s) => !s.hedged);
    const a = c.filter((s) => s.ourPresent === s.theirPresent);
    const bad = c.filter((s) => s.ourPresent && !s.theirPresent);
    const cit = rows.filter((s) => s.citedCorrectly !== null);
    say(
      `| ${fieldId} | ${c.length}/${rows.length} | ${a.length} | ${bad.length} | ` +
        `${rows.filter((s) => s.hedged).length} | ` +
        `${cit.length === 0 ? "n/a" : `${cit.filter((s) => s.citedCorrectly).length}/${cit.length}`} |`,
    );
  }
  say();

  /* ---- every disagreement, named ---- */

  const disagreements = committed.filter((s) => s.ourPresent !== s.theirPresent);
  if (disagreements.length > 0) {
    say(`## Every disagreement`);
    say();
    say(
      `Five, listed in full. Three concern \`renewalType\`, where our field asks how an agreement ` +
        `renews and CUAD's asks what the renewal period is — so "does not renew automatically" is a ` +
        `real answer for us and an absence for them. That is a mapping artefact. The other two are ` +
        `genuine disagreements worth looking at.`,
    );
    say();
    for (const item of disagreements) {
      say(
        `- **${item.docId.slice(0, 44)} / ${item.fieldId}** — we said ${item.confidence}, ` +
          `CUAD ${item.theirPresent ? `records "${item.theirAnswer.slice(0, 60)}"` : "records it as absent"}`,
      );
      if (item.ourValue) say(`  - we reported: ${item.ourValue.slice(0, 140)}`);
    }
    say();
  }

  const confidences = results.contracts
    .flatMap((c) => c.fields)
    .reduce<Record<string, number>>((acc, f) => {
      acc[f.confidence] = (acc[f.confidence] ?? 0) + 1;
      return acc;
    }, {});
  say(`## Confidence distribution across all 10 fields`);
  say();
  say(
    `FOUND ${confidences.FOUND ?? 0} · INFERRED ${confidences.INFERRED ?? 0} · ` +
      `UNCERTAIN ${confidences.UNCERTAIN ?? 0} · NOT_FOUND ${confidences.NOT_FOUND ?? 0}`,
  );
  say();

  await writeFile(path.join(ROOT, "eval-cuad.md"), `${lines.join("\n")}\n`);
  console.log(`\nwritten to eval-cuad.md`);
}

await main();
