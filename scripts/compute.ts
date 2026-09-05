/**
 * Turns extractions into results.json — the only file the app reads.
 *
 * This is where R1 is enforced. Every quote goes through verify.ts, and if ANY
 * quote supporting a field cannot be located, the extracted value is destroyed:
 * set to null, marked UNCERTAIN, and the reason shown to the user. It is not
 * displayed with a caveat, because a quote we could not find may be invented,
 * and a fabricated quote shown alongside a hedge is still a fabricated quote on
 * screen.
 *
 *   npm run compute
 *   npm run compute -- --corpus ./some-folder --as-of 2026-10-01
 */

import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import path from "node:path";

import { computeConfidence, hasCandidateClause } from "../lib/confidence.ts";
import { buildCalendar } from "../lib/deadlines.ts";
import { detectExclusivityConflicts } from "../lib/conflicts.ts";
import { buildEscalations } from "../lib/escalate.ts";
import { classifyRefusal, type CorpusKnowledge } from "../lib/refusal.ts";
import { publishViewerAssets } from "./publish-assets.ts";
import { verifyQuote } from "../lib/verify.ts";
import type { RawExtraction, RawQuote } from "../lib/schema.ts";
import {
  FIELD_IDS,
  FIELD_LABELS,
  type Citation,
  type ContractResult,
  type FieldResult,
  type Grant,
  type MatchKind,
  type ParsedDoc,
  type PaymentTerm,
  type RefusedQuestion,
  type Results,
  type StageOpts,
  type FieldId,
} from "../lib/types.ts";

interface VerificationOutcome {
  citations: Citation[];
  matchKinds: MatchKind[];
  discardedCount: number;
  ocrMean: number | null;
  ocrMin: number | null;
}

/**
 * Verifies every quote behind one claim.
 *
 * OCR confidence is aggregated across all supporting spans: the mean is
 * length-weighted so a long clean quote is not dragged down by a short one,
 * while the minimum is kept unweighted because a single badly-recognised word
 * can be the one carrying the figure.
 */
function verifyAll(quotes: RawQuote[], doc: ParsedDoc): VerificationOutcome {
  const citations: Citation[] = [];
  const matchKinds: MatchKind[] = [];
  let discardedCount = 0;
  let ocrWeighted = 0;
  let ocrWeight = 0;
  let ocrMin: number | null = null;

  for (const quote of quotes) {
    const result = verifyQuote(quote.text, doc);
    if (!result) {
      discardedCount += 1;
      continue;
    }

    matchKinds.push(result.matchKind);
    citations.push({
      docId: doc.docId,
      docTitle: doc.title,
      clauseId: quote.clauseId,
      pageNum: result.pageNum,
      charStart: result.charStart,
      charEnd: result.charEnd,
      quotedText: result.quotedText,
      matchKind: result.matchKind,
      bboxes: result.bboxes,
      spansPages: result.spansPages,
      ocrConfidenceMean: result.ocrConfidenceMean,
      ocrConfidenceMin: result.ocrConfidenceMin,
    });

    if (result.ocrConfidenceMean !== null) {
      const span = result.charEnd - result.charStart;
      ocrWeighted += result.ocrConfidenceMean * span;
      ocrWeight += span;
    }
    if (result.ocrConfidenceMin !== null) {
      ocrMin = ocrMin === null ? result.ocrConfidenceMin : Math.min(ocrMin, result.ocrConfidenceMin);
    }
  }

  return {
    citations,
    matchKinds,
    discardedCount,
    ocrMean: ocrWeight > 0 ? ocrWeighted / ocrWeight : null,
    ocrMin,
  };
}

/**
 * The OCR minimum that should gate a field, scoped to the words the ANSWER
 * depends on rather than every word in the quoted sentence.
 *
 * A quote is usually a whole clause; the value is a few words inside it. When
 * the scan mangles "PTE" in a party's address but reads "S$75,000" perfectly,
 * the figure is not in doubt and hedging on it is noise. So the gate looks at
 * the recognition confidence of the words that actually carry the value, and
 * falls back to the whole span when the value shares no token with it.
 */
function ocrMinForValue(value: string, citations: Citation[], doc: ParsedDoc): number | null {
  const valueTokens = new Set(
    value.toLowerCase().split(/[^a-z0-9$.,]+/).filter((t) => t.length > 1),
  );
  // Figures matter more than words and are matched separately, by their digits.
  // Matching a figure by exact token would be self-defeating: when the scan
  // garbles "S$75,000" into "S$$75,000.", the strings stop matching, and the one
  // word optical recognition struggled with would be the single word excluded
  // from the check that exists to catch it. Digits survive that damage.
  const valueFigures = new Set((value.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((f) => f.replace(/,/g, "")));

  if (valueTokens.size === 0 && valueFigures.size === 0) return null;

  let min: number | null = null;
  let matched = false;

  for (const citation of citations) {
    for (const page of doc.pages) {
      for (const word of page.words) {
        if (word.ocrConfidence === null) continue;
        if (word.charEnd <= citation.charStart || word.charStart >= citation.charEnd) continue;

        const normalised = word.text.toLowerCase().replace(/^[^a-z0-9$]+|[^a-z0-9$.,]+$/g, "");
        const digits = (word.text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((f) => f.replace(/,/g, ""));

        const carriesValue =
          valueTokens.has(normalised) || digits.some((figure) => valueFigures.has(figure));
        if (!carriesValue) continue;

        matched = true;
        min = min === null ? word.ocrConfidence : Math.min(min, word.ocrConfidence);
      }
    }
  }

  return matched ? min : null;
}

/** A money field that never resolves to a figure cannot be reported as one. */
function looksUnresolved(fieldId: string, value: string): boolean {
  return fieldId === "liabilityCap" && value.trim() !== "" && !/\d/.test(value);
}

function buildFields(extraction: RawExtraction, doc: ParsedDoc): FieldResult[] {
  return FIELD_IDS.map((fieldId): FieldResult => {
    const raw = extraction.fields.find((f) => f.fieldId === fieldId);

    if (!raw) {
      // The schema requires every field, so this means the model omitted one.
      // Say so rather than rendering a blank the user would read as "nothing here".
      return {
        fieldId,
        label: FIELD_LABELS[fieldId as FieldId],
        value: null,
        confidence: "UNCERTAIN",
        reasons: ["This field was not returned by the extraction step, so it has not been assessed."],
        citations: [],
        ambiguities: [],
        evidenceType: "absent",
        discardedQuoteCount: 0,
      };
    }

    const outcome = verifyAll(raw.quotes, doc);
    // Gate on the words carrying the answer, not every word in the sentence.
    const valueScopedMin = ocrMinForValue(raw.value, outcome.citations, doc);
    const verdict = computeConfidence({
      evidenceType: raw.evidenceType,
      matchKinds: outcome.matchKinds,
      anyQuoteDiscarded: outcome.discardedCount > 0,
      ambiguities: raw.ambiguities,
      ocrMean: outcome.ocrMean,
      ocrMin: valueScopedMin ?? outcome.ocrMin,
      hasCandidateClause: hasCandidateClause(fieldId, doc.fullText),
      unresolvedAmount: looksUnresolved(fieldId, raw.value),
    });

    // R1: an unverifiable citation destroys the value outright.
    const destroyed = outcome.discardedCount > 0;
    const value = destroyed || raw.evidenceType === "absent" || raw.value.trim() === "" ? null : raw.value;

    return {
      fieldId,
      label: FIELD_LABELS[fieldId as FieldId],
      value,
      confidence: verdict.level,
      reasons: verdict.reasons,
      citations: outcome.citations,
      ambiguities: raw.ambiguities,
      evidenceType: raw.evidenceType,
      discardedQuoteCount: outcome.discardedCount,
    };
  });
}

function buildPayments(extraction: RawExtraction, doc: ParsedDoc): PaymentTerm[] {
  return extraction.payments.map((raw, index): PaymentTerm => {
    const outcome = verifyAll(raw.quotes, doc);
    const verdict = computeConfidence({
      evidenceType: "explicit",
      matchKinds: outcome.matchKinds,
      anyQuoteDiscarded: outcome.discardedCount > 0,
      // A payment whose due date the contract never fixes is uncertain by
      // nature, not by our failure — record that as its own reason.
      ambiguities: raw.conditional
        ? [raw.conditionNote ?? "The contract does not fix a due date for this obligation.", ...raw.ambiguities]
        : raw.ambiguities,
      ocrMean: outcome.ocrMean,
      ocrMin: outcome.ocrMin,
      hasCandidateClause: true,
    });

    const destroyed = outcome.discardedCount > 0;
    return {
      id: `${doc.docId}-payment-${index}`,
      description: raw.description,
      amountMinor: destroyed ? null : raw.amountMinor,
      currency: destroyed ? null : raw.currency,
      frequency: raw.frequency,
      firstDueDate: destroyed ? null : raw.firstDueDate,
      conditional: raw.conditional,
      conditionNote: raw.conditionNote,
      confidence: verdict.level,
      reasons: verdict.reasons,
      citations: outcome.citations,
    };
  });
}

function buildGrants(extraction: RawExtraction, doc: ParsedDoc): Grant[] {
  return extraction.grants.map((raw, index): Grant => {
    const outcome = verifyAll(raw.quotes, doc);
    const verdict = computeConfidence({
      evidenceType: "explicit",
      matchKinds: outcome.matchKinds,
      anyQuoteDiscarded: outcome.discardedCount > 0,
      ambiguities: raw.ambiguities,
      ocrMean: outcome.ocrMean,
      ocrMin: outcome.ocrMin,
      hasCandidateClause: true,
    });

    return {
      id: `${doc.docId}-grant-${index}`,
      docId: doc.docId,
      docTitle: doc.title,
      grantee: raw.grantee,
      grantor: raw.grantor,
      exclusivityType: raw.exclusivityType,
      territoryLabel: raw.territoryLabel,
      territoryCodes: raw.territoryCodes.map((c) => c.trim().toUpperCase()).filter(Boolean),
      productLabel: raw.productLabel,
      productCodes: raw.productCodes.map((c) => c.trim().toUpperCase()).filter(Boolean),
      start: raw.start,
      end: raw.end,
      confidence: verdict.level,
      reasons: verdict.reasons,
      citations: outcome.citations,
    };
  });
}

/** Party names, so a question naming a counterparty resolves to a document we read. */
function entityNames(contracts: ContractResult[]): string[] {
  const names = new Set<string>();
  for (const contract of contracts) {
    const parties = contract.fields.find((f) => f.fieldId === "parties")?.value;
    if (!parties) continue;
    for (const part of parties.split(/,| and |\(|\)/)) {
      const trimmed = part.trim();
      if (trimmed.length > 3) names.add(trimmed);
    }
  }
  return [...names];
}

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

    contracts.push({
      docId: doc.docId,
      title: doc.title,
      fileName: doc.fileName,
      format: doc.format,
      paginated: doc.paginated,
      ocrPages: doc.ocrPages,
      fields: buildFields(extraction, doc),
      payments: buildPayments(extraction, doc),
      grants: buildGrants(extraction, doc),
    });
  }

  const calendar = buildCalendar(contracts, opts.asOf, opts.windowDays);
  const conflicts = detectExclusivityConflicts(contracts);
  const escalations = buildEscalations(contracts, conflicts);

  // Questions are optional: a judge's folder need not carry any.
  const refusals: RefusedQuestion[] = [];
  try {
    const questionsFile = JSON.parse(
      await readFile(path.join(opts.dataDir, "questions.json"), "utf8"),
    ) as { questions: { id: string; question: string }[] };
    const knowledge: CorpusKnowledge = {
      titles: contracts.map((c) => c.title),
      entities: entityNames(contracts),
    };
    for (const item of questionsFile.questions) {
      const verdict = classifyRefusal(item.id, item.question, knowledge);
      if (verdict) refusals.push(verdict);
    }
  } catch {
    unavailable.push({ stage: "refusals", reason: "No data/questions.json, so no refusal examples are shown." });
  }

  const published = await publishViewerAssets(opts.corpusDir, opts.dataDir);
  unavailable.push(...published.unavailable);

  const results: Results = {
    generatedAt: new Date().toISOString(),
    asOf: opts.asOf.toISOString().slice(0, 10),
    model: process.env.AITHENA_MODEL ?? "gpt-5.5-2026-04-23",
    windowDays: opts.windowDays,
    contracts,
    calendar,
    conflicts,
    escalations,
    refusals,
    unavailable,
  };

  await writeFile(path.join(opts.dataDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);

  const counts = contracts.flatMap((c) => c.fields).reduce<Record<string, number>>((acc, f) => {
    acc[f.confidence] = (acc[f.confidence] ?? 0) + 1;
    return acc;
  }, {});
  const discarded = contracts.flatMap((c) => c.fields).reduce((n, f) => n + f.discardedQuoteCount, 0);

  console.log(
    `${contracts.length} contracts  ` +
      `FOUND ${counts.FOUND ?? 0}  INFERRED ${counts.INFERRED ?? 0}  ` +
      `UNCERTAIN ${counts.UNCERTAIN ?? 0}  NOT_FOUND ${counts.NOT_FOUND ?? 0}`,
  );
  console.log(
    `${calendar.length} calendar events, ${conflicts.length} conflict(s), ` +
      `${escalations.length} escalation(s), ${refusals.length} refusal(s), ${discarded} quote(s) discarded`,
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
