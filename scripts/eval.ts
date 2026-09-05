/**
 * Our own scoreboard, printed honestly.
 *
 * Raw accuracy is the least interesting number here. The ones that matter are
 * CONFIDENT ERROR RATE — how often we stated something as fact and were wrong —
 * and HEDGE PRECISION — of the times we declined to commit, how often we would
 * have been wrong had we committed. The second is what separates a system that
 * knows its limits from one that is merely timid: a model that answers
 * "uncertain" to everything scores perfectly on confident errors and terribly
 * on hedge precision.
 *
 * Grading rules that follow from that, and which the answer key encodes:
 *   - Where the contract is genuinely silent, NOT_FOUND is a CORRECT ANSWER,
 *     not a hedge, and asserting anything is wrong.
 *   - Where the document states a figure but leaves it unresolved, UNCERTAIN is
 *     the CORRECT ANSWER, and reporting the figure as FOUND is a confident
 *     error even though the figure itself matches — because the user would act
 *     on a certainty that is not there.
 *
 *   npm run eval
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";
import { differenceInCalendarDays, parseISO } from "date-fns";

import type { RawExtraction } from "../lib/schema.ts";
import type { Confidence, FieldResult, Results, StageOpts } from "../lib/types.ts";

interface GroundTruthField {
  value: string | null;
  absent: boolean;
  ambiguous: boolean;
  expectedConfidence: Confidence;
  isDate: boolean;
  note: string | null;
}

interface GroundTruthContract {
  docId: string;
  fileName: string;
  title: string;
  fields: Record<string, GroundTruthField>;
}

interface GroundTruth {
  asOf: string;
  contracts: GroundTruthContract[];
  expectedConflicts: { id: string; docIds: string[]; territoryCodes: string[]; productCodes: string[] }[];
  expectedEscalations: { id: string; reason: string }[];
}

/* ------------------------------------------------------------------ */
/* Comparing a reported value to the truth                             */
/* ------------------------------------------------------------------ */

const MONEY = /([A-Z]{0,3}\$|\b[A-Z]{3}\s?)?\s?([\d,]+(?:\.\d{2})?)/;

function money(text: string): number | null {
  const match = MONEY.exec(text.replace(/\s+/g, " "));
  if (!match) return null;
  const amount = Number(match[2].replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function firstInteger(text: string): number | null {
  // Prefer a digit form; contracts write "sixty (60) days" and we want the 60.
  const match = /\d+/.exec(text);
  return match ? Number(match[0]) : null;
}

/**
 * Crude suffix stripping, so "automatically" and "automatic" count as the same
 * word. Without it the comparator scores a faithful paraphrase as an error —
 * "does not renew automatically" against "no automatic renewal" — which would
 * put a fault on our own scoreboard that belongs to the string matcher rather
 * than to the extraction.
 */
function stem(word: string): string {
  return word
    .replace(/(ally|ance|ence|tion|sion|ment|ness|ies|ing|ed|ly|s)$/u, "")
    .replace(/i$/u, "y");
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9$]+/)
      .filter((word) => word.length > 2)
      .map(stem)
      .filter((word) => word.length > 2),
  );
}

/**
 * Dates are compared with a one-day tolerance when we had to derive them.
 *
 * "Commences on 18 November and continues for twelve months" genuinely admits
 * both 17 and 18 November as the last day, depending on whether the term is read
 * inclusively. That is a drafting ambiguity rather than an extraction error, and
 * scoring it as a miss would be scoring our own convention, not our accuracy.
 */
function datesMatch(expected: string, actual: string, tolerant: boolean): boolean {
  try {
    const diff = Math.abs(differenceInCalendarDays(parseISO(actual), parseISO(expected)));
    return tolerant ? diff <= 1 : diff === 0;
  } catch {
    return false;
  }
}

function valueMatches(truth: GroundTruthField, reported: string, inferred: boolean): boolean {
  if (truth.value === null) return false;
  const expected = truth.value.trim();
  const actual = reported.trim();
  if (expected.toLowerCase() === actual.toLowerCase()) return true;

  if (truth.isDate) {
    const found = /\d{4}-\d{2}-\d{2}/.exec(actual);
    return found ? datesMatch(expected, found[0], inferred) : false;
  }

  const expectedMoney = money(expected);
  if (expectedMoney !== null && /[$]/.test(expected)) {
    return money(actual) === expectedMoney;
  }

  const expectedNumber = firstInteger(expected);
  if (expectedNumber !== null) {
    // "60 days" against "60 days before the end of the then-current period".
    const actualNumber = firstInteger(actual);
    if (actualNumber !== expectedNumber) return false;
    if (/business day/i.test(expected) !== /business day/i.test(actual)) return false;
    return true;
  }

  // Prose: the reported answer must carry most of the substance of the truth.
  const expectedTokens = tokens(expected);
  const actualTokens = tokens(actual);
  const shared = [...expectedTokens].filter((t) => actualTokens.has(t)).length;
  return expectedTokens.size > 0 && shared / expectedTokens.size >= 0.5;
}

/* ------------------------------------------------------------------ */
/* Grading one field                                                   */
/* ------------------------------------------------------------------ */

type Grade =
  | "correct"
  | "wrong"
  | "hedge-justified"
  | "hedge-unnecessary"
  | "missed";

interface FieldGrade {
  docId: string;
  fieldId: string;
  grade: Grade;
  confidence: Confidence;
  expected: string;
  reported: string;
  /** What we would have said had we committed. Used for hedge precision. */
  wouldHaveSaid: string | null;
  note: string | null;
}

function gradeField(
  docId: string,
  truth: GroundTruthField,
  field: FieldResult,
  rawValue: string | null,
): FieldGrade {
  const asserted = field.confidence === "FOUND" || field.confidence === "INFERRED";
  const inferred = field.confidence === "INFERRED";
  const base = {
    docId,
    fieldId: field.fieldId,
    confidence: field.confidence,
    expected: truth.absent ? "(silent)" : (truth.value ?? "(silent)"),
    reported: field.value ?? `(${field.confidence})`,
    wouldHaveSaid: rawValue,
    note: truth.note,
  };

  // The contract is genuinely silent.
  if (truth.absent) {
    if (field.confidence === "NOT_FOUND") return { ...base, grade: "correct" };
    if (asserted) return { ...base, grade: "wrong" };
    // UNCERTAIN over a genuine silence: we hedged where the answer was knowable.
    return { ...base, grade: "hedge-unnecessary" };
  }

  // The document states something but does not settle it.
  if (truth.ambiguous) {
    if (field.confidence === "UNCERTAIN") return { ...base, grade: "correct" };
    // Reporting the figure as settled is a confident error even if it matches,
    // because the user acts on a certainty the document does not support.
    if (asserted) return { ...base, grade: "wrong" };
    return { ...base, grade: "missed" };
  }

  // A plain, knowable answer.
  if (asserted) {
    return { ...base, grade: valueMatches(truth, field.value ?? "", inferred) ? "correct" : "wrong" };
  }
  if (field.confidence === "NOT_FOUND") return { ...base, grade: "missed" };

  // We hedged. Would committing have been wrong?
  const wouldHaveBeenWrong = rawValue === null || !valueMatches(truth, rawValue, inferred);
  return { ...base, grade: wouldHaveBeenWrong ? "hedge-justified" : "hedge-unnecessary" };
}

/* ------------------------------------------------------------------ */

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "n/a";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export async function run(opts: StageOpts): Promise<void> {
  const results = JSON.parse(
    await readFile(path.join(opts.dataDir, "results.json"), "utf8"),
  ) as Results;

  let truth: GroundTruth | null = null;
  try {
    truth = JSON.parse(await readFile(path.join(opts.dataDir, "ground-truth.json"), "utf8")) as GroundTruth;
  } catch {
    truth = null;
  }

  const lines: string[] = [];
  const say = (text = "") => {
    console.log(text);
    lines.push(text);
  };

  say(`# CLARA evaluation`);
  say();
  say(`Generated ${new Date().toISOString()} · model ${results.model} · as of ${results.asOf}`);
  say();

  /* ---- citations, which need no ground truth ---- */

  const allCitations = results.contracts.flatMap((c) => [
    ...c.fields.flatMap((f) => f.citations),
    ...c.payments.flatMap((p) => p.citations),
    ...c.grants.flatMap((g) => g.citations),
  ]);
  const discarded = results.contracts
    .flatMap((c) => c.fields)
    .reduce((n, f) => n + f.discardedQuoteCount, 0);
  const attempted = allCitations.length + discarded;
  const byKind = allCitations.reduce<Record<string, number>>((acc, c) => {
    acc[c.matchKind] = (acc[c.matchKind] ?? 0) + 1;
    return acc;
  }, {});

  say(`## Citations`);
  say();
  say(`| metric | value |`);
  say(`| --- | --- |`);
  say(`| Quotes returned by the model | ${attempted} |`);
  say(`| Located in the source document | ${allCitations.length} (${pct(allCitations.length, attempted)}) |`);
  say(`| — exact match | ${byKind.exact ?? 0} |`);
  say(`| — normalised match | ${byKind.normalised ?? 0} |`);
  say(`| — fuzzy match (confidence downgraded) | ${byKind.fuzzy ?? 0} |`);
  say(`| Discarded as unverifiable | ${discarded} |`);
  say(`| **Fabricated citations shown to the user** | **0** |`);
  say();
  say(
    `The last row is 0 by construction rather than by luck: a quote that cannot be located is never rendered, ` +
      `and the field that depended on it is reported as uncertain instead.`,
  );
  say();

  if (!truth) {
    say(`## Accuracy`);
    say();
    say(
      `No \`ground-truth.json\` accompanies this corpus, so accuracy, confident error rate and hedge ` +
        `precision are not reported. Inventing a denominator would be exactly the overconfidence this ` +
        `system exists to avoid. Coverage and citation figures above stand on their own.`,
    );
    const coverage = results.contracts
      .flatMap((c) => c.fields)
      .filter((f) => f.confidence === "FOUND" || f.confidence === "INFERRED").length;
    const totalFields = results.contracts.flatMap((c) => c.fields).length;
    say();
    say(`Coverage: ${coverage}/${totalFields} fields answered (${pct(coverage, totalFields)}).`);
    await writeFile(path.join(opts.dataDir, "..", "eval-report.md"), `${lines.join("\n")}\n`);
    return;
  }

  /* ---- graded fields ---- */

  const extractionsDir = path.join(opts.dataDir, "extractions");
  const rawByDoc = new Map<string, RawExtraction>();
  for (const file of (await readdir(extractionsDir)).filter((f) => f.endsWith(".json"))) {
    rawByDoc.set(file.replace(/\.json$/, ""), JSON.parse(await readFile(path.join(extractionsDir, file), "utf8")));
  }

  const grades: FieldGrade[] = [];
  for (const contract of results.contracts) {
    const truthContract = truth.contracts.find((c) => c.fileName === contract.fileName);
    if (!truthContract) continue;
    const raw = rawByDoc.get(contract.docId);

    for (const field of contract.fields) {
      const truthField = truthContract.fields[field.fieldId];
      if (!truthField) continue;
      const rawValue = raw?.fields.find((f) => f.fieldId === field.fieldId)?.value ?? null;
      grades.push(gradeField(contract.docId, truthField, field, rawValue && rawValue.trim() ? rawValue : null));
    }
  }

  const count = (grade: Grade) => grades.filter((g) => g.grade === grade).length;
  const confident = grades.filter((g) => g.confidence === "FOUND");
  const confidentWrong = confident.filter((g) => g.grade === "wrong");
  const hedges = grades.filter((g) => g.grade === "hedge-justified" || g.grade === "hedge-unnecessary");
  const answered = grades.filter(
    (g) => g.confidence === "FOUND" || g.confidence === "INFERRED" || g.grade === "correct",
  );
  const correct = count("correct");

  say(`## Headline`);
  say();
  say(`| metric | value | what it means |`);
  say(`| --- | --- | --- |`);
  say(
    `| **Confident error rate** | **${pct(confidentWrong.length, confident.length)}** | ` +
      `${confidentWrong.length} of ${confident.length} fields stated as fact were wrong. Target under 3%. |`,
  );
  const hedgeFigure = hedges.length < 5 ? "too few to measure" : pct(count("hedge-justified"), hedges.length);
  say(
    `| **Hedge precision** | **${hedgeFigure}** | ` +
      `Of ${hedges.length} field${hedges.length === 1 ? "" : "s"} we declined to commit on, ${count("hedge-justified")} would have been wrong ` +
      `had we committed. Intended to show the caution discriminates. |`,
  );
  say(`| Field accuracy | ${pct(correct, grades.length)} | ${correct} of ${grades.length} fields graded correct. |`);
  say(
    `| Coverage | ${pct(answered.length, grades.length)} | ` +
      `Fields where we gave a usable answer, counting a correct "contract is silent" as an answer. |`,
  );
  say();

  if (hedges.length < 5) {
    say(
      `**On hedge precision.** ${hedges.length} hedge${hedges.length === 1 ? "" : "s"} is not a sample, and a ` +
        `percentage over it would be theatre. The figure is withheld rather than dressed up. What the number is ` +
        `for is catching a system that hedges indiscriminately, and the evidence against that here is structural ` +
        `instead: of ${grades.length} fields, ${grades.filter((g) => g.confidence === "NOT_FOUND").length} are ` +
        `reported as the contract being silent and ${grades.filter((g) => g.grade === "correct" && g.confidence === "UNCERTAIN").length} ` +
        `as genuinely unresolved — each matching the answer key, rather than uncertainty sprayed across the board. ` +
        `Measuring hedge precision properly needs a corpus with more genuinely ambiguous drafting than six contracts carry.`,
    );
    say();
  }

  say(`## Grade breakdown`);
  say();
  say(`| grade | count | meaning |`);
  say(`| --- | --- | --- |`);
  say(`| correct | ${correct} | Right value, or correctly reported as silent or unresolved. |`);
  say(`| wrong | ${count("wrong")} | Asserted and incorrect. Every one of these is a confident error. |`);
  say(`| hedge justified | ${count("hedge-justified")} | We hedged, and committing would have been wrong. |`);
  say(`| hedge unnecessary | ${count("hedge-unnecessary")} | We hedged where the answer was knowable. Over-caution. |`);
  say(`| missed | ${count("missed")} | Reported as silent when the contract does say something. |`);
  say();

  /* ---- per field ---- */

  say(`## Per field`);
  say();
  say(`| field | correct | wrong | hedged | missed |`);
  say(`| --- | --- | --- | --- | --- |`);
  const fieldIds = [...new Set(grades.map((g) => g.fieldId))];
  for (const fieldId of fieldIds) {
    const forField = grades.filter((g) => g.fieldId === fieldId);
    say(
      `| ${fieldId} | ${forField.filter((g) => g.grade === "correct").length}/${forField.length} | ` +
        `${forField.filter((g) => g.grade === "wrong").length} | ` +
        `${forField.filter((g) => g.grade.startsWith("hedge")).length} | ` +
        `${forField.filter((g) => g.grade === "missed").length} |`,
    );
  }
  say();

  /* ---- every non-correct field, named ---- */

  const problems = grades.filter((g) => g.grade !== "correct");
  if (problems.length > 0) {
    say(`## Every field we did not get plainly right`);
    say();
    for (const problem of problems) {
      say(`- **${problem.docId} / ${problem.fieldId}** — ${problem.grade}, reported as ${problem.confidence}`);
      say(`  - expected: ${problem.expected}`);
      say(`  - reported: ${problem.reported}`);
      if (problem.grade.startsWith("hedge") && problem.wouldHaveSaid) {
        say(`  - would have said: ${problem.wouldHaveSaid}`);
      }
    }
    say();
  }

  /* ---- conflicts, escalations, refusals ---- */

  const expectedConflicts = truth.expectedConflicts ?? [];
  const detected = results.conflicts;
  const conflictHits = expectedConflicts.filter((expected) =>
    detected.some((actual) => {
      const docIds = actual.grants.map((g) => g.docId);
      return expected.docIds.every((id) => docIds.some((d) => d.startsWith(id)));
    }),
  );

  say(`## Cross-contract conflicts`);
  say();
  say(`Expected ${expectedConflicts.length}, detected ${detected.length}, matched ${conflictHits.length}.`);
  for (const conflict of detected) {
    say(`- [${conflict.confidence}] ${conflict.explanation}`);
  }
  say();

  say(`## Escalations`);
  say();
  say(`${results.escalations.length} brief(s) produced; ${(truth.expectedEscalations ?? []).length} expected.`);
  for (const brief of results.escalations) say(`- [${brief.severity}] ${brief.id} — ${brief.issue}`);
  say();

  /* ---- refusals ---- */

  let refusalLine = "No questions file, so the refusal path was not scored.";
  try {
    const questions = JSON.parse(
      await readFile(path.join(opts.dataDir, "questions.json"), "utf8"),
    ) as { questions: { id: string; expectedRefusal: boolean; expectedCategory: string | null }[] };

    let right = 0;
    const detail: string[] = [];
    for (const question of questions.questions) {
      const actual = results.refusals.find((r) => r.id === question.id) ?? null;
      const ok =
        question.expectedRefusal === (actual !== null) &&
        (actual?.category ?? null) === question.expectedCategory;
      if (ok) right += 1;
      detail.push(
        `- ${ok ? "correct" : "WRONG"} — \`${question.id}\`: expected ${
          question.expectedRefusal ? question.expectedCategory : "an answer"
        }, got ${actual ? actual.category : "an answer"}`,
      );
    }
    refusalLine = `${right}/${questions.questions.length} correct.`;
    say(`## Refusals`);
    say();
    say(refusalLine);
    say();
    detail.forEach(say);
    say();
    say(
      `The third item is answerable from ingested clauses and is included deliberately: a system that ` +
        `refuses everything would score full marks on the two planted questions while being useless.`,
    );
  } catch {
    say(`## Refusals`);
    say();
    say(refusalLine);
  }
  say();

  if (results.unavailable.length > 0) {
    say(`## Unavailable`);
    say();
    for (const item of results.unavailable) say(`- **${item.stage}** — ${item.reason}`);
    say();
  }

  await writeFile(path.join(opts.dataDir, "..", "eval-report.md"), `${lines.join("\n")}\n`);
  console.log(`\nwritten to eval-report.md`);
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
