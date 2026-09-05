# The 10 real contracts AITHENA was tested against

These are the exact PDFs put through the pipeline. Nothing here was written by us.

**Source:** CUAD — the Contract Understanding Atticus Dataset, by The Atticus Project. 510 real
commercial contracts annotated by lawyers across 41 clause types.

- https://www.atticusprojectai.org/datasets
- https://github.com/TheAtticusProject/cuad

**Licence:** CC BY 4.0. Attribution to The Atticus Project.

Results are in [`eval-cuad.md`](../../../eval-cuad.md) at the repository root.

| # | contract | pages | fields CUAD annotates |
| --- | --- | --- | --- |
| 01 | SECURIAN FUNDS TRUST — Net Investment Income Maintenance Agreement (2012) | 4 | 7/8 |
| 02 | CURAEGIS TECHNOLOGIES — Corporate Sponsorship Agreement (2010) | 3 | 6/8 |
| 03 | LUCID INC — Distributor Agreement (2011) | 8 | 5/8 |
| 04 | NETZEE INC — Maintenance Agreement (2002) | 1 | 7/8 |
| 05 | Pcquote.com — Co-Branding Agreement 2 (1999) | 2 | 5/8 |
| 06 | NETGEAR — Amendment to Distributor Agreement with Ingram Micro (2003) | 2 | 5/8 |
| 07 | Pcquote.com — Co-Branding Agreement 3 (1999) | 2 | 5/8 |
| 08 | GAINSCO INC — Sponsorship Agreement (2010) | 6 | 6/8 |
| 09 | CANO PETROLEUM — Sponsorship Agreement (2007) | 4 | 6/8 |
| 10 | TICKETS.COM — Sponsorship Agreement (1999) | 2 | 6/8 |

## How these ten were chosen

The smallest documents among those where CUAD annotates at least 5 of the 8 fields we extract.
That biases the sample twice — towards shorter contracts, which are the easier end of the
distribution, and towards contracts where the annotators made a determination. It is a probe of
whether the approach survives real drafting, not a validation against CUAD's full 510.

## Worth knowing

**09 CANO PETROLEUM contains a scanned page** with no text layer. The pipeline detected it by
character count and read it with optical character recognition without being told to — the same
path the synthetic scanned document exercises, but on a document we did not construct.

**04 NETZEE is a single page** and **03 LUCID is eight**, so the set spans a reasonable range of
structure despite all being at the shorter end.

Two of our ten fields are not scored here at all. `termLength` and `terminationForCause` have no
CUAD equivalent, and mapping them onto an approximate category would be worse than leaving them
out. A third, `renewalType`, is scored but reported separately: our field asks how an agreement
renews and CUAD's `Renewal Term` asks what the renewal period is, so "does not renew
automatically" is a real answer for us and an absence for them.
