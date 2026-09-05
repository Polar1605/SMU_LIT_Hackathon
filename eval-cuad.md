# AITHENA against CUAD

10 real commercial contracts from the Contract Understanding Atticus Dataset, annotated by lawyers. Scored on 8 of our 10 fields — `termLength` and `terminationForCause` have no CUAD equivalent and mapping them onto an approximate category would be worse than leaving them out.

Generated 2026-09-05T07:58:06.311Z · model gpt-5.5-2026-04-23

## What this sample is, and is not

These are the 10 smallest contracts among those with at least 5 of our fields annotated. That biases the sample twice — towards shorter documents, which are the easier end of the distribution, and towards contracts where the annotators made a determination. It is a probe, not a validation of CUAD's 510.

## Presence: is the provision there at all?

Of 80 field judgements, we committed to 53 and hedged on 27.

| metric | value |
| --- | --- |
| Agreement with the annotators, where we committed | 90.6% (48/53) |
| **Asserted a provision the lawyers say is absent** | **5** of 33 assertions |
| Reported absent where the lawyers found one | 0 of 20 |
| Hedged where the provision is genuinely absent | 18 of 27 |

Excluding `renewalType`, whose CUAD category asks a different question (see below): **95.7%** agreement (44/46), with **2** of 27 assertions contradicting the annotators.

## Citations: did we point at the right clause?

| Our cited text overlaps the annotated span | 100.0% (39/39) |
| --- | --- |

Measured only where both we and the annotators cite something (39 of 80 judgements). Overlap is generous: containment either way, or 60% of the annotated span's substantive words appearing in ours.

## Per field

| field | committed | agreed | asserted-but-absent | hedged | cited right |
| --- | --- | --- | --- | --- | --- |
| parties | 8/10 | 8 | 0 | 2 | 10/10 |
| commencementDate | 7/10 | 7 | 0 | 3 | 9/9 |
| termEnd | 6/10 | 6 | 0 | 4 | 7/7 |
| renewalType | 7/10 | 4 | 3 | 3 | 4/4 |
| renewalNoticeDays | 7/10 | 6 | 1 | 3 | n/a |
| terminationForConvenience | 8/10 | 8 | 0 | 2 | 3/3 |
| liabilityCap | 5/10 | 5 | 0 | 5 | 4/4 |
| exclusivity | 5/10 | 4 | 1 | 5 | 2/2 |

## Every disagreement

Five, listed in full. Three concern `renewalType`, where our field asks how an agreement renews and CUAD's asks what the renewal period is — so "does not renew automatically" is a real answer for us and an absence for them. That is a mapping artefact. The other two are genuine disagreements worth looking at.

- **CURAEGISTECHNOLOGIES,INC_05_26_2010-EX-1-COR / renewalType** — we said FOUND, CUAD records it as absent
  - we reported: Only by agreement; amendments/alterations must be by written agreement. No automatic renewal is stated.
- **GAINSCOINC_01_21_2010-EX-10.41-SPONSORSHIP A / renewalType** — we said INFERRED, CUAD records it as absent
  - we reported: No renewal mechanism stated; fixed term through 2010-12-31.
- **LUCIDINC_04_15_2011-EX-10.9-DISTRIBUTOR AGRE / renewalNoticeDays** — we said INFERRED, CUAD records it as absent
  - we reported: 90 days
- **TICKETSCOMINC_06_22_1999-EX-10.22-SPONSORSHI / renewalType** — we said FOUND, CUAD records it as absent
  - we reported: Not automatic; Tickets has the right to renew for another year during a 30-day period beginning 30 days before the first anniversary.
- **TICKETSCOMINC_06_22_1999-EX-10.22-SPONSORSHI / exclusivity** — we said FOUND, CUAD records it as absent
  - we reported: During the term, Tickets.com, Inc. is MP3.com, Inc.'s exclusive partner/source for sports, entertainment, and travel tickets on specified We

## Confidence distribution across all 10 fields

FOUND 38 · INFERRED 6 · UNCERTAIN 31 · NOT_FOUND 25

