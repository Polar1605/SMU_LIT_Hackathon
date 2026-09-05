/**
 * Prose for the six corpus contracts, generated FROM the resolved answer key.
 *
 * Each builder writes in a deliberately different voice, and the difficulty is
 * planted on purpose rather than sprinkled: a notice period held apart from the
 * renewal clause it governs, a product scope reachable only through a schedule
 * cross-reference, a liability cap whose carve-out lives in an appended
 * schedule, a genuinely silent NDA, and a notice period in business days.
 *
 * Curly quotes and en-dashes below are intentional: they survive into the PDF
 * text layer and give the normalised-match tier of verify.ts real work to do.
 */

import type { DocSpec, Clause } from "./render-pdf.ts";
import { longDate, money, spelled, type ResolvedContract } from "./ground-truth.ts";

type Builder = (gt: ResolvedContract) => DocSpec;

function date(gt: ResolvedContract, fieldId: string): string {
  const value = gt.fields[fieldId]?.value;
  if (!value) throw new Error(`${gt.docId}: field "${fieldId}" has no resolved date`);
  return longDate(value);
}

const GOVERNING_LAW: Clause = {
  id: "Governing law",
  unnumbered: true,
  heading: "GOVERNING LAW AND JURISDICTION",
  body: "This Agreement is governed by the laws of Singapore. The parties submit to the exclusive jurisdiction of the courts of Singapore in respect of any dispute arising out of or in connection with it.",
};

/* ------------------------------------------------------------------------- */
/* 1. SaaS subscription — the hero. Notice period deliberately parked in 12.3 */
/* ------------------------------------------------------------------------- */

const saasSubscription: Builder = (gt) => ({
  docId: gt.docId,
  title: "Cloud Subscription Agreement",
  subtitle: "Between Meridian Retail Pte Ltd and Northwind Cloud Systems Pte Ltd",
  font: "helvetica",
  clauses: [
    {
      id: "Parties",
      unnumbered: true,
      heading: "PARTIES",
      body: `This Cloud Subscription Agreement is made between Meridian Retail Pte Ltd (UEN 201812345K), a company incorporated in Singapore whose registered office is at 8 Cross Street, Singapore 048424 (the “Customer”), and Northwind Cloud Systems Pte Ltd (UEN 201655321H), whose registered office is at 71 Robinson Road, Singapore 068895 (the “Supplier”).`,
    },
    {
      id: "1",
      heading: "Definitions",
      body: `“Platform” means the Supplier’s hosted inventory management service made available to the Customer under this Agreement.

“Subscription Period” means the Initial Subscription Period and each Renewal Period.

“Subscription Fee” means the fee payable by the Customer for access to the Platform, as set out in clause 5.1.`,
    },
    {
      id: "2",
      heading: "Provision of the Platform",
      body: `The Supplier shall make the Platform available to the Customer during each Subscription Period in accordance with the service levels set out in the Support Policy published at the Supplier’s customer portal, as amended from time to time.

The Customer is responsible for the accuracy of data it uploads to the Platform and for maintaining the confidentiality of the credentials issued to its personnel.`,
    },
    {
      id: "3.1",
      heading: "Term",
      body: `This Agreement commences on ${date(gt, "commencementDate")} (the “Commencement Date”) and continues for an initial period of ${spelled(12)} months (the “Initial Subscription Period”).`,
    },
    {
      id: "3.2",
      heading: "Renewal",
      body: `On expiry of the Initial Subscription Period this Agreement shall automatically renew for successive periods of ${spelled(12)} months (each a “Renewal Period”), unless a party gives notice to prevent renewal in accordance with clause 12.3.

Each Renewal Period is on the same terms as the then-current Subscription Period, save that the Supplier may increase the Subscription Fee by not more than five per cent (5%) on each renewal.`,
    },
    {
      id: "4",
      heading: "Support",
      body: `The Supplier shall provide technical support during Singapore business hours and shall respond to a priority one incident within two (2) hours of it being reported through the customer portal.`,
    },
    {
      id: "5.1",
      heading: "Fees",
      body: `The Subscription Fee is ${money(4000000, "SGD")} per annum, exclusive of GST, payable annually in advance on the Commencement Date and on each anniversary of the Commencement Date.

Invoices are payable within thirty (30) days of the date of invoice. The Supplier may suspend access to the Platform where an invoice remains unpaid for more than sixty (60) days after its due date.`,
    },
    {
      id: "6",
      heading: "Customer data",
      body: `The Customer retains all right, title and interest in data it uploads to the Platform. On termination the Supplier shall, on written request made within thirty (30) days of termination, return that data in a machine-readable format.`,
    },
    {
      id: "10.1",
      heading: "Exclusions",
      body: `Neither party excludes or limits its liability for death or personal injury caused by its negligence, for fraud or fraudulent misrepresentation, or for any other liability which cannot lawfully be limited.`,
    },
    {
      id: "10.2",
      heading: "Limitation of liability",
      body: `Subject to clause 10.1, the total aggregate liability of either party under or in connection with this Agreement, whether arising in contract, tort (including negligence) or otherwise, shall not exceed ${money(12000000, "SGD")}.`,
    },
    {
      id: "11",
      heading: "Confidentiality",
      body: `Each party shall keep confidential the commercial and technical information of the other party disclosed under this Agreement and shall not use it other than for the purposes of this Agreement.`,
    },
    {
      id: "12.1",
      heading: "Termination for convenience",
      body: `The Customer may terminate this Agreement for convenience by giving the Supplier not less than ${spelled(90)} days’ written notice, provided that such termination shall take effect only at the end of the then-current Subscription Period.`,
    },
    {
      id: "12.2",
      heading: "Termination for cause",
      body: `Either party may terminate this Agreement by written notice with immediate effect where the other party is in material breach of it and has failed to remedy that breach within ${spelled(30)} days of being required in writing to do so.`,
    },
    {
      id: "12.3",
      heading: "Notice to prevent renewal",
      body: `A party which does not wish this Agreement to renew must give written notice to that effect not less than ${spelled(60)} days before the end of the then-current Subscription Period.

Notice given later than the date required by this clause shall not prevent the renewal then in progress, and shall instead take effect at the end of the following Renewal Period.`,
    },
    GOVERNING_LAW,
  ],
});

/* ------------------------------------------------------------------------- */
/* 2. Distribution A — exclusive. Product scope only via Schedule 1.          */
/* ------------------------------------------------------------------------- */

const distributionA: Builder = (gt) => ({
  docId: gt.docId,
  title: "Exclusive Distribution Agreement",
  subtitle: "Between Kestrel Instruments Limited and Apex Scientific Pte Ltd",
  font: "times",
  clauses: [
    {
      id: "Parties",
      unnumbered: true,
      heading: "PARTIES",
      body: `THIS AGREEMENT is made between Kestrel Instruments Limited, a company incorporated in England and Wales (company number 09182773) whose registered office is at 14 Wellington Court, Reading RG1 8DB, United Kingdom (the “Supplier”), and Apex Scientific Pte Ltd (UEN 201409876M), whose registered office is at 3 Science Park Drive, Singapore 118223 (the “Distributor”).`,
    },
    {
      id: "1",
      heading: "Definitions and interpretation",
      body: `In this Agreement, unless the context otherwise requires, the following expressions shall have the following meanings:

“Products” means those goods of the Supplier falling within Product Category X, as that category is more particularly described in Schedule 1 to this Agreement.

“Territory” means the Republic of Singapore.

“Term” has the meaning given in clause 2.1.`,
    },
    {
      id: "2.1",
      heading: "Term",
      body: `This Agreement shall commence on ${date(gt, "commencementDate")} and shall continue, subject to earlier termination in accordance with clause 14, for a period of ${spelled(36)} months, expiring on ${date(gt, "termEnd")}.`,
    },
    {
      id: "2.2",
      heading: "Renewal",
      body: `This Agreement shall not renew automatically. Any extension or renewal of the Term shall be effective only if agreed by the parties in writing and signed by an authorised signatory of each of them.`,
    },
    {
      id: "3.1",
      heading: "Appointment",
      body: `The Supplier hereby appoints the Distributor as its exclusive distributor for the sale of the Products in the Territory, and the Distributor accepts that appointment.

During the Term the Supplier shall not appoint any other person, firm or company as a distributor, agent or reseller of the Products in the Territory, and shall not itself sell or supply the Products to any customer in the Territory otherwise than through the Distributor.`,
    },
    {
      id: "3.2",
      heading: "Distributor’s undertakings",
      body: `The Distributor shall use all reasonable endeavours to promote and increase the sale of the Products in the Territory, shall maintain sufficient stocks to meet anticipated demand, and shall not, without the prior written consent of the Supplier, sell the Products to any person outside the Territory.`,
    },
    {
      id: "8.4",
      heading: "Marketing contribution",
      body: `The Distributor shall pay to the Supplier an annual marketing contribution of ${money(2500000, "SGD")} on 1 April in each year of the Term, against which the Supplier shall apply co-operative advertising expenditure in the Territory.`,
    },
    {
      id: "13.3",
      heading: "Limitation of liability",
      body: `Save in respect of liability which cannot lawfully be limited, the aggregate liability of each party to the other under or in connection with this Agreement, whether in contract, tort (including negligence), for breach of statutory duty or otherwise, shall in no event exceed ${money(50000000, "SGD")}.`,
    },
    {
      id: "14.1",
      heading: "Termination for convenience",
      body: `Either party may terminate this Agreement at any time by giving to the other not less than ${spelled(6)} months’ written notice, such notice to expire at any time.`,
    },
    {
      id: "14.2",
      heading: "Termination for cause",
      body: `Either party may terminate this Agreement immediately by written notice where the other party enters into liquidation, has a receiver or administrator appointed over any of its assets, or is otherwise unable to pay its debts as they fall due.

Either party may also terminate this Agreement by written notice where the other party commits a material breach of it and fails to remedy that breach within ${spelled(30)} days of written notice requiring it to do so.`,
    },
    {
      id: "Schedule 1",
      unnumbered: true,
      heading: "SCHEDULE 1 — PRODUCT CATEGORY X",
      pageBreakBefore: true,
      body: `Product Category X comprises the Supplier’s benchtop analytical instruments and their dedicated consumables, namely: the KI-400 series spectrophotometers; the KI-650 series chromatography modules; and calibration standards, sample cells and reagent cartridges supplied for use with either of them.

Product Category X does not include the Supplier’s field-portable instruments, which are distributed under separate arrangements.`,
    },
    GOVERNING_LAW,
  ],
});

/* ------------------------------------------------------------------------- */
/* 3. Distribution B — the planted conflict. "Sole", not "exclusive".         */
/* ------------------------------------------------------------------------- */

const distributionB: Builder = (gt) => ({
  docId: gt.docId,
  title: "Distribution Agreement",
  subtitle: "Between Kestrel Instruments Limited and Lionbridge Distribution Pte Ltd",
  font: "helvetica",
  clauses: [
    {
      id: "Parties",
      unnumbered: true,
      heading: "PARTIES",
      body: `This Distribution Agreement is made between Kestrel Instruments Limited, a company incorporated in England and Wales (company number 09182773) whose registered office is at 14 Wellington Court, Reading RG1 8DB, United Kingdom (the “Supplier”), and Lionbridge Distribution Pte Ltd (UEN 202033445D), whose registered office is at 25 Tai Seng Avenue, Singapore 534104 (the “Distributor”).`,
    },
    {
      id: "1",
      heading: "Definitions",
      body: `“Products” means the Supplier’s benchtop analytical instruments and dedicated consumables within Product Category X, as listed in the Schedule.

“Territory” means Singapore.`,
    },
    {
      id: "2.1",
      heading: "Term",
      body: `This Agreement starts on ${date(gt, "commencementDate")} and runs for ${spelled(24)} months, ending on ${date(gt, "termEnd")} unless it is terminated earlier under clause 11.`,
    },
    {
      id: "2.3",
      heading: "Renewal",
      body: `At the end of the Term this Agreement renews automatically for further periods of ${spelled(12)} months each, unless either party gives the other written notice not less than ${spelled(90)} days before the end of the then-current period that it does not wish the Agreement to renew.`,
    },
    {
      id: "3.1",
      heading: "Appointment",
      body: `The Supplier appoints the Distributor as its sole distributor of the Products in the Territory.

The Supplier will not appoint any other distributor, reseller or agent for the Products in the Territory during the Term. The Supplier reserves the right to continue to supply the Products directly to end customers in the Territory, and any such direct sales shall not be a breach of this clause.`,
    },
    {
      id: "6.2",
      heading: "Annual licence fee",
      body: `The Distributor shall pay an annual licence fee of ${money(1000000, "SGD")} on 1 January in each year of the Term, in consideration of the trade mark licence granted under clause 6.1.`,
    },
    {
      id: "10.1",
      heading: "Limitation of liability",
      body: `Except for liability which cannot lawfully be excluded, neither party’s total liability under this Agreement shall exceed ${money(25000000, "SGD")} in aggregate.`,
    },
    {
      id: "11.1",
      heading: "Termination for convenience",
      body: `The Supplier may terminate this Agreement by giving ${spelled(3)} months’ written notice. The Distributor may terminate this Agreement by giving ${spelled(6)} months’ written notice.`,
    },
    {
      id: "11.2",
      heading: "Termination for cause",
      body: `Either party may terminate this Agreement by written notice if the other party is in material breach of it and has not put the breach right within ${spelled(14)} days of being asked in writing to do so.`,
    },
    {
      id: "Schedule",
      unnumbered: true,
      heading: "SCHEDULE — PRODUCTS AND TERRITORY",
      pageBreakBefore: true,
      body: `Product category: Product Category X — benchtop analytical instruments and dedicated consumables (KI-400 series spectrophotometers, KI-650 series chromatography modules, and associated calibration standards, sample cells and reagent cartridges).

Territory: Singapore.

Minimum annual purchase commitment: ${money(18000000, "SGD")} per year of the Term.`,
    },
    GOVERNING_LAW,
  ],
});

/* ------------------------------------------------------------------------- */
/* 4. MSA — the UNCERTAIN cap. 11.2 spans a page break; carve-out in Sch 12.4 */
/* ------------------------------------------------------------------------- */

const msa: Builder = (gt) => ({
  docId: gt.docId,
  title: "Master Services Agreement",
  subtitle: "Between Meridian Retail Pte Ltd and Halcyon Consulting Pte Ltd",
  font: "times",
  clauses: [
    {
      id: "Parties",
      unnumbered: true,
      heading: "PARTIES",
      body: `THIS MASTER SERVICES AGREEMENT is made between Meridian Retail Pte Ltd (UEN 201812345K) of 8 Cross Street, Singapore 048424 (the “Client”) and Halcyon Consulting Pte Ltd (UEN 201722114B) of 60 Anson Road, Singapore 079914 (the “Consultant”).`,
    },
    {
      id: "1",
      heading: "Structure of this Agreement",
      body: `This Agreement sets out the terms on which the Consultant shall provide services to the Client. The particular services, deliverables and fees for each engagement shall be recorded in a Statement of Work executed by both parties and incorporating this Agreement by reference.

Where a Statement of Work conflicts with this Agreement, this Agreement shall prevail unless the Statement of Work expressly states otherwise and is signed by an authorised representative of each party.`,
    },
    {
      id: "2",
      heading: "The Services",
      body: `The Consultant shall perform the Services with the reasonable skill and care to be expected of a competent professional consultant experienced in work of a similar nature, and shall ensure that the Deliverables conform in all material respects to the specifications recorded in the relevant Statement of Work.`,
    },
    {
      id: "3",
      heading: "Client obligations",
      body: `The Client shall provide the Consultant with such access to its premises, systems, personnel and information as the Consultant reasonably requires in order to perform the Services, and shall designate a single point of contact for each Statement of Work.`,
    },
    {
      id: "4.1",
      heading: "Term",
      body: `This Agreement commences on ${date(gt, "commencementDate")} and shall continue for a period of ${spelled(24)} months, expiring on ${date(gt, "termEnd")}, unless terminated earlier in accordance with clause 15.`,
    },
    {
      id: "4.2",
      heading: "Extension",
      body: `This Agreement does not renew automatically. The Term may be extended only by a written change order signed by both parties and executed before the expiry of the Term.`,
    },
    {
      id: "6.1",
      heading: "Fees",
      body: `The Client shall pay the Consultant a retainer of ${money(1800000, "SGD")} per month, payable on the first business day of each calendar month, together with such additional fees as may be agreed in a Statement of Work.

The retainer covers up to eighty (80) consultant hours per month. Hours worked in excess of that allowance shall be charged at the rates set out in the relevant Statement of Work.`,
    },
    {
      id: "7",
      heading: "Expenses",
      body: `The Client shall reimburse the Consultant’s reasonable travel and subsistence expenses properly incurred in performing the Services, provided that expenses exceeding five hundred Singapore dollars (S$500) in aggregate in any month shall require the Client’s prior written approval.`,
    },
    {
      id: "8",
      heading: "Intellectual property",
      body: `All intellectual property rights in the Deliverables shall vest in the Client on payment in full of the fees relating to them. The Consultant retains all rights in its pre-existing methodologies, tools and know-how, and grants the Client a non-transferable licence to use them to the extent necessary to make use of the Deliverables.`,
    },
    {
      id: "11.1",
      heading: "Exclusions",
      body: `Nothing in this Agreement shall limit either party’s liability for death or personal injury caused by negligence, for fraud or fraudulent misrepresentation, or for any other liability which cannot lawfully be limited or excluded.`,
    },
    {
      id: "11.2",
      heading: "Limitation of liability",
      startNearPageBottom: true,
      body: `Subject to clause 11.1, the total aggregate liability of the Consultant to the Client in respect of all claims arising under or in connection with this Agreement, whether in contract, tort (including negligence), for breach of statutory duty or otherwise, shall not exceed ${money(10000000, "SGD")}.

Neither party shall be liable to the other for any loss of profit, loss of anticipated savings, loss of business opportunity or any indirect or consequential loss, in each case whether or not that loss was foreseeable at the date of this Agreement.`,
    },
    {
      id: "15.1",
      heading: "Termination for convenience",
      body: `The Client may terminate this Agreement, or any individual Statement of Work, by giving the Consultant not less than ${spelled(30)} days’ written notice.`,
    },
    {
      id: "15.2",
      heading: "Termination for cause",
      body: `Either party may terminate this Agreement by written notice where the other party commits a material breach and fails to remedy it within ${spelled(30)} days of written notice requiring it to do so, or immediately where the other party becomes insolvent or has a receiver, judicial manager or liquidator appointed over any of its assets.`,
    },
    {
      id: "Indemnity Schedule",
      unnumbered: true,
      heading: "INDEMNITY SCHEDULE",
      pageBreakBefore: true,
      body: `This Schedule forms part of the Agreement and is to be read together with it.`,
    },
    {
      id: "12.1",
      heading: "Application of this Schedule",
      body: `The indemnities set out in this Schedule are given in addition to the Consultant’s other obligations under the Agreement and are not intended to restrict any other remedy available to the Client.`,
    },
    {
      id: "12.2",
      heading: "Confidentiality indemnity",
      body: `The Consultant shall indemnify the Client against all losses, liabilities, costs and expenses reasonably incurred by the Client arising out of any unauthorised disclosure by the Consultant of the Client’s confidential information.`,
    },
    {
      id: "12.3",
      heading: "Data protection indemnity",
      body: `The Consultant shall indemnify the Client against any financial penalty imposed on the Client under the Personal Data Protection Act 2012 to the extent that the penalty arises from the Consultant’s failure to comply with its obligations under clause 9 of the Agreement.`,
    },
    {
      id: "12.4",
      heading: "Intellectual property indemnity",
      body: `The Consultant shall indemnify the Client against all losses, damages, costs and expenses arising out of or in connection with any claim that the Deliverables, or the Client’s use of them in accordance with the Agreement, infringe the intellectual property rights of any third party.

The Consultant shall have the right to conduct the defence of any such claim and the Client shall provide reasonable assistance in doing so.`,
    },
    GOVERNING_LAW,
  ],
});

/* ------------------------------------------------------------------------- */
/* 6. Supplier agreement — scanned, business-days notice, conditional payment */
/* ------------------------------------------------------------------------- */

const supplierAgreement: Builder = (gt) => ({
  docId: gt.docId,
  title: "Supply Agreement",
  subtitle: "Meridian Retail Pte Ltd and Foundry Components Pte Ltd",
  font: "courier",
  clauses: [
    {
      id: "Parties",
      unnumbered: true,
      heading: "PARTIES",
      body: `THIS SUPPLY AGREEMENT is made between MERIDIAN RETAIL PTE LTD (UEN 201812345K) of 8 Cross Street, Singapore 048424 (the "Buyer") and FOUNDRY COMPONENTS PTE LTD (UEN 200811223C) of 12 Kaki Bukit Road 1, Singapore 416181 (the "Supplier").`,
    },
    {
      id: "1",
      heading: "SUPPLY OF GOODS",
      body: `The Supplier shall supply to the Buyer the shelving components, fixings and point-of-sale fixtures described in the Buyer's purchase orders issued from time to time under this Agreement.`,
    },
    {
      id: "2",
      heading: "TERM",
      body: `This Agreement takes effect on ${date(gt, "commencementDate")} and continues for a period of ${spelled(36)} months from that date.`,
    },
    {
      id: "3",
      heading: "RENEWAL",
      body: `On expiry of the initial period this Agreement shall renew automatically for further periods of ${spelled(12)} months.

A party wishing to prevent such renewal must serve written notice on the other party not less than ${spelled(90)} business days before the expiry of the then current period.`,
    },
    {
      id: "7",
      heading: "PAYMENT",
      body: `The Buyer shall pay to the Supplier a quarterly service charge of ${money(2250000, "SGD")}, payable in arrears on the last day of each calendar quarter.

All other amounts invoiced by the Supplier for goods supplied shall be paid within thirty (30) days from the date of invoice.`,
    },
    {
      id: "8",
      heading: "DELIVERY AND RISK",
      body: `Risk in the goods shall pass to the Buyer on delivery at the Buyer's nominated distribution centre. Title shall pass on payment in full for the goods in question.`,
    },
    {
      id: "10",
      heading: "LIMITATION OF LIABILITY",
      body: `The total liability of the Supplier to the Buyer under this Agreement, whether in contract, tort or otherwise, shall not in any event exceed ${money(7500000, "SGD")}.

Nothing in this clause limits liability for death or personal injury caused by negligence or for fraud.`,
    },
    {
      id: "12",
      heading: "TERMINATION",
      body: `The Buyer may terminate this Agreement for convenience by giving not less than ${spelled(60)} days written notice to the Supplier.

Either party may terminate this Agreement by written notice where the other is in material breach of it and has not remedied that breach within ${spelled(30)} days of written notice requiring it to do so.`,
    },
    {
      id: "14",
      heading: "GOVERNING LAW",
      body: `This Agreement is governed by the laws of Singapore and the parties submit to the jurisdiction of the Singapore courts.`,
    },
  ],
});

export const PDF_BUILDERS: Record<string, Builder> = {
  "saas-subscription": saasSubscription,
  "distribution-a": distributionA,
  "distribution-b": distributionB,
  msa,
  "supplier-agreement": supplierAgreement,
};

/* ------------------------------------------------------------------------- */
/* 5. Mutual NDA — the silence case. DOCX, so it is built separately.         */
/* ------------------------------------------------------------------------- */

export interface DocxSection {
  heading: string;
  paragraphs: string[];
}

/**
 * Deliberately contains no exclusivity provision, no liability cap and no
 * renewal mechanics. It also avoids the words "exclusive", "sole" and
 * "non-compete" entirely, so a keyword probe correctly finds no candidate
 * clause and the answer is NOT_FOUND rather than UNCERTAIN.
 */
export function buildNda(gt: ResolvedContract): { title: string; sections: DocxSection[] } {
  return {
    title: "Mutual Non-Disclosure Agreement",
    sections: [
      {
        heading: "PARTIES",
        paragraphs: [
          `This Mutual Non-Disclosure Agreement is made between Meridian Retail Pte Ltd (UEN 201812345K) of 8 Cross Street, Singapore 048424, and Vantage Logistics Pte Ltd (UEN 201599887G) of 5 Toh Guan Road East, Singapore 608831. Each party may disclose Confidential Information to the other, and each is referred to as the Discloser when it discloses and the Recipient when it receives.`,
        ],
      },
      {
        heading: "1. Effective date",
        paragraphs: [
          `This Agreement takes effect on ${date(gt, "commencementDate")} (the Effective Date).`,
        ],
      },
      {
        heading: "2. Confidential Information",
        paragraphs: [
          `Confidential Information means information disclosed by the Discloser to the Recipient which is identified as confidential at the time of disclosure, or which the Recipient ought reasonably to understand to be confidential given its nature or the circumstances of its disclosure. It includes commercial terms, pricing, customer lists, operational data, and technical and business plans.`,
        ],
      },
      {
        heading: "3. Obligations of the Recipient",
        paragraphs: [
          `The Recipient shall: (a) keep the Confidential Information secret and secure; (b) use it only for the purpose of evaluating and, if the parties so decide, performing a logistics services arrangement between them; and (c) disclose it only to those of its officers, employees and professional advisers who need to know it for that purpose and who are bound by obligations of confidentiality no less protective than those in this Agreement.`,
          `The Recipient shall apply at least the same degree of care to the Confidential Information as it applies to its own confidential information of a similar nature, and in any event no less than a reasonable degree of care.`,
        ],
      },
      {
        heading: "4. Exceptions",
        paragraphs: [
          `The obligations in clause 3 do not apply to information which: (a) is or becomes public through no breach of this Agreement; (b) the Recipient already lawfully held free of any confidentiality obligation before disclosure; (c) the Recipient develops independently without reference to the Confidential Information; or (d) the Recipient is required to disclose by law, by a court, or by a regulator, provided that it gives the Discloser such advance notice as is lawful and practicable.`,
        ],
      },
      {
        heading: "5. Return and destruction",
        paragraphs: [
          `On written request from the Discloser, the Recipient shall return or destroy all Confidential Information in its possession and shall confirm in writing that it has done so, save that the Recipient may retain one copy to the extent required by law or by its internal record-keeping policies.`,
        ],
      },
      {
        heading: "6. Term and termination",
        paragraphs: [
          `This Agreement continues for a period of ${spelled(24)} months from the Effective Date. Either party may terminate it at any time by giving the other ${spelled(30)} days written notice.`,
          `The obligations of confidentiality in clause 3 survive termination and continue for a further period of three (3) years in respect of Confidential Information disclosed before termination.`,
        ],
      },
      {
        heading: "7. No licence and no obligation to proceed",
        paragraphs: [
          `Nothing in this Agreement grants the Recipient any right in the Confidential Information other than the limited right to use it for the purpose stated in clause 3. Neither party is obliged by this Agreement to enter into any further agreement with the other, or to proceed with any transaction.`,
        ],
      },
      {
        heading: "8. General",
        paragraphs: [
          `This Agreement is governed by the laws of Singapore, and the parties submit to the jurisdiction of the Singapore courts. It may be varied only in writing signed by both parties. It sets out the whole agreement between the parties in relation to the confidentiality of information disclosed between them.`,
        ],
      },
    ],
  };
}
