/**
 * Shared types for the AITHENA pipeline. No logic lives here.
 *
 * The load-bearing invariant of the whole system: every citation is a character
 * span into `ParsedDoc.fullText`. Page numbers, bounding boxes and OCR
 * confidence are all *derived* from that span. Nothing the model says about
 * where text lives is ever trusted.
 */

export type Confidence = "FOUND" | "INFERRED" | "UNCERTAIN" | "NOT_FOUND";
export type MatchKind = "exact" | "normalised" | "fuzzy";
export type EvidenceType = "explicit" | "derived" | "absent";
export type DocFormat = "pdf" | "docx";

/** Top-left origin, in PDF user-space points. */
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Word {
  text: string;
  /** Absolute offset into ParsedDoc.fullText. */
  charStart: number;
  charEnd: number;
  /** null for DOCX, which has no geometry. */
  bbox: BBox | null;
  /** 0-100, present only when the page was OCR'd. */
  ocrConfidence: number | null;
}

export interface Page {
  /** 1-based. Always 1 for DOCX, and never displayed when !paginated. */
  pageNum: number;
  charStart: number;
  charEnd: number;
  /** Points. 0 for DOCX. */
  width: number;
  height: number;
  ocr: boolean;
  words: Word[];
}

export interface ParsedDoc {
  docId: string;
  fileName: string;
  title: string;
  format: DocFormat;
  /** false for DOCX — a reflowable format has no fixed page numbers to cite. */
  paginated: boolean;
  ocrPages: number[];
  fullText: string;
  pages: Page[];
  /** DOCX only, from mammoth, so the evidence viewer has something to render. */
  html?: string;
}

export interface Citation {
  docId: string;
  docTitle: string;
  clauseId: string;
  /** null when the document is not paginated. */
  pageNum: number | null;
  charStart: number;
  charEnd: number;
  /** OUR text at the span — never the model's version of it. */
  quotedText: string;
  matchKind: MatchKind;
  bboxes: { pageNum: number; box: BBox }[];
  spansPages: boolean;
  ocrConfidenceMean: number | null;
  ocrConfidenceMin: number | null;
}

export interface FieldResult {
  fieldId: string;
  label: string;
  value: string | null;
  confidence: Confidence;
  /** Why this confidence. Rendered verbatim in the UI — never hidden. */
  reasons: string[];
  citations: Citation[];
  ambiguities: string[];
  evidenceType: EvidenceType;
  /** Quotes verify.ts rejected. Non-zero means the value was destroyed. */
  discardedQuoteCount: number;
}

export type PaymentFrequency =
  | "one-off"
  | "monthly"
  | "quarterly"
  | "annually"
  | "on-invoice";

export interface PaymentTerm {
  id: string;
  description: string;
  /** Integer minor units. Currency is stored separately, never in the amount. */
  amountMinor: number | null;
  currency: string | null;
  frequency: PaymentFrequency;
  firstDueDate: string | null;
  conditional: boolean;
  conditionNote: string | null;
  confidence: Confidence;
  reasons: string[];
  citations: Citation[];
  /** Quotes verify.ts rejected. Non-zero means the amount was destroyed. */
  discardedQuoteCount: number;
}

export type ExclusivityType = "exclusive" | "sole" | "non-exclusive";

export interface Grant {
  id: string;
  docId: string;
  docTitle: string;
  grantee: string;
  grantor: string;
  exclusivityType: ExclusivityType;
  territoryLabel: string;
  /** Short uppercase codes the model normalised to, e.g. ["SG"]. */
  territoryCodes: string[];
  productLabel: string;
  productCodes: string[];
  start: string | null;
  end: string | null;
  confidence: Confidence;
  reasons: string[];
  citations: Citation[];
  /** Quotes verify.ts rejected. Non-zero means the scope is unverified. */
  discardedQuoteCount: number;
  /** True when a citation could not be located, so the scope must not be relied on. */
  scopeUnverified: boolean;
}

export interface ContractResult {
  docId: string;
  title: string;
  fileName: string;
  format: DocFormat;
  paginated: boolean;
  ocrPages: number[];
  fields: FieldResult[];
  payments: PaymentTerm[];
  grants: Grant[];
}

export type CalendarEventKind =
  | "renewal-notice-deadline"
  | "term-end"
  | "payment"
  | "termination-window";

export interface CalendarEvent {
  id: string;
  docId: string;
  docTitle: string;
  kind: CalendarEventKind;
  title: string;
  eventDate: string | null;
  /** The date by which action must be taken. This is what the list sorts on. */
  actionDeadline: string | null;
  daysUntilDeadline: number | null;
  conditional: boolean;
  caveat: string | null;
  confidence: Confidence;
  reasons: string[];
  citations: Citation[];
}

export interface ExclusivityConflict {
  id: string;
  grants: [Grant, Grant];
  overlapTerritories: string[];
  overlapProducts: string[];
  overlapFrom: string | null;
  overlapTo: string | null;
  /** weakest() of the two grants. A conflict is never more certain than its inputs. */
  confidence: Confidence;
  reasons: string[];
  explanation: string;
}

export interface EscalationBrief {
  id: string;
  severity: "high" | "medium";
  issue: string;
  documents: Citation[];
  /** Only claims whose citation verified may appear here. */
  established: { statement: string; citation: Citation }[];
  unresolved: string[];
  question: string;
  exposure: string;
}

export type RefusalCategory =
  | "legal-advice"
  | "outcome-prediction"
  | "outside-corpus"
  | "document-not-ingested";

export interface RefusedQuestion {
  id: string;
  question: string;
  category: RefusalCategory;
  reason: string;
  nextStep: string;
}

export interface Results {
  generatedAt: string;
  asOf: string;
  model: string;
  windowDays: number;
  contracts: ContractResult[];
  calendar: CalendarEvent[];
  conflicts: ExclusivityConflict[];
  escalations: EscalationBrief[];
  refusals: RefusedQuestion[];
  /** Anything that could not be produced, and why. Never a silent stub. */
  unavailable: { stage: string; reason: string }[];
}

export interface StageOpts {
  corpusDir: string;
  dataDir: string;
  asOf: Date;
  windowDays: number;
}

/** The ten scalar fields we extract per contract. Order is display order. */
export const FIELD_IDS = [
  "parties",
  "commencementDate",
  "termLength",
  "termEnd",
  "renewalType",
  "renewalNoticeDays",
  "terminationForConvenience",
  "terminationForCause",
  "liabilityCap",
  "exclusivity",
] as const;

export type FieldId = (typeof FIELD_IDS)[number];

export const FIELD_LABELS: Record<FieldId, string> = {
  parties: "Parties",
  commencementDate: "Commencement date",
  termLength: "Term length",
  termEnd: "Term end",
  renewalType: "Renewal mechanics",
  renewalNoticeDays: "Notice period to prevent renewal",
  terminationForConvenience: "Termination for convenience",
  terminationForCause: "Termination for cause",
  liabilityCap: "Liability cap",
  exclusivity: "Exclusivity / restrictive covenants",
};
