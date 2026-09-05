/**
 * Confidence is computed here, in code, from what verification actually found.
 *
 * The model is never asked how confident it is. It reports what the document
 * says and what it could not resolve; this module decides what we are entitled
 * to claim on that basis. That separation is the whole calibration argument: a
 * model's stated confidence is a guess about itself, whereas "this quote matched
 * exactly, on a clean page, with no unresolved carve-out" is a fact about
 * evidence.
 *
 * The distinction that earns the most credit is NOT_FOUND versus UNCERTAIN.
 * "The contract is silent" and "we could not read it" are completely different
 * statements to a user deciding whether to call a lawyer, and collapsing them
 * into one hedge is the failure this system exists to avoid.
 */

import type { Confidence, EvidenceType, MatchKind } from "./types.ts";
import { OCR_MEAN_FLOOR, OCR_MIN_FLOOR } from "./verify.ts";

export interface ConfidenceInput {
  evidenceType: EvidenceType;
  /** One per surviving quote. Empty when everything was discarded. */
  matchKinds: MatchKind[];
  /** True when verify.ts rejected any quote for this field. */
  anyQuoteDiscarded: boolean;
  ambiguities: string[];
  ocrMean: number | null;
  ocrMin: number | null;
  /** Whether our own keyword probe finds a plausibly relevant clause. */
  hasCandidateClause: boolean;
  /** A money field that could not be reduced to one figure. */
  unresolvedAmount?: boolean;
}

export interface ConfidenceVerdict {
  level: Confidence;
  /** Rendered verbatim in the UI. Written to be read by a non-lawyer. */
  reasons: string[];
}

const RANK: Record<Confidence, number> = {
  NOT_FOUND: 0,
  UNCERTAIN: 1,
  INFERRED: 2,
  FOUND: 3,
};

/** The weakest link in a chain of inputs. Uncertainty propagates; it never launders. */
export function weakest(levels: Confidence[]): Confidence {
  if (levels.length === 0) return "NOT_FOUND";
  return levels.reduce((worst, level) => (RANK[level] < RANK[worst] ? level : worst));
}

function downgrade(level: Confidence): Confidence {
  if (level === "FOUND") return "INFERRED";
  if (level === "INFERRED") return "UNCERTAIN";
  return level;
}

export function computeConfidence(input: ConfidenceInput): ConfidenceVerdict {
  // 1. A citation we could not locate destroys the answer. It is never shown
  //    with a caveat, because the quote itself may be invented.
  if (input.anyQuoteDiscarded) {
    return {
      level: "UNCERTAIN",
      reasons: [
        "A supporting quote could not be located in the source document, so the extracted value was discarded rather than shown to you.",
      ],
    };
  }

  // 2. No citation at all, for a field that claims to have found something.
  if (input.evidenceType !== "absent" && input.matchKinds.length === 0) {
    return {
      level: "UNCERTAIN",
      reasons: ["No supporting clause was cited, and we do not display a value without one."],
    };
  }

  // 3. Silence, and whether we believe it.
  if (input.evidenceType === "absent") {
    return input.hasCandidateClause
      ? {
          level: "UNCERTAIN",
          reasons: [
            "No provision of this kind was identified, but the document does contain related wording that we could not resolve. Treat this as unread rather than absent.",
          ],
        }
      : {
          level: "NOT_FOUND",
          reasons: ["No provision of this kind was identified anywhere in this document."],
        };
  }

  const reasons: string[] = [];

  // 4. The document says something but does not settle it.
  if (input.ambiguities.length > 0) {
    return { level: "UNCERTAIN", reasons: [...input.ambiguities] };
  }

  // 5. Read off a degraded scan. A poor span cannot support a confident claim.
  if (input.ocrMean !== null && input.ocrMean < OCR_MEAN_FLOOR) {
    return {
      level: "UNCERTAIN",
      reasons: [
        `This clause was read from a scanned page and character recognition was unreliable across it (mean confidence ${input.ocrMean.toFixed(0)} out of 100). Check the original document.`,
      ],
    };
  }
  if (input.ocrMin !== null && input.ocrMin < OCR_MIN_FLOOR) {
    return {
      level: "UNCERTAIN",
      reasons: [
        `At least one word in this clause was poorly recognised on the scan (confidence ${input.ocrMin.toFixed(0)} out of 100), and it may be one that carries the meaning. Check the original document.`,
      ],
    };
  }

  // 6. A cap that will not reduce to a single figure.
  if (input.unresolvedAmount) {
    return {
      level: "UNCERTAIN",
      reasons: ["The document does not reduce this to a single figure."],
    };
  }

  let level: Confidence = input.evidenceType === "derived" ? "INFERRED" : "FOUND";
  if (level === "INFERRED") {
    reasons.push("Not stated outright in the contract; calculated from other terms that are.");
  }

  // 7. Fuzzy citations cost a level. If nothing matched better than fuzzy, we
  //    are relying entirely on approximate text and should say so.
  const fuzzyCount = input.matchKinds.filter((k) => k === "fuzzy").length;
  if (fuzzyCount > 0 && fuzzyCount === input.matchKinds.length) {
    return {
      level: "UNCERTAIN",
      reasons: [
        ...reasons,
        "Every supporting quote matched the source only approximately, so the wording we relied on may not be exactly what the contract says.",
      ],
    };
  }
  if (fuzzyCount > 0) {
    level = downgrade(level);
    reasons.push(
      "One supporting quote matched the source only approximately, so this is reported one level less confidently.",
    );
  }

  if (level === "FOUND") {
    reasons.push("Stated explicitly in the contract, and every supporting quote was located in the source.");
  }

  return { level, reasons };
}

/* ------------------------------------------------------------------ */
/* Candidate-clause probes                                             */
/* ------------------------------------------------------------------ */

/**
 * Our own check on the model's claim of silence, run over our own text.
 *
 * If the model says a document has no exclusivity provision and the document
 * never uses a word suggesting one, that is silence and we say NOT_FOUND. If
 * the words are there and the model still found nothing, we may have missed
 * something, and UNCERTAIN is the honest answer.
 *
 * The exclusivity probe has to survive false friends. "Exclusive of GST" is
 * about tax and "exclusive jurisdiction" is about which court hears a dispute;
 * both appear in contracts with no exclusivity provision whatsoever, and a
 * probe that trips on them would turn every genuine silence into a hedge.
 */
const FALSE_FRIENDS = /\bexclusive\s+(of|jurisdiction)\b/gi;

/**
 * A probe is a list of alternatives, ALL of which must find a match.
 *
 * A single loose alternative is worse than no probe at all. "This Agreement
 * shall not renew automatically" contains the word "renew", but there is no
 * notice period to find because nothing renews — a probe that fires on the bare
 * word turns a correct NOT_FOUND into a hedge, and a system that hedges on
 * every document mentioning renewal is not discriminating, it is just anxious.
 * So a candidate for a notice period requires renewal wording AND notice
 * wording; a candidate for termination-for-cause requires termination wording
 * AND a trigger for it.
 */
type Probe = RegExp[][];

const PROBES: Record<string, Probe> = {
  exclusivity: [
    [
      /\bexclusiv/i,
      /\bsole\s+(distributor|agent|supplier|reseller|licensee)/i,
      /restrictive covenant/i,
      /non-?compet/i,
      /shall not.{0,60}\bappoint any other\b/i,
    ],
  ],
  liabilityCap: [[/limitation of liability/i, /shall not.{0,20}exceed/i, /aggregate liability/i, /\bliability\b.{0,40}\bcap/i]],
  renewalType: [[/\brenew/i, /successive periods/i]],
  renewalNoticeDays: [
    [/\brenew/i, /successive periods/i],
    [/\bnotice\b/i],
  ],
  terminationForConvenience: [[/terminat/i], [/convenience/i, /without cause/i, /\bnotice\b/i]],
  terminationForCause: [[/terminat/i], [/material breach/i, /insolven/i, /\bdefault\b/i, /\bbreach\b/i]],
  commencementDate: [[/commenc/i, /takes effect/i, /effective date/i]],
  termLength: [[/\bterm\b/i, /period of/i]],
  termEnd: [[/\bterm\b/i, /expir/i]],
  parties: [[/\bbetween\b/i]],
};

/**
 * How close two concepts must sit to count as the same clause. A document that
 * says "shall not renew automatically" in clause 2.2 and "written notice" in
 * clause 14.1 has not got a notice-to-prevent-renewal provision; it has two
 * unrelated clauses that happen to share a document.
 */
const PROXIMITY = 400;

function matchPositions(pattern: RegExp, text: string): number[] {
  const global = new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`);
  return [...text.matchAll(global)].map((m) => m.index);
}

export function hasCandidateClause(fieldId: string, fullText: string): boolean {
  const probe = PROBES[fieldId];
  if (!probe) return false;

  const cleaned = fieldId === "exclusivity" ? fullText.replace(FALSE_FRIENDS, " ") : fullText;
  const [anchorGroup, ...rest] = probe;

  const anchors = anchorGroup.flatMap((pattern) => matchPositions(pattern, cleaned));
  if (anchors.length === 0) return false;
  if (rest.length === 0) return true;

  // Every remaining concept must appear near at least one anchor.
  return anchors.some((anchor) => {
    const window = cleaned.slice(Math.max(0, anchor - PROXIMITY), anchor + PROXIMITY);
    return rest.every((alternatives) => alternatives.some((pattern) => pattern.test(window)));
  });
}
