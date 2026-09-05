/**
 * Deciding what not to answer.
 *
 * A refusal here is a specific, reasoned decision with a next step, not a
 * disclaimer. And it has to discriminate: a system that refuses everything is
 * useless in exactly the same way as one that answers everything, so the
 * classifier returns null for questions it can properly answer from ingested
 * clauses, and eval.ts scores a false refusal as an error.
 *
 * Deterministic rules rather than a model call. What counts as beyond our
 * remit is a policy decision, and policy should not be resampled per run.
 */

import type { RefusedQuestion } from "./types.ts";

export interface CorpusKnowledge {
  /** Titles of documents we actually ingested. */
  titles: string[];
  /** Party and entity names appearing in them, so "the Northwind contract" resolves. */
  entities: string[];
}

/** Asking us to recommend a course of action, or to rule on legal consequence. */
const ADVICE = [
  /\bshould (we|i|they)\b/i,
  /\bcan (we|i) (safely|legally)\b/i,
  /\b(is|are) (it|we|they|this) (enforceable|valid|binding|liable)\b/i,
  /\bwould we be liable\b/i,
  /\bare we (in breach|liable|entitled)\b/i,
  /\badvise (us|me)\b/i,
  /\bwhat are our (legal )?(rights|options|remedies)\b/i,
  /\bdo we have (a case|grounds)\b/i,
];

/** Asking us to predict what a court, regulator or counterparty will do. */
const PREDICTION = [
  /\bwill (we|i|they) (win|lose|succeed)\b/i,
  /\blikely outcome\b/i,
  /\bwould a court\b/i,
  /\bchances? of\b/i,
  /\bwhat will happen if\b/i,
  /\bhow much (would|will) we (get|recover|owe)\b/i,
];

/**
 * Nouns that name a document, used to spot references to things we never read.
 *
 * The qualifier is capped at three words. An unbounded one runs back to the
 * start of the sentence, and could sweep in a word that happens to appear in the
 * corpus — which would make us treat an unknown document as known and answer a
 * question we have no business answering.
 */
const DOCUMENT_NOUN =
  /(?:\b([a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,2})\s+)?\b(agreement|contract|nda|lease|policy|deed|licence|license|memorandum|engagement letter|terms)\b/gi;

const STOPWORDS = new Set([
  "the", "our", "your", "their", "this", "that", "a", "an", "any", "with", "for", "of", "and",
  "about", "under", "in", "on", "to", "from", "we", "us", "signed", "current", "new", "old",
  // Interrogatives and auxiliaries, which sit in front of the document name and
  // are not part of it.
  "what", "does", "did", "say", "says", "tell", "know", "there", "have", "has", "which", "where",
  "when", "whose", "look", "read", "check", "find", "show",
]);

function significantWords(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 3 && !STOPWORDS.has(word));
}

/**
 * Does this question lean on a document we never ingested?
 *
 * Answering "what does our employment agreement say" from general knowledge of
 * what employment agreements usually say would be an un-anchored legal claim —
 * the single most damaging thing this system could do — so a document reference
 * we cannot match to an ingested file is a refusal, not a best effort.
 */
function unknownDocument(question: string, knowledge: CorpusKnowledge): string | null {
  const haystack = [...knowledge.titles, ...knowledge.entities].join(" ").toLowerCase();

  for (const match of question.matchAll(DOCUMENT_NOUN)) {
    const qualifier = match[1];
    const noun = match[2];
    if (!qualifier) continue;

    const words = significantWords(qualifier);
    if (words.length === 0) continue;

    // If nothing in the qualifier appears anywhere in the corpus, the question
    // is about a document we have not read. Name it with the words that
    // actually identify it, not the whole phrase leading up to it.
    if (!words.some((word) => haystack.includes(word))) {
      return `${words.slice(-2).join(" ")} ${noun.toLowerCase()}`;
    }
  }

  return null;
}

export function classifyRefusal(
  id: string,
  question: string,
  knowledge: CorpusKnowledge,
): RefusedQuestion | null {
  const missing = unknownDocument(question, knowledge);
  if (missing) {
    return {
      id,
      question,
      category: "document-not-ingested",
      reason: `This asks about the ${missing}, which is not among the documents provided. CLARA only reports what is written in the contracts it has read, and it has not read that one — anything it said about the contents would be a guess about what such documents usually contain.`,
      nextStep: `Add the ${missing} to the folder and run the analysis again, or confirm which of the loaded documents you meant.`,
    };
  }

  if (ADVICE.some((pattern) => pattern.test(question))) {
    return {
      id,
      question,
      category: "legal-advice",
      reason:
        "This asks for a recommendation and a conclusion about legal consequence. CLARA reports what the contracts say and by when you must act; whether you should take that action, and what you would be liable for if you did, is legal advice and depends on facts outside these documents.",
      nextStep:
        "Take the relevant clauses and their deadlines to a qualified adviser. The escalation brief for this contract is written to be handed over directly.",
    };
  }

  if (PREDICTION.some((pattern) => pattern.test(question))) {
    return {
      id,
      question,
      category: "outcome-prediction",
      reason:
        "This asks how a dispute would be decided. Nothing in these documents determines that, and CLARA makes no claim it cannot anchor to a clause it has read.",
      nextStep:
        "CLARA can set out what each contract requires and by when. Assessing how that would play out needs a qualified adviser.",
    };
  }

  // Answerable from ingested clauses. Refusing here would be blanket caution.
  return null;
}
