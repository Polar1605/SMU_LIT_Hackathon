# CLARA MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single-page dashboard that reads a folder of signed contracts and reports obligations, a 90-day action calendar, and cross-contract exclusivity conflicts, where every displayed field is anchored to a text span we re-located ourselves and carries a confidence level computed in code.

**Architecture:** Five offline CLI stages (`make-corpus → ingest → extract → compute → eval`) write JSON to `data/`; the Next.js app is a pure reader of `data/results.json` and never calls an API. The load-bearing invariant is that every citation is a character span into `ParsedDoc.fullText`, from which page number, bounding boxes and OCR confidence are all derived — the model's own page claims are discarded. Confidence is a pure function of verification outcome, never a model output.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind 4, shadcn/ui, `pdfjs-dist`, `pdf-lib`, `mammoth`, `tesseract.js`, `@napi-rs/canvas`, `date-fns`, `openai`, `vitest`, `tsx`.

**Spec:** `SPEC.md` (committed at `2d96fd9`, including the "Decisions taken before build" section)

## Global Constraints

- **Prime directive:** never more confident than the evidence. A wrong `FOUND` costs more than an honest `UNCERTAIN`.
- **R1** — no quote reaches the UI unless `verify.ts` located it in our own extracted text.
- **R2** — no claim renders without a citation.
- **R3** — `UNCERTAIN` and `NOT_FOUND` render as full rows stating why, never as blanks.
- Model: `gpt-5.5-2026-04-23`, `reasoning.effort: "high"`, env-overridable via `CLARA_MODEL`. **No `temperature` parameter** — the model returns HTTP 400 for it.
- Determinism from disk cache keyed `sha256(prompt + model + schemaJson)`, written on the first call.
- Money as integer minor units; currency stored separately as an ISO code.
- Page numbers derived from matched span offsets only. Never from the model.
- No legal claim beyond an ingested document. No statutes, market norms, or enforceability views.
- No silent stubs. Unimplemented paths `throw`; the UI renders "unavailable" rather than a plausible blank.
- Tests cover quote verification, confidence, date math, and overlap logic only. Fixtures, never live API calls.
- No chatbot, no auth, no database, no upload UI, no embeddings, no business-day arithmetic, no second conflict class, no risk scoring.

---

## File Structure

```
SPEC.md
package.json  tsconfig.json  next.config.ts  vitest.config.ts  .env.local(gitignored)
lib/
  types.ts          all shared types; no logic
  normalise.ts      normalisation + offset map (consumed by verify)
  verify.ts         quote → VerifiedSpan | null
  confidence.ts     pure confidence ladder
  deadlines.ts      calendar construction
  conflicts.ts      exclusivity overlap
  escalate.ts       escalation briefs
  refusal.ts        out-of-scope question classification
  llm.ts            provider-thin structured-output call + disk cache
  schema.ts         the extraction JSON Schema (strict) + its TS mirror
  format.ts         citation/date/money display helpers (shared by app + eval)
scripts/
  make-corpus.ts    ground-truth template → absolute ground truth + 6 documents
  corpus/           per-contract prose builders (one file each)
  ingest.ts         documents → data/parsed/*.json
  extract.ts        parsed docs → data/extractions/*.json (cached)
  compute.ts        extractions + parsed → data/results.json
  eval.ts           results vs ground truth → eval-report.md
  pipeline.ts       runs ingest→extract→compute→eval in-process with shared opts
data/
  ground-truth.template.json   dates as offsets from asOf — the answer key
  ground-truth.json            generated, absolute
  questions.json               two planted must-refuse questions
  corpus/  parsed/  cache/  extractions/  results.json
app/
  layout.tsx  page.tsx  globals.css
components/
  Disclaimer.tsx ConflictBanner.tsx CalendarPanel.tsx EscalationCard.tsx
  ContractList.tsx ContractDetail.tsx FieldRow.tsx ConfidenceChip.tsx
  RefusalPanel.tsx EvidenceViewer.tsx
tests/
  verify.test.ts confidence.test.ts deadlines.test.ts conflicts.test.ts
  fixtures/
```

Each stage script exports `run(opts: StageOpts)` and has a thin CLI wrapper, so `pipeline.ts` composes them in-process and argument forwarding works (`npm run pipeline -- --corpus ./their-folder`).

---

### Task 1: Scaffold, shared types, ground-truth template

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`
- Create: `lib/types.ts`, `data/ground-truth.template.json`, `data/questions.json`

**Interfaces:**
- Produces: every type below. All later tasks import from `lib/types.ts`.

```ts
export type Confidence = "FOUND" | "INFERRED" | "UNCERTAIN" | "NOT_FOUND";
export type MatchKind = "exact" | "normalised" | "fuzzy";
export type EvidenceType = "explicit" | "derived" | "absent";
export type DocFormat = "pdf" | "docx";

export interface BBox { x: number; y: number; w: number; h: number } // top-left origin, PDF points

export interface Word {
  text: string; charStart: number; charEnd: number;
  bbox: BBox | null;            // null for DOCX
  ocrConfidence: number | null; // 0-100, only when the page was OCR'd
}

export interface Page {
  pageNum: number;              // 1-based; 1 for DOCX
  charStart: number; charEnd: number;
  width: number; height: number; // points; 0 for DOCX
  ocr: boolean;
  words: Word[];
}

export interface ParsedDoc {
  docId: string; fileName: string; title: string;
  format: DocFormat;
  paginated: boolean;           // false for DOCX — page numbers must not be shown
  ocrPages: number[];
  fullText: string;
  pages: Page[];
  html?: string;                // DOCX only, from mammoth, for the evidence viewer
}

export interface Citation {
  docId: string; docTitle: string; clauseId: string;
  pageNum: number | null;       // null when !paginated
  charStart: number; charEnd: number;
  quotedText: string;           // OUR text at the span, not the model's string
  matchKind: MatchKind;
  bboxes: { pageNum: number; box: BBox }[];
  spansPages: boolean;
  ocrConfidenceMean: number | null;
  ocrConfidenceMin: number | null;
}

export interface FieldResult {
  fieldId: string; label: string;
  value: string | null;
  confidence: Confidence;
  reasons: string[];            // why this confidence — rendered verbatim in the UI
  citations: Citation[];
  ambiguities: string[];
  evidenceType: EvidenceType;
  discardedQuoteCount: number;  // quotes verify.ts rejected
}

export interface PaymentTerm {
  id: string; description: string;
  amountMinor: number | null; currency: string | null;
  frequency: "one-off" | "monthly" | "quarterly" | "annually" | "on-invoice";
  firstDueDate: string | null;  // ISO
  conditional: boolean; conditionNote: string | null;
  confidence: Confidence; reasons: string[]; citations: Citation[];
}

export interface Grant {
  id: string; docId: string; docTitle: string;
  grantee: string; grantor: string;
  exclusivityType: "exclusive" | "sole" | "non-exclusive";
  territoryLabel: string; territoryCodes: string[];
  productLabel: string; productCodes: string[];
  start: string | null; end: string | null;
  confidence: Confidence; reasons: string[]; citations: Citation[];
}

export interface ContractResult {
  docId: string; title: string; fileName: string;
  format: DocFormat; paginated: boolean; ocrPages: number[];
  fields: FieldResult[];
  payments: PaymentTerm[];
  grants: Grant[];
}

export interface CalendarEvent {
  id: string; docId: string; docTitle: string;
  kind: "renewal-notice-deadline" | "term-end" | "payment" | "termination-window";
  title: string;
  eventDate: string | null; actionDeadline: string | null;
  daysUntilDeadline: number | null;
  conditional: boolean; caveat: string | null;
  confidence: Confidence; reasons: string[]; citations: Citation[];
}

export interface ExclusivityConflict {
  id: string; grants: [Grant, Grant];
  overlapTerritories: string[]; overlapProducts: string[];
  overlapFrom: string | null; overlapTo: string | null;
  confidence: Confidence; reasons: string[]; explanation: string;
}

export interface EscalationBrief {
  id: string; severity: "high" | "medium"; issue: string;
  documents: Citation[];
  established: { statement: string; citation: Citation }[];
  unresolved: string[]; question: string; exposure: string;
}

export interface RefusedQuestion {
  id: string; question: string;
  category: "legal-advice" | "outcome-prediction" | "outside-corpus" | "document-not-ingested";
  reason: string; nextStep: string;
}

export interface Results {
  generatedAt: string; asOf: string; model: string; windowDays: number;
  contracts: ContractResult[];
  calendar: CalendarEvent[];
  conflicts: ExclusivityConflict[];
  escalations: EscalationBrief[];
  refusals: RefusedQuestion[];
  unavailable: { stage: string; reason: string }[]; // never a silent stub
}

export interface StageOpts { corpusDir: string; dataDir: string; asOf: Date }
```

**Ground-truth template.** Dates are offsets, not absolutes, so the hero renewal always lands inside the 90-day window whenever the corpus is regenerated:

```json
{ "asOfRelative": true,
  "contracts": [{ "docId": "saas-subscription",
    "fields": { "renewalNoticeDays": { "value": "60", "confidence": "FOUND" },
                "termEnd": { "relativeToAsOf": 74, "confidence": "FOUND" } } }] }
```

`make-corpus.ts` resolves `relativeToAsOf` against `--as-of` (default today) and writes absolute values into `data/ground-truth.json`.

- [ ] **Step 1:** `npx create-next-app@latest` into the existing directory with TypeScript + Tailwind + App Router, no ESLint prompt surprises. Verify it boots.
- [ ] **Step 2:** Add `tsx`, `vitest`, `openai`, `pdfjs-dist`, `pdf-lib`, `mammoth`, `tesseract.js`, `@napi-rs/canvas`, `date-fns`. Add npm scripts including `pipeline` and `test`.
- [ ] **Step 3:** Write `lib/types.ts` exactly as above.
- [ ] **Step 4:** Write `data/ground-truth.template.json` covering all 6 contracts and every field id, and `data/questions.json` with the two must-refuse items.
- [ ] **Step 5:** `npx tsc --noEmit` passes. Commit.

---

### Task 2: Corpus generation — hand-written prose, 4 PDFs + 1 DOCX

**Files:**
- Create: `scripts/corpus/*.ts` (one builder per contract), `scripts/make-corpus.ts`

**Interfaces:**
- Consumes: `data/ground-truth.template.json`, `StageOpts`
- Produces: `data/corpus/*.pdf|.docx`, `data/ground-truth.json`; each builder exports `build(gt: ResolvedGroundTruth): { title, clauses: Clause[] }` where `Clause = { id: string; heading: string; body: string; pageBreakBefore?: boolean }`

Six contracts per SPEC.md, each in a deliberately different drafting voice. Deliberate difficulty, planted on purpose:

1. **SaaS subscription** (PDF) — S$40,000/yr, auto-renewal, 60-day notice. The notice period lives in cl. 12.3 (Termination), *not* beside the renewal clause cl. 3.2, so the model must join two clauses. Hero moment: notice deadline falls inside 90 days.
2. **Distribution A** (PDF) — *exclusive* appointment, Singapore, "Product Category X" defined by reference to Schedule 1.
3. **Distribution B** (PDF) — appoints a second distributor, same territory and category. Uses "sole and exclusive" wording to exercise the exclusive/sole distinction.
4. **MSA** (PDF) — liability capped at S$100,000 in cl. 11.2; cl. 12.4 of the Indemnity Schedule makes IP infringement an indemnified matter without stating whether it sits inside the cap. Correct answer: `UNCERTAIN` → escalate. The cap clause spans a page break, exercising cross-page span handling.
5. **Mutual NDA** (DOCX) — genuinely no exclusivity provision. Correct answer: `NOT_FOUND`, and the keyword probe must not fire.
6. **Supplier agreement** (PDF, later rasterised) — quarterly payments plus net-30-from-invoice. Notice period expressed in **business days**, forcing an `UNCERTAIN` with a stated reason.

- [ ] **Step 1:** Write `Clause` model and a `renderPdf(clauses, outPath)` helper using `pdf-lib` with real page breaks, headers and clause numbering.
- [ ] **Step 2:** Write the six prose builders. Each returns clauses whose text contains the ground-truth values verbatim.
- [ ] **Step 3:** Write `make-corpus.ts`: resolve template offsets → write `data/ground-truth.json` → render 4 PDFs and the NDA as DOCX (`docx` package or mammoth-compatible minimal OOXML).
- [ ] **Step 4:** Run `npm run corpus`. Open each output, confirm it is readable and the ground-truth strings appear.
- [ ] **Step 5:** Assert in-script that every ground-truth `value` occurs in its document's text; fail loudly if not. Commit.

---

### Task 3: The scanned document — hard 30-minute timebox

**Files:**
- Modify: `scripts/make-corpus.ts`
- Create: `scripts/corpus/scan.ts`

Take the rendered supplier-agreement PDF, rasterise each page with `pdfjs-dist` + `@napi-rs/canvas`, apply ~0.7° rotation and light gaussian noise, re-embed the JPEGs with `pdf-lib` as a text-layer-free PDF.

**Fallback ladder, in order, on a hard 30-minute stop:** `@napi-rs/canvas` → `pdf-to-img` → render in a browser once and commit the JPEG. If all three fail, the corpus ships 5 documents and `Results.unavailable` records the reason. One scanned document is all the spec requires; it is not worth an hour.

- [ ] **Step 1:** Rasterise page 1 only, write a PNG, eyeball it.
- [ ] **Step 2:** Add skew + noise, re-embed all pages, write `supplier-agreement-scanned.pdf`.
- [ ] **Step 3:** Confirm `getTextContent()` on the result yields ~0 characters (proving there is no text layer to cheat with). Commit.

---

### Task 4: `ingest.ts` — text, page offsets, word boxes, OCR

**Files:**
- Create: `scripts/ingest.ts`
- Test: manual verification against known page counts

**Interfaces:**
- Produces: `data/parsed/<docId>.json` conforming to `ParsedDoc`; `run(opts: StageOpts): Promise<ParsedDoc[]>`

Per-page algorithm:
1. `getTextContent()`. If the page yields fewer than 40 non-whitespace characters, classify it as an image page.
2. **Text page:** build page text from items in reading order. For each item, derive its box from `transform[4], transform[5], width, height`, converting to top-left origin as `y = pageHeight - (transform[5] + height)`. Split `item.str` on whitespace into words and interpolate each word's box across the item box by character-offset ratio. Approximate by design — highlighting is cosmetic; page numbers come from offsets, and real OCR boxes come from tesseract.
3. **Image page:** rasterise at 2× scale, run `tesseract.js` with `blocks`/word output, take each word's `text`, `confidence`, and bbox scaled back to PDF points. Mark `Page.ocr = true`.
4. **DOCX:** `mammoth.extractRawText` for `fullText` plus `convertToHtml` for `html`. `paginated: false`, one `Page` covering the document, `bbox: null` on every word.
5. Assemble `fullText` by concatenating page texts with `\n\n`, recording each page's `[charStart, charEnd)` and each word's absolute offsets. **Every word offset must satisfy `fullText.slice(w.charStart, w.charEnd) === w.text`** — assert this and throw on violation, since all downstream correctness rests on it.

- [ ] **Step 1:** PDF text path, offsets and page ranges only; assert the word-offset invariant.
- [ ] **Step 2:** Add word bbox interpolation.
- [ ] **Step 3:** Add DOCX path.
- [ ] **Step 4:** Add image-page detection and the OCR path with word confidences.
- [ ] **Step 5:** Run on the corpus. Verify the scanned document reports `ocrPages` non-empty and mean word confidence below 100. Commit.

---

### Task 5: `normalise.ts` + `verify.ts` — the differentiator

**Files:**
- Create: `lib/normalise.ts`, `lib/verify.ts`
- Test: `tests/verify.test.ts`, `tests/fixtures/parsed-doc.ts`

**Interfaces:**
- Consumes: `ParsedDoc`, `Citation`, `MatchKind`
- Produces:
  ```ts
  // normalise.ts
  export function normalise(text: string): { text: string; map: number[] };
  // map[i] = index into the ORIGINAL string for normalised char i.
  // A ligature expands 1 original char to N normalised chars, all mapping to the same index.
  export function similarity(a: string, b: string): number; // 0..1, Levenshtein ratio

  // verify.ts
  export interface VerifyResult {
    matchKind: MatchKind; charStart: number; charEnd: number;
    pageNum: number | null; spansPages: boolean;
    bboxes: { pageNum: number; box: BBox }[];
    ocrConfidenceMean: number | null; ocrConfidenceMin: number | null;
    quotedText: string;
  }
  export function verifyQuote(quote: string, doc: ParsedDoc): VerifyResult | null;
  export const FUZZY_THRESHOLD = 0.92;
  export const OCR_MEAN_FLOOR = 90;
  export const OCR_MIN_FLOOR = 60;
  ```

Normalisation rules: collapse all whitespace runs to a single space; expand ligatures (`ﬁﬂﬀﬃﬄ`); delete `-` followed by a newline (de-hyphenate line breaks); unify curly quotes to `'` and `"`; unify en/em dashes to `-`; trim.

Verification order:
1. Exact `indexOf` on `fullText` → `exact`.
2. Normalise both haystack and needle, `indexOf`, map offsets back through `map` → `normalised`.
3. Fuzzy: coarse pass sliding a needle-length window with step `max(1, floor(len/8))` scoring with a bigram Dice coefficient; take the best 5 offsets; fine pass at step 1 within ±`len/4` of each using `similarity()`. Best score ≥ `0.92` → `fuzzy`; else `null`.
4. `null` means the caller **discards the whole extraction** for that field.

Then: `pageNum` = the page whose `[charStart, charEnd)` contains the span's start (`null` when `!doc.paginated`); `spansPages` true if the end lands on a later page; `bboxes` = boxes of every word overlapping the span, grouped by page; OCR confidence = char-weighted mean and min over overlapping words that carry a confidence, else `null`. `quotedText` is always **our** text at the span.

- [ ] **Step 1:** Write `tests/fixtures/parsed-doc.ts` — a hand-built two-page `ParsedDoc` with known offsets, one ligature, one hyphenated line break, one curly quote, and an OCR page with two low-confidence words.
- [ ] **Step 2:** Write `tests/verify.test.ts` covering: exact match; whitespace-collapsed match → `normalised`; ligature match; de-hyphenated match; curly-quote match; a quote with one substituted word at ~0.95 → `fuzzy`; a quote at ~0.6 → `null`; page derivation for page 2; a span crossing the page boundary sets `spansPages`; OCR mean/min computed over the low-confidence words; `quotedText` returns our text not the model's; `map` round-trips every index.
- [ ] **Step 3:** Run `npx vitest run tests/verify.test.ts`. Expect failures — modules do not exist.
- [ ] **Step 4:** Implement `normalise.ts`, then `verify.ts`.
- [ ] **Step 5:** Tests pass. Commit.

---

### Task 6: `llm.ts` + `schema.ts` + `extract.ts`

**Files:**
- Create: `lib/schema.ts`, `lib/llm.ts`, `scripts/extract.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function callStructured<T>(args: {
    system: string; user: string; schemaName: string; schema: object; cacheDir: string;
  }): Promise<{ data: T; cached: boolean; model: string }>;
  ```

`callStructured` posts to `/v1/responses` with `text.format = { type: "json_schema", name, strict: true, schema }` and `reasoning: { effort: "high" }`. **No `temperature`.** Cache key `sha256(model + system + user + JSON.stringify(schema))`, written to `data/cache/<key>.json` on the first call. A cache hit never touches the network. A miss with no `OPENAI_API_KEY` throws with a message naming the missing key — it must never fall back to invented data.

Extraction response shape (strict schema, all properties required, `additionalProperties: false`):

```ts
{
  fields: { fieldId: string; found: boolean; value: string;
            quotes: { clauseId: string; text: string }[];
            evidenceType: EvidenceType; ambiguities: string[] }[];
  payments: { description: string; amountMinor: number | null; currency: string | null;
              frequency: "one-off"|"monthly"|"quarterly"|"annually"|"on-invoice";
              firstDueDate: string | null; conditional: boolean; conditionNote: string | null;
              quotes: {...}[]; ambiguities: string[] }[];
  grants: { grantee: string; grantor: string;
            exclusivityType: "exclusive"|"sole"|"non-exclusive";
            territoryLabel: string; territoryCodes: string[];
            productLabel: string; productCodes: string[];
            start: string | null; end: string | null;
            quotes: {...}[]; ambiguities: string[] }[];
}
```

Field ids: `parties`, `commencementDate`, `termLength`, `termEnd`, `renewalType`, `renewalNoticeDays`, `terminationForConvenience`, `terminationForCause`, `liabilityCap`, `exclusivity`.

The prompt instructs: quote **verbatim, character-for-character** from the supplied text; never report a page number; list every ambiguity that prevents a single unambiguous answer; use `evidenceType: "absent"` when the contract is silent rather than guessing; normalise territory and product scope to short uppercase codes.

- [ ] **Step 1:** Write `schema.ts` with the JSON Schema and its TS mirror type.
- [ ] **Step 2:** Write `llm.ts` with caching; a cache hit must work with no network.
- [ ] **Step 3:** Write `extract.ts`: one call per parsed document, `fullText` in the user message, write `data/extractions/<docId>.json`.
- [ ] **Step 4:** Run on the corpus. Re-run and confirm every call reports `cached: true` and zero network requests. Commit.

---

### Task 7: `confidence.ts`

**Files:**
- Create: `lib/confidence.ts`
- Test: `tests/confidence.test.ts`

**Interfaces:**
```ts
export function computeConfidence(input: {
  evidenceType: EvidenceType;
  matchKinds: MatchKind[];        // one per surviving quote; empty if all discarded
  anyQuoteDiscarded: boolean;
  ambiguities: string[];
  ocrMean: number | null; ocrMin: number | null;
  hasCandidateClause: boolean;
  unresolvedAmount?: boolean;     // money field found but no single figure
}): { level: Confidence; reasons: string[] };

export function hasCandidateClause(fieldId: string, fullText: string): boolean;
export function weakest(levels: Confidence[]): Confidence; // ladder FOUND > INFERRED > UNCERTAIN > NOT_FOUND
```

Ladder, first match wins:
1. `anyQuoteDiscarded || (evidenceType !== "absent" && matchKinds.length === 0)` → `UNCERTAIN`, reason `citation_unverifiable`.
2. `evidenceType === "absent"` → `hasCandidateClause` ? `UNCERTAIN` ("a possibly relevant clause is present but we could not resolve it") : `NOT_FOUND` ("no provision of this kind identified in this document").
3. `ambiguities.length > 0` → `UNCERTAIN`, reasons = the ambiguities verbatim.
4. `ocrMean < 90 || ocrMin < 60` → `UNCERTAIN`, reason naming the scan and the figure.
5. `unresolvedAmount` → `UNCERTAIN`, reason `cap cannot be reduced to a single figure`.
6. All quotes `fuzzy` → `UNCERTAIN`. Some quotes `fuzzy` → one step down from the level step 7 would give.
7. `evidenceType === "derived"` → `INFERRED`; else `FOUND`.

`hasCandidateClause` runs field-specific keyword probes over our own text, e.g. exclusivity: `/exclusiv|sole (distributor|agent|supplier)|restrictive covenant|non-compet/i`. This is what separates the NDA's true silence (`NOT_FOUND`) from a miss (`UNCERTAIN`).

- [ ] **Step 1:** Write `tests/confidence.test.ts`: one case per ladder rung, plus the NDA case (absent + no probe hit → `NOT_FOUND`), the missed-clause case (absent + probe hit → `UNCERTAIN`), fuzzy downgrade from `FOUND` to `INFERRED`, all-fuzzy → `UNCERTAIN`, and `weakest()` ordering.
- [ ] **Step 2:** Run, expect failure. **Step 3:** Implement. **Step 4:** Pass. **Step 5:** Commit.

---

### Task 8: `deadlines.ts`

**Files:**
- Create: `lib/deadlines.ts`
- Test: `tests/deadlines.test.ts`

**Interfaces:**
```ts
export function buildCalendar(contracts: ContractResult[], asOf: Date, windowDays?: number): CalendarEvent[];
```

Rules: `actionDeadline = termEnd − renewalNoticeDays`. `termEnd` stated → its own confidence; derived from commencement + term length → `INFERRED`. Recurring payments expand across `[asOf, asOf + windowDays]`. `frequency: "on-invoice"` → `conditional: true`, `actionDeadline: null`, caveat "payable 30 days from invoice date; the contract states no invoice date, so no certain due date can be given." Notice stated in business days → `UNCERTAIN` plus caveat "notice period stated in business days; shown as calendar days, with no public-holiday calendar applied." Sort ascending by `actionDeadline`, conditional/null deadlines last. Event confidence is `weakest()` of its inputs.

- [ ] **Step 1:** Write `tests/deadlines.test.ts`: notice subtraction; commencement + 12 months → `INFERRED` term end; quarterly expansion yielding exactly the occurrences inside a 90-day window; `on-invoice` giving a null deadline and a caveat; business-days notice forcing `UNCERTAIN`; sort order with a null deadline present; an event whose deadline has already passed is excluded but the term-end event is not.
- [ ] **Step 2:** Run, expect failure. **Step 3:** Implement with `date-fns`. **Step 4:** Pass. **Step 5:** Commit.

---

### Task 9: `conflicts.ts`

**Files:**
- Create: `lib/conflicts.ts`
- Test: `tests/conflicts.test.ts`

**Interfaces:**
```ts
export function detectExclusivityConflicts(contracts: ContractResult[]): ExclusivityConflict[];
export function grantsOverlap(a: Grant, b: Grant): {
  overlaps: boolean; territories: string[]; products: string[];
  from: string | null; to: string | null;
};
```

Conflict when: `territoryCodes` intersect ∧ `productCodes` intersect ∧ date ranges intersect (open-ended treated as unbounded) ∧ grantees differ ∧ at least one grant is `exclusive` or `sole`. Confidence is `weakest()` of the two grants' — a conflict built on two `UNCERTAIN` grants is `UNCERTAIN`, never laundered into a certainty. The explanation states the exclusive/sole distinction in words.

- [ ] **Step 1:** Write `tests/conflicts.test.ts`: overlapping exclusive + non-exclusive to different grantees → conflict; disjoint territories → none; disjoint products → none; non-overlapping date ranges → none; two `non-exclusive` grants → none; same grantee twice → none; `sole` + second appointment → conflict; `UNCERTAIN` grant → `UNCERTAIN` conflict.
- [ ] **Step 2:** Run, expect failure. **Step 3:** Implement. **Step 4:** Pass. **Step 5:** Commit.

---

### Task 10: `escalate.ts` + `refusal.ts`

**Files:**
- Create: `lib/escalate.ts`, `lib/refusal.ts`

**Interfaces:**
```ts
export function buildEscalations(contracts: ContractResult[], conflicts: ExclusivityConflict[]): EscalationBrief[];
export function classifyRefusal(question: string, knownDocTitles: string[]): RefusedQuestion;
```

Escalations fire on `UNCERTAIN` for `liabilityCap`, `terminationForConvenience`, `terminationForCause`, `exclusivity`, or on any conflict. `established` lists only claims whose citation verified. `exposure` derives contract value from the annualised payment schedule, or states "contract value not determined from the documents." Severity `high` for liability and conflicts, `medium` otherwise.

`classifyRefusal` uses deterministic rules: advice verbs (`should I`, `can I safely`, `is it enforceable`, `advise`) → `legal-advice`; outcome verbs (`will I win`, `likely outcome`, `would a court`) → `outcome-prediction`; a document name not in `knownDocTitles` → `document-not-ingested`. Each carries a reason and a concrete next step. No partial answer is ever emitted alongside a refusal.

- [ ] **Step 1:** Implement `escalate.ts`, rendering the exact field order from SPEC.md's brief layout.
- [ ] **Step 2:** Implement `refusal.ts` and confirm both planted questions in `data/questions.json` classify correctly.
- [ ] **Step 3:** Commit.

---

### Task 11: `compute.ts` — assemble `results.json`

**Files:**
- Create: `scripts/compute.ts`, `scripts/pipeline.ts`, `lib/format.ts`

Per document: load `ParsedDoc` + extraction; for each field verify every quote; **if any quote fails, discard the extraction's value entirely** and emit a `FieldResult` with `value: null`, `UNCERTAIN`, reason `citation_unverifiable`, and `discardedQuoteCount`. Otherwise build citations from `VerifyResult` and call `computeConfidence`. Same treatment for payments and grants. Then `buildCalendar`, `detectExclusivityConflicts`, `buildEscalations`, `classifyRefusal` over `data/questions.json`. Copy corpus files into `public/corpus/` so the viewer can fetch them. Write `data/results.json`.

- [ ] **Step 1:** Implement per-field verification and discard semantics.
- [ ] **Step 2:** Wire the four `lib/` computations and the corpus copy.
- [ ] **Step 3:** Implement `pipeline.ts` forwarding `--corpus`, `--as-of`, `--window`.
- [ ] **Step 4:** Run the full pipeline. Manually confirm: the MSA cap is `UNCERTAIN`, the NDA exclusivity is `NOT_FOUND`, the two distribution grants produce one conflict, the SaaS notice deadline sits inside 90 days. Commit.

---

### Task 12: `eval.ts` + `eval-report.md`

**Files:**
- Create: `scripts/eval.ts`

Metrics: per-field and overall accuracy; coverage (`FOUND ∪ INFERRED` ÷ total); **confident error rate** (wrong ÷ `FOUND`, target < 3%); **hedge precision** (of `UNCERTAIN`/`NOT_FOUND` fields, the fraction that would have been wrong if asserted — using the extraction's discarded value against ground truth); citation verification rate; fabricated citations (must be 0); refusal accuracy on the two planted questions. Value comparison is normalised (case, whitespace, currency punctuation, date parsing) with an exact-match fallback. When no `ground-truth.json` accompanies the corpus, emit citations, coverage and confidence and **omit the accuracy section** rather than invent a denominator.

- [ ] **Step 1:** Implement metrics and the console table.
- [ ] **Step 2:** Emit `eval-report.md`.
- [ ] **Step 3:** Run. Record the real numbers. If confident error rate exceeds 3%, tighten `confidence.ts` — never the answer key. Commit.

---

### Task 13: UI shell — layout, disclaimer, conflict banner, calendar

**Files:**
- Create: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `components/Disclaimer.tsx`, `components/ConflictBanner.tsx`, `components/CalendarPanel.tsx`, `components/ConfidenceChip.tsx`

`app/page.tsx` is a server component reading `data/results.json` from disk. Two columns: calendar and escalations left, contracts right. Calendar sorted by action deadline with the days-remaining figure prominent, conditional items grouped last under their caveat. `ConfidenceChip` renders all four levels with distinct colour and text label — always visible, never hover-only. Non-dismissable disclaimer in the layout. No advisory phrasing anywhere; `NOT_FOUND` reads "no exclusivity provision identified", never "has no exclusivity".

shadcn/ui init is timeboxed to 15 minutes; if it fights Tailwind 4, hand-roll the handful of primitives with Tailwind and say so rather than burning the budget.

- [ ] **Step 1:** Layout, globals, disclaimer, page reading results.
- [ ] **Step 2:** `ConfidenceChip` with all four levels.
- [ ] **Step 3:** `CalendarPanel` with deadline sorting and caveats.
- [ ] **Step 4:** `ConflictBanner`. **Step 5:** Commit.

---

### Task 14: Contract list, detail panel, field rows, escalations, refusals

**Files:**
- Create: `components/ContractList.tsx`, `components/ContractDetail.tsx`, `components/FieldRow.tsx`, `components/EscalationCard.tsx`, `components/RefusalPanel.tsx`

Every `FieldRow` shows value, confidence chip, clause reference, and — for `UNCERTAIN`/`NOT_FOUND` — the `reasons` verbatim as the row body, so there are no blanks and no dead ends. Page reference renders "not applicable — DOCX has no fixed pagination" when `!paginated`. Clicking a row opens the evidence viewer. `EscalationCard` follows the spec's brief layout exactly. `RefusalPanel` shows the planted questions with reason and next step.

- [ ] **Step 1:** `ContractList` + selection state. **Step 2:** `FieldRow` including the hedged-row treatment. **Step 3:** `ContractDetail` with payments and grants. **Step 4:** `EscalationCard` + `RefusalPanel`. **Step 5:** Commit.

---

### Task 15: `EvidenceViewer` — bbox span highlighting

**Files:**
- Create: `components/EvidenceViewer.tsx`

Client component. For a PDF citation: load `/corpus/<fileName>` with `pdfjs-dist`, render `pageNum` to a canvas, and absolutely position one translucent rectangle per bbox, scaling by `canvasWidth / page.width`. One code path for born-digital and scanned pages, which is exactly why the scan is a first-class citizen. When `spansPages`, offer both pages. For a DOCX citation: render the stored `html` and wrap the span in a highlight, with the page line reading "not applicable — DOCX has no fixed pagination." Footer states the match kind (`exact` / `normalised` / `fuzzy`) and, when present, the OCR confidence over the span — the verification story made visible.

- [ ] **Step 1:** pdfjs page render to canvas at device pixel ratio.
- [ ] **Step 2:** bbox overlay with scaling. **Step 3:** DOCX path. **Step 4:** Match-kind and OCR footer. **Step 5:** Verify against the scanned document specifically. Commit.

---

### Task 16: Demo path, warm cache, README, final report

**Files:**
- Create: `README.md`; Modify: `eval-report.md`

- [ ] **Step 1:** Regenerate the corpus with `--as-of` today so the hero renewal sits inside 90 days; rerun the pipeline; commit the warm cache so the demo needs no network.
- [ ] **Step 2:** `npx vitest run` and `npx tsc --noEmit` both clean. `npm run build` succeeds.
- [ ] **Step 3:** README: what it does, the prime directive, how to run, and the honest metrics.
- [ ] **Step 4:** Walk the demo path end to end: conflict banner → SaaS notice deadline → click through to the highlighted clause → MSA `UNCERTAIN` → escalation brief → NDA `NOT_FOUND` → scanned document with OCR-limited confidence → refusal panel → `npm run eval`.
- [ ] **Step 5:** Commit.

---

## Self-Review

**Spec coverage.** Batch ingest of mixed formats incl. scanned → T2/T3/T4. All seven field groups → T6 field ids + payments + grants. 90-day calendar sorted by action deadline → T8/T13. Exclusivity conflict → T9. Page + clause + confidence per field → T4 (offsets), T5 (page derivation), T7 (confidence), T14/T15 (display). Escalation brief + refusal → T10/T14. Verification ladder → T5. OCR confidence into the ladder → T4/T7. Deterministic dates → T8. Eval with confident error rate and hedge precision → T12. UI rules → T13/T14. CLI for judge folders → T11. DOCX pagination honesty → T4/T14/T15. No gaps found.

**Deviations from the spec, stated rather than smuggled.** (a) A fourth test file, `confidence.test.ts` — the spec says tests cover verification, date math and overlap "only", but `confidence.ts` is the scored artefact and is a pure function, so the marginal cost is minutes and the marginal value is the whole calibration story. (b) The extraction schema carries structured `payments` and `grants` blocks alongside the spec's flat field shape, because deadlines and conflict detection need typed data and string-parsing a `value` field would be the fragile alternative. Both are additive.

**Type consistency.** `weakest()` is defined in `confidence.ts` and consumed by `deadlines.ts`, `conflicts.ts`, `escalate.ts`. `Citation` is produced only in `compute.ts` from `VerifyResult`; no other module constructs one. `verifyQuote` returns `VerifyResult`, not `Citation` — the widening happens in one place. Field ids in `schema.ts`, `ground-truth.template.json`, `confidence.ts` probes, and `FieldRow` labels must match exactly; T11 asserts this at runtime and fails loudly on drift.
