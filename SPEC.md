# AITHENA — MVP

## What we are building

A tool that reads a folder of an SME's signed contracts and shows **what they are on the hook for
and what is coming up** — every field linked to an exact page and clause, every answer carrying an
honest confidence signal.

The user is not a lawyer and will not verify anything. A dashboard that is 80% right and presented
with total confidence is worse than useless.

**Prime directive: AITHENA is never more confident than its evidence.**

- **R1** — no quote reaches the user unless we located it in the source text ourselves
- **R2** — no claim without a citation
- **R3** — "uncertain" and "not found" are answers, rendered as prominently as findings

## Judged requirements — all six must ship

1. Batch ingest of mixed formats, including one **scanned** document
2. Per contract: parties, term, renewal mechanics + notice period, termination rights, payment
   obligations, liability cap, exclusivity / restrictive covenants
3. **90-day forward calendar** with the date by which action must be taken
4. **One class of cross-contract conflict** (exclusivity)
5. Every field → page + clause + confidence separating "found it" from "inferred it"
6. **An escalation brief** at the boundary, and a refusal path for out-of-scope questions

Scored field-by-field against ground truth, **with honesty scored separately**. We optimise low
confident-error rate, not raw accuracy.

## Stack

Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui. `pdfjs-dist`, `mammoth`, `tesseract.js`,
`date-fns`, Anthropic SDK. **No Python, no database, no auth, no file upload UI.**

All processing happens in **offline scripts** that write JSON. The app only reads
`data/results.json`. This means the demo never waits on an API call and never fails on stage.

```
scripts/  make-corpus.ts → ingest.ts → extract.ts → compute.ts → eval.ts
data/     corpus/  ground-truth.json  parsed/  cache/  results.json
app/      one page + PDF viewer
lib/      verify.ts  confidence.ts  deadlines.ts  conflicts.ts  escalate.ts
```

## Decisions taken before build

These amend the stack line above. Recorded here so the reasoning survives the build.

**Provider: OpenAI, not Anthropic.** `OPENAI_API_KEY` is present in the environment; no Anthropic
key is. Nothing in the six judged requirements depends on the provider. The call sits behind
`lib/llm.ts` so a provider swap is a single file.

**Model: `gpt-5.5-2026-04-23`, pinned snapshot, `reasoning.effort: "high"`.** Chosen for the
judgment calls that are the showcase — deciding that the indemnity schedule *might* sit outside the
liability cap, and returning `UNCERTAIN` rather than a confident figure, is a reasoning task. Model
id is env-overridable via `AITHENA_MODEL`.

**Determinism comes from the cache, not from `temperature`.** Verified against the live API:
`gpt-5.5` returns HTTP 400 `Unsupported parameter: 'temperature' is not supported with this model`.
The spec's `temperature: 0` is therefore replaced by disk caching keyed on
`sha256(prompt + model + schema)`, written from the first call. Reruns are byte-identical; the demo
never depends on a network round trip.

**Structured output via the Responses API with `strict: true`.** Schema conformance is enforced by
the API, so malformed extraction responses are not a failure mode we have to defend against.
Verbatim quoting is still not guaranteed by the schema — that is exactly what `verify.ts` is for.

**Scripts are a real CLI.** Every stage takes a corpus directory argument, so
`npm run pipeline -- ./some-folder` works on documents we have never seen. A judge can hand us a
folder. Where no `ground-truth.json` accompanies the corpus, `eval.ts` emits citations, coverage and
confidence but omits the accuracy section rather than inventing a denominator.

**DOCX cites clause and span, and states that it has no pagination.** A reflowable format has no
fixed page number. The page field renders `not applicable — DOCX has no fixed pagination`, with the
clause and the verified character span carrying the citation. Synthesising a page number to satisfy
requirement 5 would be the prime directive violated in the one place judges look hardest.

**Citations carry bounding boxes for every format, so the viewer has one code path.** At ingest we
record a bbox per word — from `pdfjs` text-item transforms for born-digital PDFs, from `tesseract.js`
word boxes for the scan. The viewer draws absolute-positioned rectangles over the rendered page
rather than manipulating a pdfjs text layer. This makes the scanned document a first-class citizen
instead of a special case, and it is why OCR confidence can be mapped onto a cited span at all.

**Corpus prose is hand-written from the ground truth, in deliberately varied drafting voices.**
Deterministic and reproducible, with no generation step that could inject errors into our own
scoreboard. Notice periods sit apart from renewal clauses, defined terms are used, and the liability
cap is split across a clause and a schedule.

## Hour plan

| Hours | Do |
|---|---|
| 0–1 | Scaffold. Write `ground-truth.json` for 6 contracts **first**. |
| 1–2 | Generate the 6 contracts from that ground truth. |
| 2–3 | `ingest.ts` — text + page offsets + OCR the scanned one. |
| 3–5 | `extract.ts` + `verify.ts` — the core. |
| 5–6 | `compute.ts` — confidence, dates, conflict, escalation. |
| 6–7 | `eval.ts`. Do not skip this; it is how we are judged. |
| 7–11 | Single-page UI + PDF viewer with span highlighting. |
| 11–12 | Warm cache, demo path, `eval-report.md`. |

## Corpus — 6 contracts, ground truth written first

Write the answer key as JSON, then generate contract prose from it. Annotating generated contracts
afterwards costs hours and puts errors in your own scoreboard.

1. **SaaS subscription** — S$40,000/yr, auto-renews, 60-day notice, renewal falls inside the next 90
   days. This is the hero moment; it is the exact failure from the brief.
2. **Distribution agreement A** — *exclusive*, Singapore, product category X
3. **Distribution agreement B** — appoints a second distributor, same territory and category
   *(the planted conflict)*
4. **Master services agreement** — liability cap with carve-outs in a separate indemnity schedule
   *(correct answer: UNCERTAIN → escalate)*
5. **Mutual NDA** — no exclusivity clause at all *(correct answer: NOT_FOUND, not UNCERTAIN)*
6. **Supplier agreement** — quarterly payments plus a net-30-from-invoice term *(a conditional
   obligation — no invoice date means no certain due date)*

Formats: 4 PDF, 1 DOCX, 1 **scanned** PDF. Make the scanned one by rendering to PDF, rasterising,
adding slight skew and noise, re-embedding with `pdf-lib`. **Hard 30-minute timebox** — if it
fights you, screenshot the rendered PDF, JPEG it, embed it. One scanned document is all that is
required.

Also `data/questions.json` with two items we must **refuse**: one asking for a legal opinion, one
about a document not in the corpus.

## Extraction — one call per contract

No retrieval layer. Six contracts fit comfortably in context. One structured-output call per
contract, temperature 0, returning every field at once:

```ts
{
  field: string;
  found: boolean;
  value: string;
  quotes: { clauseId: string; text: string }[];  // verbatim, character-for-character
  evidenceType: "explicit" | "derived" | "absent";
  ambiguities: string[];
}
```

Cache every response to disk keyed by `sha256(prompt + model)` **from the first call**, not later.

## Verification — this is the differentiator, ~60 lines

For every quote, in order:
1. exact substring match → `exact`
2. normalised match (collapse whitespace, fix ligatures, de-hyphenate line breaks, unify quotes and
   dashes) → `normalised`
3. fuzzy sliding window ≥ 0.92 → `fuzzy`, **and downgrade confidence one level**
4. no match → **discard the extraction entirely**, mark the field `UNCERTAIN` with reason
   `citation_unverifiable`, never display it

Derive the page number from the matched span's character offsets. **Never trust a page number the
model reports.** Store the span so the viewer can highlight it.

## Confidence — computed in code

| Level | When |
|---|---|
| `FOUND` | explicit, verified `exact`/`normalised`, no ambiguities, not from a low-confidence OCR span |
| `INFERRED` | derived — e.g. expiry computed from commencement + term. Citations still required for each input. |
| `UNCERTAIN` | ambiguities present, `fuzzy`-only citation, OCR confidence < 90 over the span, or a cap that cannot be reduced to one figure |
| `NOT_FOUND` | model says absent **and** no plausible candidate clause. "Contract is silent" ≠ "we couldn't read it" — the latter is `UNCERTAIN`. |

`tesseract.js` returns word-level confidence — map it onto the cited span. A field read off a bad
scan cannot be `FOUND`. This is the cheapest way to tie the scanned-document requirement to the
calibration score, and almost nobody does it.

## Deadlines — deterministic, no LLM

`actionDeadline = termEnd − noticeDays`. `termEnd` stated, or commencement + term (`INFERRED`).
Expand recurring payments across the 90-day window. Net-30-from-invoice is conditional — show it as
recurring with a caveat, not a hard date. Money in integer cents, currency stored separately.

If a notice period is expressed in business days, mark it `UNCERTAIN` and say why. Skipping the
holiday calendar is a calibration behaviour, not a gap.

## Conflict — exclusivity only

Normalise each grant to `{ grantee, type, territory, productScope, start, end, citations }`.

Encode the distinction, it is a cheap credibility win: **exclusive** (nobody else, usually including
the grantor) vs **sole** (grantor may still act, but appoints no one else) vs **non-exclusive**.

Flag when two grants overlap on territory ∧ product scope ∧ time window and at least one is
exclusive or sole. Overlap logic is deterministic; the LLM only normalises the scope language. A
conflict built on two `UNCERTAIN` fields is itself `UNCERTAIN` — propagate, never launder.

## Escalation and refusal

Fires on `UNCERTAIN` for liability / termination / exclusivity, or on any detected conflict:

```
REQUIRES LEGAL REVIEW · high

ISSUE          Liability appears capped at S$100,000, but the indemnity schedule may
               place IP infringement outside that cap.
DOCUMENTS      MSA cl. 11.2 p.14 · Indemnity Schedule cl. 12.4 p.3
ESTABLISHED    Cap of S$100,000 [cl. 11.2, verified]
               IP infringement is an indemnified matter [cl. 12.4, verified]
UNRESOLVED     Whether 12.4 sits inside or outside the 11.2 cap
QUESTION       Does the IP indemnity fall outside the general liability cap?
EXPOSURE       Uncapped if outside. Contract value S$40,000/yr.
```

Refuse — with a reason and a next step, never softening into a partial answer — when a question asks
for legal advice, predicts an outcome, depends on facts outside the corpus, or asks about a document
we have not ingested. The judges plant an unanswerable item; this is worth real points.

## Grounding, the MVP way

**Make no legal claims beyond the documents.** No statute references, no market norms, no
enforceability opinions. Every assertion cites a clause in a contract we ingested. That satisfies
"no un-anchored legal claims" by narrowing the claim surface rather than by building a citation
store — and it removes any chance of a fabricated external citation, which is scored as a serious
defect.

If a question needs law rather than contract, that is a refusal or an escalation.

## Eval — 60 lines, non-negotiable

`npm run eval` compares `results.json` to `ground-truth.json` and prints:

- Field accuracy, overall and per field
- Coverage — fraction answered `FOUND` or `INFERRED`
- **Confident Error Rate** — wrong ÷ total among `FOUND`. Target < 3%. Put it on the demo slide.
- **Hedge Precision** — of fields marked `UNCERTAIN`/`NOT_FOUND`, how many would have been wrong if
  asserted. Proves the hedging discriminates rather than being blanket caution.
- Citation verification rate; fabricated citations (must be 0)
- Refusal accuracy on the two planted questions

Write `eval-report.md`. Showing judges our own honest numbers is itself a differentiator.

## UI — one page

Left: 90-day calendar, **sorted by action deadline, not event date** — the deadline is what the user
can still act on. Right: contract list → detail panel. Click any field → PDF viewer opens at the
clause with the verified span highlighted.

- Every field: value + confidence chip + clause reference. No dead ends.
- Confidence chips always visible, never behind a hover.
- `UNCERTAIN` / `NOT_FOUND` render as full rows saying *why* ("cap has carve-outs in cl. 12.4"), not
  as blanks.
- Conflict banner at the top. Escalation briefs as cards below the calendar.
- No advisory phrasing ("you should terminate"). No absolutes ("has no exclusivity" → "no
  exclusivity provision identified"). Persistent non-dismissable note that this is not legal advice.

## Do not build

Chatbot or NL query · auth · database · file upload UI · retrieval/embeddings · two-pass agreement ·
business-day arithmetic · a second conflict class · risk scoring · missing-contract detection ·
CUAD validation · any real client documents.

## How to work

- **Read this spec back to me as a plan before writing code.**
- Timebox against the hour table. If a step runs 50% over, stop and tell me what to cut.
- **Never silently stub.** Unimplemented paths throw and the UI shows them unavailable. A
  fake-working demo is exactly what this rubric punishes.
- Tests only for: quote verification, date math, overlap logic. Fixtures, no live API calls.
- If you are about to write code that lets an unverified quote or an uncited claim reach the user,
  stop and tell me.
