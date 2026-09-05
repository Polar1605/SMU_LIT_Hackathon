# AITHENA evaluation

Generated 2026-09-05T06:21:06.281Z · model gpt-5.5-2026-04-23 · as of 2026-09-05

## Citations

| metric | value |
| --- | --- |
| Quotes returned by the model | 97 |
| Located in the source document | 97 (100.0%) |
| — exact match | 97 |
| — normalised match | 0 |
| — fuzzy match (confidence downgraded) | 0 |
| Discarded as unverifiable | 0 |
| **Fabricated citations shown to the user** | **0** |

The last row is 0 by construction rather than by luck: a quote that cannot be located is never rendered, and the field that depended on it is reported as uncertain instead.

## Headline

| metric | value | what it means |
| --- | --- | --- |
| **Confident error rate** | **0.0%** | 0 of 43 fields stated as fact were wrong. Target under 3%. |
| **Hedge precision** | **too few to measure** | Of 2 fields we declined to commit on, 0 would have been wrong had we committed. Intended to show the caution discriminates. |
| Field accuracy | 96.7% | 58 of 60 fields graded correct. |
| Coverage | 96.7% | Fields where we gave a usable answer, counting a correct "contract is silent" as an answer. |

**On hedge precision.** 2 hedges is not a sample, and a percentage over it would be theatre. The figure is withheld rather than dressed up. What the number is for is catching a system that hedges indiscriminately, and the evidence against that here is structural instead: of 60 fields, 10 are reported as the contract being silent and 2 as genuinely unresolved — each matching the answer key, rather than uncertainty sprayed across the board. Measuring hedge precision properly needs a corpus with more genuinely ambiguous drafting than six contracts carry.

## Grade breakdown

| grade | count | meaning |
| --- | --- | --- |
| correct | 58 | Right value, or correctly reported as silent or unresolved. |
| wrong | 0 | Asserted and incorrect. Every one of these is a confident error. |
| hedge justified | 0 | We hedged, and committing would have been wrong. |
| hedge unnecessary | 2 | We hedged where the answer was knowable. Over-caution. |
| missed | 0 | Reported as silent when the contract does say something. |

## Per field

| field | correct | wrong | hedged | missed |
| --- | --- | --- | --- | --- |
| parties | 5/6 | 0 | 1 | 0 |
| commencementDate | 6/6 | 0 | 0 | 0 |
| termLength | 6/6 | 0 | 0 | 0 |
| termEnd | 6/6 | 0 | 0 | 0 |
| renewalType | 6/6 | 0 | 0 | 0 |
| renewalNoticeDays | 6/6 | 0 | 0 | 0 |
| terminationForConvenience | 6/6 | 0 | 0 | 0 |
| terminationForCause | 6/6 | 0 | 0 | 0 |
| liabilityCap | 5/6 | 0 | 1 | 0 |
| exclusivity | 6/6 | 0 | 0 | 0 |

## Every field we did not get plainly right

- **supplier-agreement-scanned / parties** — hedge-unnecessary, reported as UNCERTAIN
  - expected: Meridian Retail Pte Ltd (Buyer) and Foundry Components Pte Ltd (Supplier)
  - reported: MERIDIAN RETAIL PTE LTD (Buyer) and FOUNDRY COMPONENTS PTE LTD (Supplier).
  - would have said: MERIDIAN RETAIL PTE LTD (Buyer) and FOUNDRY COMPONENTS PTE LTD (Supplier).
- **supplier-agreement-scanned / liabilityCap** — hedge-unnecessary, reported as UNCERTAIN
  - expected: S$75,000
  - reported: Supplier's total liability to Buyer is capped at S$75,000, except liability for death or personal injury caused by negligence or for fraud.
  - would have said: Supplier's total liability to Buyer is capped at S$75,000, except liability for death or personal injury caused by negligence or for fraud.

## Cross-contract conflicts

Expected 1, detected 1, matched 1.
- [UNCERTAIN] "Exclusive Distribution Agreement" grants Apex Scientific Pte Ltd exclusive rights (nobody else may act in that scope, normally including the grantor itself) over product CATX in territory SG. "Distribution Agreement" grants Lionbridge Distribution Pte Ltd sole rights (the grantor may still act itself, but promises to appoint nobody else) over the same product CATX in territory SG. The two grants overlap between 8 May 2026 and 1 Aug 2028. The exclusive grant to Apex Scientific Pte Ltd forbids any other appointment in that scope, yet Lionbridge Distribution Pte Ltd has been appointed for the same territory, product and period — and a sole appointment is still an appointment. Honouring the second breaches the first.

## Escalations

3 brief(s) produced; 2 expected.
- [high] msa-liabilityCap — Master Services Agreement states liability cap as Consultant’s total aggregate liability to Client is capped at S$100,000., but the position is not settled by the document.
- [high] supplier-agreement-scanned-liabilityCap — Supply Agreement (scanned) states liability cap as Supplier's total liability to Buyer is capped at S$75,000, except liability for death or personal injury caused by negligence or for fraud., but the position is not settled by the document.
- [high] conflict-conflict:distribution-a::distribution-a-grant-0|distribution-b::distribution-b-grant-0:SG+CATX — "Exclusive Distribution Agreement" grants Apex Scientific Pte Ltd exclusive rights (nobody else may act in that scope, normally including the grantor itself) over product CATX in territory SG. "Distribution Agreement" grants Lionbridge Distribution Pte Ltd sole rights (the grantor may still act itself, but promises to appoint nobody else) over the same product CATX in territory SG. The two grants overlap between 8 May 2026 and 1 Aug 2028. The exclusive grant to Apex Scientific Pte Ltd forbids any other appointment in that scope, yet Lionbridge Distribution Pte Ltd has been appointed for the same territory, product and period — and a sole appointment is still an appointment. Honouring the second breaches the first.

## Refusals

3/3 correct.

- correct — `q-legal-advice`: expected legal-advice, got legal-advice
- correct — `q-not-ingested`: expected document-not-ingested, got document-not-ingested
- correct — `q-answerable-control`: expected an answer, got an answer

The third item is answerable from ingested clauses and is included deliberately: a system that refuses everything would score full marks on the two planted questions while being useless.

