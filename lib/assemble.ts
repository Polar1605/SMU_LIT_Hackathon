/**
 * Turns a ParsedDoc + a RawExtraction into a ContractResult, and a set of
 * ContractResults into the calendar, conflicts and escalations that sit on top
 * of them. This is R1 enforced: every quote goes through verify.ts, and if any
 * quote behind a claim cannot be located, the value is destroyed — set to null,
 * marked UNCERTAIN, reason given — rather than shown with a caveat next to a
 * quote that might be invented.
 *
 * This module exists so the browser upload path and the offline CLI pipeline
 * are the same code, not two implementations that can quietly drift apart. It
 * imports nothing Node-only — no fs, no path, nothing that only exists on a
 * server — specifically so it can be bundled into client JavaScript and run in
 * a visitor's browser exactly as it runs in `compute.ts`. `scripts/compute.ts`
 * is the thin Node wrapper: it reads files, calls what is here, and writes the
 * result to disk. The upload flow calls the same functions after fetching a
 * ParsedDoc and a RawExtraction from two API routes instead.
 */

import { computeConfidence, hasCandidateClause } from "./confidence.ts";
import { buildCalendar } from "./deadlines.ts";
import { detectExclusivityConflicts } from "./conflicts.ts";
import { buildEscalations } from "./escalate.ts";
import { classifyRefusal, type CorpusKnowledge } from "./refusal.ts";
import { verifyQuote } from "./verify.ts";
import type { RawExtraction, RawQuote } from "./schema.ts";
import {
  FIELD_IDS,
  FIELD_LABELS,
  type Citation,
  type ContractResult,
  type FieldId,
  type FieldResult,
  type Grant,
  type MatchKind,
  type ParsedDoc,
  type PaymentTerm,
  type RefusedQuestion,
} from "./types.ts";

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
      discardedQuoteCount: outcome.discardedCount,
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
      discardedQuoteCount: outcome.discardedCount,
      // R1 applies to grants too. A grant whose supporting quote could not be
      // located has an unverified scope, and conflict detection must not treat
      // its territory and product codes as established fact.
      scopeUnverified: outcome.discardedCount > 0,
    };
  });
}

/** One document's ParsedDoc + RawExtraction, turned into its ContractResult. */
export function assembleContract(doc: ParsedDoc, extraction: RawExtraction): ContractResult {
  return {
    docId: doc.docId,
    title: doc.title,
    fileName: doc.fileName,
    format: doc.format,
    paginated: doc.paginated,
    ocrPages: doc.ocrPages,
    fields: buildFields(extraction, doc),
    payments: buildPayments(extraction, doc),
    grants: buildGrants(extraction, doc),
  };
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

export interface AssembleResultsParams {
  contracts: ContractResult[];
  asOf: Date;
  windowDays: number;
  model: string;
  /** Optional: a portfolio arriving without a fixed question list simply gets no refusal examples. */
  questions?: { id: string; question: string }[];
}

export interface AssembledPortfolio {
  asOf: string;
  model: string;
  windowDays: number;
  contracts: ContractResult[];
  calendar: ReturnType<typeof buildCalendar>;
  conflicts: ReturnType<typeof detectExclusivityConflicts>;
  escalations: ReturnType<typeof buildEscalations>;
  refusals: RefusedQuestion[];
}

/**
 * Everything above a single contract: the calendar, cross-contract conflicts,
 * escalation briefs, and refusal classification for a fixed question list.
 * Returns everything `Results` needs except `generatedAt` and `unavailable`,
 * which are the caller's own bookkeeping — a Node script's reasons for a
 * skipped step differ from a browser upload's, so each assembles that list
 * itself around this shared core.
 */
export function assembleResults(params: AssembleResultsParams): AssembledPortfolio {
  const { contracts, asOf, windowDays, model, questions } = params;

  const calendar = buildCalendar(contracts, asOf, windowDays);
  const conflicts = detectExclusivityConflicts(contracts);
  const escalations = buildEscalations(contracts, conflicts);

  const refusals: RefusedQuestion[] = [];
  if (questions && questions.length > 0) {
    const knowledge: CorpusKnowledge = {
      titles: contracts.map((c) => c.title),
      entities: entityNames(contracts),
    };
    for (const item of questions) {
      const verdict = classifyRefusal(item.id, item.question, knowledge);
      if (verdict) refusals.push(verdict);
    }
  }

  return {
    asOf: asOf.toISOString().slice(0, 10),
    model,
    windowDays,
    contracts,
    calendar,
    conflicts,
    escalations,
    refusals,
  };
}
