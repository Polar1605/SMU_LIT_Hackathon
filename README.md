# CLARA

**C**ontract **L**iability **&** **A**greement **R**isk **A**ssistant. Reads a folder of an SME's
signed contracts and shows what the business is on the hook for and what is coming up — every field
traced to an exact clause, every answer carrying an honest confidence signal.

The user is not a lawyer and will not check the working. A dashboard that is 80% right and
presented with total confidence is worse than useless, so the design rule underneath everything
here is:

> **CLARA is never more confident than its evidence.**

Three consequences, enforced in code rather than asked of the model:

- **No quote reaches the user unless we located it in the source ourselves.** The model's quotes are
  re-found in our own extracted text. One that cannot be located destroys the field it supports.
- **No claim renders without a citation.**
- **"Uncertain" and "not found" are answers**, rendered as prominently as findings — and they are
  different answers. "The contract is silent" and "we could not read it" mean different things to
  someone deciding whether to call a lawyer.

## What it produces

Point it at a folder of contracts (PDF, DOCX, or scanned PDF) and it computes, offline:

- **Per contract** — parties, term (commencement / length / end), renewal mechanics and the notice
  period that governs them, termination rights (for cause and for convenience), payment obligations,
  liability cap, and any exclusivity or restrictive covenant. Each field carries a value, a
  confidence level (`FOUND` / `INFERRED` / `UNCERTAIN` / `NOT_FOUND`), and a citation to the exact
  clause and page, with the quoted text located in the source and the clause number read from the
  document's own numbering.
- **A 90-day forward calendar** — what expires, auto-renews or needs notice, sorted by the date
  action must be taken (`termEnd − noticeDays`), not the date the event happens.
- **Cross-contract conflicts** — an exclusivity grant that a later agreement breaches, and two
  contracts between the same parties whose terms contradict (different liability caps, disagreement
  on termination-for-convenience or exclusivity). Every step of the argument is individually cited.
- **Escalation briefs** for what needs a lawyer, and a **refusal path** for questions that ask for
  legal advice, predict outcomes, or concern a document not in the folder.

## Requirements

- **Node.js ≥ 20.9** (`.nvmrc` pins 22). npm comes with it.
- **~400 MB** of disk for `npm install` (`pdfjs-dist`, `tesseract.js`, `@napi-rs/canvas`).
- **An OpenAI API key** — *only* to extract a contract that is not already cached. Both bundled
  corpora ship with their responses cached on disk, so the steps below need no key. A key is needed
  only to run the pipeline over your own folder of contracts.
- No database, no Docker, no other services.

## Setup

```bash
git clone <repo> && cd clara
npm install

cp .env.local.example .env.local        # optional — only if running on your own contracts
# then edit .env.local and set OPENAI_API_KEY=sk-...

npm run cuad:pipeline                    # build the default view: 30 real CUAD contracts, from cache, no key
npm run dev                              # http://localhost:3000
```

To check the numbers this repo claims:

```bash
npm test              # 163 unit tests — verification, confidence, date maths, both conflict classes
npm run eval          # regenerates eval-report.md  (generated 6-contract corpus)
npm run cuad:eval     # regenerates eval-cuad.md     (30 CUAD contracts)
```

To run it over your own contracts (needs a key in `.env.local`):

```bash
npm run pipeline -- --corpus ./your-folder
```

## Our own numbers

There are two scoreboards, and the honest reading needs both.

**The generated corpus** — 6 contracts CLARA's own answer key produced, so it can carry no
annotation error, but it also cannot surprise the system. From `npm run eval`, full detail in
[`eval-report.md`](eval-report.md):

| | |
| --- | --- |
| **Confident error rate** | **0.0%** — 0 of 43 fields stated as fact were wrong (target: under 3%) |
| Field accuracy | 96.7% — 58 of 60 |
| Citations located in the source | 97 of 97, all exact matches |
| **Fabricated citations shown to the user** | **0**, by construction |
| Conflicts | 1 expected, 1 detected |
| Refusals | 3 of 3, including correctly *not* refusing an answerable question |

**CUAD** — 30 real commercial contracts annotated by lawyers, and the signal that actually
generalises. It is also the app's default view. From `npm run cuad:eval`, full detail in
[`eval-cuad.md`](eval-cuad.md):

| | |
| --- | --- |
| Agreement with the annotators, where CLARA committed | **85.1%** — 126 of 148 (88.7% excluding a `renewalType` mapping artefact) |
| Asserted a provision the lawyers record as absent | 19 of 93 assertions |
| Quotes located in the source | 1043 of 1048 (99.5%); 5 unlocatable → discarded |
| **Fabricated citations shown to the user** | **0** |
| Cited clause overlaps the annotated span | 96.6% — 115 of 119 |

This is the number to weigh: on unfamiliar drafting CLARA agrees with the annotators ~85% of the
time where it commits, and over-asserts on roughly one field in five where it does. The generated
corpus's 0% confident-error rate is a property of a closed loop, not a forecast.

On the generated corpus, the two fields not got plainly right are both hedges on the scanned
document, where OCR was unreliable over the span; both would have been correct had we asserted them.
Hedge precision is deliberately **withheld** rather than reported — with only two hedges a
percentage would be theatre — and the report gives the structural evidence instead.

## All the commands

```bash
npm run cuad:pipeline    # ingest -> extract -> compute -> cuad:eval, for the 30-contract default view
npm run pipeline         # the same, for the bundled 6-contract generated corpus (-> data/results.json)
npm run pipeline -- --corpus ./their-folder   # a folder we have never seen (needs a key)
npm run dev              # http://localhost:3000

npm run corpus       # regenerate the 6-contract corpus and answer key from the template
npm run ingest       # documents -> data/parsed
npm run extract      # one cached, structured call per document
npm run compute      # verify, score confidence, build calendar and both conflict classes
npm run eval         # generated-corpus scoreboard -> eval-report.md
npm run cuad:eval    # CUAD scoreboard -> eval-cuad.md
npm test             # 163 tests: verification, confidence, date maths, overlap, conflicts
npm run inspect      # what the corpus looks like to a reader
```

Everything the app shows is precomputed to JSON, and every model response is cached on disk from the
first call, so **a demo run makes no network requests**. The model defaults to `gpt-5`
(`CLARA_MODEL` overrides it); the committed `data/results.json` and the two eval reports were
produced on `gpt-5.5-2026-04-23` — a re-extraction on `gpt-5` has not been run yet.

## Scale

This is a batch job, not a request. Nobody watches a spinner: an SME drops their
contracts in during onboarding, and the dashboard is populated once and then read for
free. Every day after that costs one call per contract they add.

Extraction is embarrassingly parallel — no contract depends on another — so documents run
concurrently, defaulting to 8 and set with `--concurrency`. Measured on the six-contract
corpus:

| | 6 contracts |
| --- | --- |
| sequential | 582.4s |
| concurrency 8 | 208.8s |

That 2.8x is the floor rather than the ceiling: with fewer documents than the limit,
everything launches at once and wall time collapses to the single slowest document. The
ratio approaches the concurrency setting as the batch grows.

The binding constraint is the token-per-minute allowance rather than latency. At roughly
15k tokens a contract against a measured 500k TPM tier, 80 contracts is ~1.2M input tokens
— a floor of about 2.4 minutes — so latency dominates until roughly concurrency 30, and
~20 is the sweet spot. Below that ceiling, 80 contracts lands in single-digit minutes.

Two properties matter more than speed, and both fall out of the cache. Every completed
call is written to disk before anything else runs, so a failure at document 63 of 80
resumes at 63 instead of restarting. And because the cache key hashes the document text,
an unchanged file costs nothing on a re-run — which is what makes iterating on the eval
affordable. A document that fails is reported as unavailable rather than quietly omitted,
and never takes the rest of the batch down with it.

If a larger corpus ever became token-bound, the lever is retrieval — sending a handful of
targeted clauses instead of forty pages cuts input by 5-10x. That was cut from the MVP
because at six contracts it is dead weight, and the measurements above say it is still not
needed at 80.

## How it works

```
data/ground-truth.template.json     the answer key, written BEFORE any contract prose
  ↓ make-corpus     generates the six documents from it, then asserts they agree
  ↓ ingest          text + page offsets + per-word boxes; OCR for the scan
  ↓ extract         one structured call per contract, cached from the first call
  ↓ compute         verify every quote → confidence → deadlines → conflicts
  → data/results.json                the only file the app reads
  ↓ eval            → eval-report.md
```

**The invariant everything rests on** is that every citation is a character span into the text we
extracted. Page numbers, bounding boxes and OCR confidence are all derived from that span. The
model is never asked where its quote lives, and would not be believed if it said.

**Verification** (`lib/verify.ts`) tries exact, then normalised (whitespace, ligatures, line-break
hyphens, quotes, dashes, case), then fuzzy above 0.92 — which costs a confidence level — and
otherwise returns nothing, which forces the caller to destroy the extraction.

**The clause reference is read from the document, not the model.** Once a quote is located,
`verify.ts` scans the document's own numbering just before the span and takes the nearest clause
number or heading. The model's `clauseId` is only a fallback label, used when no marker is found —
and the citation records which of the two it was (`clauseSource`), so the UI can say when the
*label* (never the location) is the model's word. A reflowable DOCX still carries no page, and the
evidence panel shows a "no page anchor" badge rather than leaving that implicit.

**Confidence** (`lib/confidence.ts`) is a pure function of what verification found. A model's stated
confidence is a guess about itself; "this quote matched exactly, on a clean page, with no unresolved
carve-out" is a fact about evidence.

**Deadlines and conflicts** use no model at all. `actionDeadline = termEnd − noticeDays`, and the
calendar sorts by the date you must *act*, not the date the event happens — a renewal 74 days out
with 60 days' notice is a 14-day problem.

There are two conflict classes, both deterministic:

- **Exclusivity** (`lib/conflicts.ts`) — a grant to one party that a later grant to a different
  party breaches. Set intersection over normalised territory and product codes; the model only
  normalises the scope language.
- **Same-parties contradictory terms** (`lib/party-conflicts.ts`) — two contracts between the same
  parties, live at the same time, that state a different liability cap, or disagree on whether a
  right to terminate for convenience exists, or on whether the arrangement is exclusive. Entities
  are matched by exact normalised name, never fuzzily; the exclusivity-field case is suppressed
  when the exclusivity detector already owns that document pair.

Every conflict carries a `claims` list — the argument split into individual statements, each with
its own citations — so nothing a finding asserts is shown without a source. A conflict built on two
`UNCERTAIN` inputs is itself `UNCERTAIN`; uncertainty propagates and never launders.

## What the corpus is built to test

Six contracts, generated from the answer key so our scoreboard cannot inherit annotation errors.
Four PDFs, one DOCX, one scanned PDF with no text layer.

- **Cloud Subscription** — the hero. Auto-renews, 60 days' notice, and the notice period sits in
  clause 12.3 rather than beside the renewal clause it governs, so both must be joined. Says
  "exclusive of GST" as a trap for a naive exclusivity keyword probe.
- **Distribution A / B** — the planted conflict. Kestrel grants Apex *exclusive* Singapore rights
  over a product category, then appoints Lionbridge as *sole* distributor over the same scope.
- **Master Services Agreement** — the cap that will not settle. Clause 11.2 caps liability at
  S$100,000; clause 12.4 of an appended indemnity schedule may sit outside it. Correct answer:
  uncertain, and escalate. The cap clause splits mid-sentence across a page break.
- **Mutual NDA** — genuine silence. No exclusivity provision at all, so the answer is *not found*
  rather than *uncertain*. DOCX, so it has no fixed pagination and says so instead of inventing a
  page number.
- **Supply Agreement** — scanned, skewed and noisy. Notice in *business days*, which we refuse to
  turn into a date because we hold no public-holiday calendar; and a net-30-from-invoice term with
  no invoice date, which is shown as an obligation with no due date rather than a guess.

## Deliberately not built

Chatbot or natural-language query, authentication, a database, retrieval or embeddings,
business-day arithmetic, risk scoring, missing-contract detection, a third conflict class.

No legal claim is made beyond the documents: no statutes, no market norms, no view on
enforceability. That narrows the claim surface enough to make a fabricated external citation
impossible rather than merely unlikely. A question needing law rather than contract is a refusal or
an escalation.

Unimplemented paths throw and the interface reports them unavailable. Nothing is stubbed to look
like it works.
