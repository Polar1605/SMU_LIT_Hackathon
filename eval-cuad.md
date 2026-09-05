# CLARA against CUAD

30 real commercial contracts from the Contract Understanding Atticus Dataset, annotated by lawyers. Scored on 8 of our 10 fields — `termLength` and `terminationForCause` have no CUAD equivalent and mapping them onto an approximate category would be worse than leaving them out.

Generated 2026-09-05T17:31:04.828Z · model gpt-5.5-2026-04-23

## What this sample is, and is not

These are the 30 smallest contracts among those with at least 5 of our fields annotated. That biases the sample twice — towards shorter documents, which are the easier end of the distribution, and towards contracts where the annotators made a determination. It is a probe, not a validation of CUAD's 510.

## Verification: could we find the quotes in the source?

| | |
| --- | --- |
| Quotes the model returned | 1048 |
| Located in the source document | 1043 (99.5%) |
| — exact | 1035 |
| — normalised | 3 |
| — fuzzy, confidence downgraded | 5 |
| **Discarded as unlocatable** | **5** |
| **Fabricated citations shown to a user** | **0** |

The discards matter more than the rate. On our own generated corpus this path never fired, which left open whether it was decorative. Here 5 quotes the model produced could not be found in the document it claimed to be quoting, so the fields depending on them had the value destroyed and were reported as uncertain rather than shown. The normalised and fuzzy tiers also fired for the first time here.

## Presence: is the provision there at all?

Of 240 field judgements, we committed to 148 and hedged on 92.

| metric | value |
| --- | --- |
| Agreement with the annotators, where we committed | 85.1% (126/148) |
| **Asserted a provision the lawyers say is absent** | **19** of 93 assertions |
| Reported absent where the lawyers found one | 3 of 55 |
| Hedged where the provision is genuinely absent | 49 of 92 |

Excluding `renewalType`, whose CUAD category asks a different question (see below): **88.7%** agreement (110/124), with **11** of 78 assertions contradicting the annotators.

## Citations: did we point at the right clause?

| Our cited text overlaps the annotated span | 96.6% (115/119) |
| --- | --- |

Measured only where both we and the annotators cite something (119 of 240 judgements). Overlap is generous: containment either way, or 60% of the annotated span's substantive words appearing in ours.

## Per field

| field | committed | agreed | asserted-but-absent | hedged | cited right |
| --- | --- | --- | --- | --- | --- |
| parties | 27/30 | 27 | 0 | 3 | 30/30 |
| commencementDate | 21/30 | 20 | 1 | 9 | 25/27 |
| termEnd | 11/30 | 11 | 0 | 19 | 23/25 |
| renewalType | 24/30 | 16 | 8 | 6 | 8/8 |
| renewalNoticeDays | 22/30 | 21 | 1 | 8 | 1/1 |
| terminationForConvenience | 19/30 | 13 | 6 | 11 | 9/9 |
| liabilityCap | 14/30 | 11 | 0 | 16 | 11/11 |
| exclusivity | 10/30 | 7 | 3 | 20 | 8/8 |

## Every disagreement

Five, listed in full. Three concern `renewalType`, where our field asks how an agreement renews and CUAD's asks what the renewal period is — so "does not renew automatically" is a real answer for us and an absence for them. That is a mapping artefact. The other two are genuine disagreements worth looking at.

- **ArcaUsTreasuryFund_20200207_N-2_EX-99.K5_119 / terminationForConvenience** — we said FOUND, CUAD records it as absent
  - we reported: The Fund, by majority outstanding voting securities or Trustees, or the Blockchain Administrator may terminate at any time without penalty o
- **ArcaUsTreasuryFund_20200207_N-2_EX-99.K5_119 / exclusivity** — we said FOUND, CUAD records it as absent
  - we reported: Non-exclusive; Blockchain Administrator and affiliates may render services to others.
- **AtnInternationalInc_20191108_10-Q_EX-10.1_11 / terminationForConvenience** — we said FOUND, CUAD records it as absent
  - we reported: Neither Party may terminate for convenience.
- **CURAEGISTECHNOLOGIES,INC_05_26_2010-EX-1-COR / renewalType** — we said FOUND, CUAD records it as absent
  - we reported: Only by agreement; amendments/alterations must be by written agreement. No automatic renewal is stated.
- **DRAGONSYSTEMSINC_01_08_1999-EX-10.17-OUTSOUR / renewalType** — we said INFERRED, CUAD records it as absent
  - we reported: No renewal mechanism; agreement is valid for an indefinite period until terminated
- **DRAGONSYSTEMSINC_01_08_1999-EX-10.17-OUTSOUR / liabilityCap** — we said NOT_FOUND, CUAD records "Yes"
- **GAINSCOINC_01_21_2010-EX-10.41-SPONSORSHIP A / renewalType** — we said INFERRED, CUAD records it as absent
  - we reported: No renewal mechanism stated; fixed term through 2010-12-31.
- **GluMobileInc_20070319_S-1A_EX-10.09_436630_E / renewalType** — we said FOUND, CUAD records it as absent
  - we reported: No automatic renewal; the Term expires on 2006-12-31, subject to per-Property continuation for 18 months after theatrical release.
- **GluMobileInc_20070319_S-1A_EX-10.09_436630_E / liabilityCap** — we said NOT_FOUND, CUAD records "Yes"
- **InvendaCorp_20000828_S-1A_EX-10.2_2588206_EX / terminationForConvenience** — we said FOUND, CUAD records it as absent
  - we reported: No unrestricted at-will termination right. Conditional no-fault rights: either party may terminate on 30 days if federal privacy/User Data l
- **LEJUHOLDINGSLTD_03_12_2014-EX-10.34-INTERNET / renewalType** — we said FOUND, CUAD records it as absent
  - we reported: No automatic renewal; continuation requires a further agreement, with Party B having a preferential right if all conditions are equal.
- **LEJUHOLDINGSLTD_03_12_2014-EX-10.34-INTERNET / terminationForConvenience** — we said FOUND, CUAD records it as absent
  - we reported: Party B may terminate without stated cause by written notice to Party A within three months before the 4th anniversary of the agreement date
- **LOOKSMARTLTD_07_20_2012-EX-99.(D)(I)-SPONSOR / terminationForConvenience** — we said FOUND, CUAD records it as absent
  - we reported: Agreement may be sooner terminated by unanimous written consent of the Participating Sponsors; no notice period stated.
- **LUCIDINC_04_15_2011-EX-10.9-DISTRIBUTOR AGRE / renewalNoticeDays** — we said INFERRED, CUAD records it as absent
  - we reported: 90 days
- **MJBIOTECH,INC_12_06_2018-EX-99.01-JOINT VENT / liabilityCap** — we said NOT_FOUND, CUAD records "Yes"
- **NEONSYSTEMSINC_03_01_1999-EX-10.5-DISTRIBUTO / terminationForConvenience** — we said FOUND, CUAD records it as absent
  - we reported: Either party may terminate/non-renew at the end of the original or any renewal term by written notice at least 60 days before term end; no e
- **RaeSystemsInc_20001114_10-Q_EX-10.57_2631790 / exclusivity** — we said FOUND, CUAD records it as absent
  - we reported: No exclusive or sole rights stated; the brand-feature licenses granted are non-exclusive/nonexclusive worldwide licenses.
- **SPOKHOLDINGS,INC_06_19_2020-EX-10.1-COOPERAT / commencementDate** — we said FOUND, CUAD records it as absent
  - we reported: 2020-06-18
- **SPOKHOLDINGS,INC_06_19_2020-EX-10.1-COOPERAT / renewalType** — we said FOUND, CUAD records it as absent
  - we reported: No renewal; the Agreement automatically terminates in its entirety upon expiration of the Support Period unless earlier terminated.
- **TICKETSCOMINC_06_22_1999-EX-10.22-SPONSORSHI / renewalType** — we said FOUND, CUAD records it as absent
  - we reported: Not automatic; Tickets has the right to renew for another year during a 30-day period beginning 30 days before the first anniversary.
- **TICKETSCOMINC_06_22_1999-EX-10.22-SPONSORSHI / exclusivity** — we said FOUND, CUAD records it as absent
  - we reported: During the term, Tickets.com, Inc. is MP3.com, Inc.'s exclusive partner/source for sports, entertainment, and travel tickets on specified We
- **VAXCYTE,INC_05_22_2020-EX-10.19-SUPPLY AGREE / renewalType** — we said FOUND, CUAD records it as absent
  - we reported: Not automatic; no renewal mechanism is stated. The agreement instead continues until the Section 10.1 end condition unless earlier terminate

## Confidence distribution across all 10 fields

FOUND 107 · INFERRED 11 · UNCERTAIN 120 · NOT_FOUND 62

