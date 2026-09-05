/**
 * The extraction contract: one structured call per document returns every field
 * at once.
 *
 * OpenAI's strict json_schema mode guarantees the SHAPE of what comes back, so
 * malformed responses stop being a failure mode we defend against. It cannot
 * guarantee the CONTENT — in particular it cannot make a quote verbatim. That
 * is what verify.ts is for, and the division of labour is deliberate: the API
 * enforces structure, our code enforces truth.
 *
 * Strict mode requires every property to be listed in `required` and
 * `additionalProperties: false` everywhere, so optionality is expressed as a
 * nullable type rather than an absent key.
 */

import { FIELD_IDS, type EvidenceType, type ExclusivityType, type PaymentFrequency } from "./types.ts";

export const EXTRACTION_SCHEMA_NAME = "contract_extraction";

const quoteSchema = {
  type: "object",
  additionalProperties: false,
  required: ["clauseId", "text"],
  properties: {
    clauseId: {
      type: "string",
      description:
        "The clause number or heading this quote comes from, exactly as the document writes it, e.g. \"12.3\" or \"Parties\".",
    },
    text: {
      type: "string",
      description:
        "A verbatim span copied character-for-character from the supplied document text, including any spacing oddities or OCR errors.",
    },
  },
} as const;

const quotesArray = {
  type: "array",
  description: "Every quote that supports this answer. At least one unless the document is silent.",
  items: quoteSchema,
} as const;

const ambiguitiesArray = {
  type: "array",
  description:
    "Every reason this answer cannot be stated as a single unambiguous fact. Empty when there is none. Be specific and cite the clause that creates the doubt.",
  items: { type: "string" },
} as const;

export const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fields", "payments", "grants"],
  properties: {
    fields: {
      type: "array",
      description: "One entry per requested field id. Return all of them, including the absent ones.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fieldId", "found", "value", "quotes", "evidenceType", "ambiguities"],
        properties: {
          fieldId: { type: "string", enum: [...FIELD_IDS] },
          found: {
            type: "boolean",
            description: "false only when the document contains no such provision at all.",
          },
          value: {
            type: "string",
            description:
              "The answer as a short human-readable string. Empty string when found is false. Dates as YYYY-MM-DD. Money with its currency, e.g. \"S$100,000\".",
          },
          quotes: quotesArray,
          evidenceType: {
            type: "string",
            enum: ["explicit", "derived", "absent"],
            description:
              "explicit: stated in the text. derived: computed from other stated facts, such as an end date from a start date plus a duration. absent: the document is silent.",
          },
          ambiguities: ambiguitiesArray,
        },
      },
    },

    payments: {
      type: "array",
      description: "Every payment obligation the document imposes. Empty array if there are none.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "description",
          "amountMinor",
          "currency",
          "frequency",
          "firstDueDate",
          "conditional",
          "conditionNote",
          "quotes",
          "ambiguities",
        ],
        properties: {
          description: { type: "string" },
          amountMinor: {
            type: ["integer", "null"],
            description:
              "Amount in minor units — cents. S$40,000 is 4000000. null when the document states no fixed amount.",
          },
          currency: { type: ["string", "null"], description: "ISO code, e.g. SGD." },
          frequency: {
            type: "string",
            enum: ["one-off", "monthly", "quarterly", "annually", "on-invoice"],
            description:
              "Use on-invoice when payment is due a number of days from an invoice date rather than on a calendar schedule.",
          },
          firstDueDate: {
            type: ["string", "null"],
            description:
              "YYYY-MM-DD for the first due date the document actually fixes. null when it depends on an event the document does not date, such as the issue of an invoice.",
          },
          conditional: {
            type: "boolean",
            description:
              "true when the due date depends on something the contract does not fix, so no certain date can be given.",
          },
          conditionNote: { type: ["string", "null"] },
          quotes: quotesArray,
          ambiguities: ambiguitiesArray,
        },
      },
    },

    grants: {
      type: "array",
      description:
        "Every exclusivity or restrictive-covenant grant. Empty array when the document grants none.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "grantee",
          "grantor",
          "exclusivityType",
          "territoryLabel",
          "territoryCodes",
          "productLabel",
          "productCodes",
          "start",
          "end",
          "quotes",
          "ambiguities",
        ],
        properties: {
          grantee: {
            type: "string",
            description:
              "The legal entity receiving the rights, resolved back to the parties clause — never a defined role term like \"the Distributor\".",
          },
          grantor: { type: "string" },
          exclusivityType: {
            type: "string",
            enum: ["exclusive", "sole", "non-exclusive"],
            description:
              "exclusive: nobody else may act, usually including the grantor. sole: the grantor may still act itself but will appoint nobody else. non-exclusive: no restriction. Read the substance of the clause, not only the label it uses.",
          },
          territoryLabel: { type: "string", description: "As the document describes it." },
          territoryCodes: {
            type: "array",
            description:
              "Normalised uppercase codes for the territory, so overlap can be computed. Use ISO 3166 alpha-2 where possible, e.g. [\"SG\"]. Use [\"WORLD\"] for worldwide.",
            items: { type: "string" },
          },
          productLabel: { type: "string" },
          productCodes: {
            type: "array",
            description:
              "Normalised uppercase codes for the product scope, so overlap can be computed. Derive a stable token from the document's own naming, e.g. Product Category X becomes \"CATX\". Resolve the scope through any schedule the clause refers to.",
            items: { type: "string" },
          },
          start: { type: ["string", "null"], description: "YYYY-MM-DD." },
          end: { type: ["string", "null"], description: "YYYY-MM-DD." },
          quotes: quotesArray,
          ambiguities: ambiguitiesArray,
        },
      },
    },
  },
} as const;

/* The TypeScript mirror of what comes back. */

export interface RawQuote {
  clauseId: string;
  text: string;
}

export interface RawField {
  fieldId: string;
  found: boolean;
  value: string;
  quotes: RawQuote[];
  evidenceType: EvidenceType;
  ambiguities: string[];
}

export interface RawPayment {
  description: string;
  amountMinor: number | null;
  currency: string | null;
  frequency: PaymentFrequency;
  firstDueDate: string | null;
  conditional: boolean;
  conditionNote: string | null;
  quotes: RawQuote[];
  ambiguities: string[];
}

export interface RawGrant {
  grantee: string;
  grantor: string;
  exclusivityType: ExclusivityType;
  territoryLabel: string;
  territoryCodes: string[];
  productLabel: string;
  productCodes: string[];
  start: string | null;
  end: string | null;
  quotes: RawQuote[];
  ambiguities: string[];
}

export interface RawExtraction {
  fields: RawField[];
  payments: RawPayment[];
  grants: RawGrant[];
}
