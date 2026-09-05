# AITHENA

Reads a folder of an SME's signed contracts and shows what the business is on the hook for and
what is coming up — every field traced to an exact clause, every answer carrying an honest
confidence signal.

The user is not a lawyer and will not check the working. A dashboard that is 80% right and
presented with total confidence is worse than useless, so the design rule underneath everything
here is:

> **AITHENA is never more confident than its evidence.**

Three consequences, enforced in code rather than asked of the model:

- **No quote reaches the user unless we located it in the source ourselves.** The model's quotes are
  re-found in our own extracted text. One that cannot be located destroys the field it supports.
- **No claim renders without a citation.**
- **"Uncertain" and "not found" are answers**, rendered as prominently as findings — and they are
  different answers. "The contract is silent" and "we could not read it" mean different things to
  someone deciding whether to call a lawyer.

## Our own numbers

From `npm run eval`, which compares `data/results.json` to the answer key. Full detail in
[`eval-report.md`](eval-report.md).

| | |
| --- | --- |
| **Confident error rate** | **0.0%** — 0 of 43 fields stated as fact were wrong (target: under 3%) |
| Field accuracy | 96.7% — 58 of 60 |
| Citations located in the source | 97 of 97, all exact matches |
| **Fabricated citations shown to the user** | **0**, by construction |
| Conflicts | 1 expected, 1 detected |
| Refusals | 3 of 3, including correctly *not* refusing an answerable question |

The two fields we did not get plainly right are both hedges on the scanned document, where optical
character recognition was unreliable over the span. Both would have been correct had we asserted
them. We chose the honest behaviour over the higher number, and the report says so by name.

Hedge precision is deliberately **withheld** rather than reported: with only two hedges, a
percentage would be theatre. The report explains what the number is for and gives the structural
evidence instead.

## Running it

```bash
npm install
npm run pipeline                              # the bundled six-contract corpus
npm run pipeline -- --corpus ./their-folder   # a folder we have never seen
npm run dev                                   # then open http://localhost:3000
```

Everything the app shows is precomputed into `data/results.json`, and every model response is
cached on disk from the first call. **The demo makes no network requests and cannot fail on stage.**

Other commands:

```bash
npm run corpus     # regenerate the corpus and answer key from the template
npm run ingest     # documents -> data/parsed
npm run extract    # one cached, structured call per document
npm run compute    # verify, score confidence, build calendar and conflicts
npm run eval       # our own scoreboard -> eval-report.md
npm test           # 140 tests: verification, confidence, date maths, overlap
npm run inspect    # what the corpus looks like to a reader
```

`OPENAI_API_KEY` is needed only to extract documents not already in the cache. A cache miss without
a key throws rather than inventing an extraction.

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

**Confidence** (`lib/confidence.ts`) is a pure function of what verification found. A model's stated
confidence is a guess about itself; "this quote matched exactly, on a clean page, with no unresolved
carve-out" is a fact about evidence.

**Deadlines and conflicts** use no model at all. `actionDeadline = termEnd − noticeDays`, and the
calendar sorts by the date you must *act*, not the date the event happens — a renewal 74 days out
with 60 days' notice is a 14-day problem. Exclusivity conflicts are set intersection over normalised
territory and product codes; the model only normalises the scope language.

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

Chatbot or natural-language query, authentication, a database, file upload, retrieval or embeddings,
business-day arithmetic, a second conflict class, risk scoring, missing-contract detection.

No legal claim is made beyond the documents: no statutes, no market norms, no view on
enforceability. That narrows the claim surface enough to make a fabricated external citation
impossible rather than merely unlikely. A question needing law rather than contract is a refusal or
an escalation.

Unimplemented paths throw and the interface reports them unavailable. Nothing is stubbed to look
like it works.
