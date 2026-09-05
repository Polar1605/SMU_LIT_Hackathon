/**
 * Resolves data/ground-truth.template.json into an absolute answer key.
 *
 * The template stores dates as offsets from --as-of so that regenerating the
 * corpus on demo day keeps the hero renewal inside the 90-day window. This
 * module is the only place that turns offsets into dates; both the prose
 * builders and eval.ts read the resolved output, so they cannot disagree.
 */

import { addDays, addMonths, format, lastDayOfQuarter, parseISO } from "date-fns";
import type { Confidence, DocFormat, ExclusivityType, PaymentFrequency } from "../../lib/types.ts";

interface RawDate {
  offsetDays?: number;
  deriveFrom?: string;
  addMonths?: number;
}

interface RawField extends RawDate {
  value?: string | null;
  absent?: boolean;
  ambiguous?: boolean;
  expectedConfidence: Confidence;
  clauseId?: string;
  note?: string;
}

interface RawPayment {
  description: string;
  amountMinor: number | null;
  currency: string | null;
  frequency: PaymentFrequency;
  firstDueDate: RawDate | null;
  fixedMonthDay?: string;
  fixedDayOfMonth?: number;
  quarterEnd?: boolean;
  conditional: boolean;
  conditionNote?: string;
  clauseId: string;
  expectedConfidence: Confidence;
}

interface RawGrant {
  grantee: string;
  grantor: string;
  exclusivityType: ExclusivityType;
  territoryLabel: string;
  territoryCodes: string[];
  productLabel: string;
  productCodes: string[];
  startFrom: string;
  endFrom: string;
  clauseId: string;
  expectedConfidence: Confidence;
}

interface RawContract {
  docId: string;
  title: string;
  fileName: string;
  format: DocFormat;
  scanned?: boolean;
  voice: string;
  notes?: string;
  fields: Record<string, RawField>;
  payments: RawPayment[];
  grants: RawGrant[];
}

export interface RawTemplate {
  contracts: RawContract[];
  expectedConflicts: unknown[];
  expectedEscalations: unknown[];
}

export interface ResolvedField {
  value: string | null;
  absent: boolean;
  ambiguous: boolean;
  expectedConfidence: Confidence;
  clauseId: string | null;
  note: string | null;
  /** true when `value` is an ISO date, so eval compares by date not by string. */
  isDate: boolean;
}

export interface ResolvedPayment extends Omit<RawPayment, "firstDueDate"> {
  firstDueDate: string | null;
}

export interface ResolvedGrant extends Omit<RawGrant, "startFrom" | "endFrom"> {
  start: string | null;
  end: string | null;
}

export interface ResolvedContract {
  docId: string;
  title: string;
  fileName: string;
  format: DocFormat;
  scanned: boolean;
  voice: string;
  notes: string | null;
  fields: Record<string, ResolvedField>;
  payments: ResolvedPayment[];
  grants: ResolvedGrant[];
}

export interface ResolvedGroundTruth {
  asOf: string;
  generatedAt: string;
  contracts: ResolvedContract[];
  expectedConflicts: unknown[];
  expectedEscalations: unknown[];
}

const ISO = "yyyy-MM-dd";

function isDateSpec(raw: RawDate): boolean {
  return raw.offsetDays !== undefined || raw.deriveFrom !== undefined;
}

/**
 * Two passes: absolute offsets first, then fields derived from them. Our
 * template never chains a derivation off another derivation; if that ever
 * changes this throws rather than silently resolving to null.
 */
function resolveDates(fields: Record<string, RawField>, asOf: Date): Map<string, string> {
  const out = new Map<string, string>();

  for (const [id, field] of Object.entries(fields)) {
    if (field.offsetDays !== undefined) {
      out.set(id, format(addDays(asOf, field.offsetDays), ISO));
    }
  }

  for (const [id, field] of Object.entries(fields)) {
    if (field.deriveFrom === undefined) continue;
    const base = out.get(field.deriveFrom);
    if (base === undefined) {
      throw new Error(
        `ground truth: field "${id}" derives from "${field.deriveFrom}", which has no absolute date. ` +
          `Chained derivations are not supported — give the base field an offsetDays.`,
      );
    }
    out.set(id, format(addMonths(parseISO(base), field.addMonths ?? 0), ISO));
  }

  return out;
}

/** Next occurrence on or after `from` of a recurring calendar anchor. */
function nextOccurrence(payment: RawPayment, from: Date): string | null {
  if (payment.quarterEnd) return format(lastDayOfQuarter(from), ISO);

  if (payment.fixedMonthDay) {
    const [month, day] = payment.fixedMonthDay.split("-").map(Number);
    let candidate = new Date(from.getFullYear(), month - 1, day);
    if (candidate < from) candidate = new Date(from.getFullYear() + 1, month - 1, day);
    return format(candidate, ISO);
  }

  if (payment.fixedDayOfMonth) {
    let candidate = new Date(from.getFullYear(), from.getMonth(), payment.fixedDayOfMonth);
    if (candidate < from) candidate = addMonths(candidate, 1);
    return format(candidate, ISO);
  }

  return null;
}

export function resolveGroundTruth(template: RawTemplate, asOf: Date): ResolvedGroundTruth {
  const contracts = template.contracts.map((contract): ResolvedContract => {
    const dates = resolveDates(contract.fields, asOf);

    const fields: Record<string, ResolvedField> = {};
    for (const [id, field] of Object.entries(contract.fields)) {
      const resolvedDate = dates.get(id);
      fields[id] = {
        value: resolvedDate ?? field.value ?? null,
        absent: field.absent === true,
        ambiguous: field.ambiguous === true,
        expectedConfidence: field.expectedConfidence,
        clauseId: field.clauseId ?? null,
        note: field.note ?? null,
        isDate: isDateSpec(field),
      };
    }

    const payments = contract.payments.map((payment): ResolvedPayment => {
      let firstDueDate: string | null = null;
      if (payment.firstDueDate && isDateSpec(payment.firstDueDate)) {
        const base = payment.firstDueDate.deriveFrom
          ? dates.get(payment.firstDueDate.deriveFrom)
          : undefined;
        firstDueDate = base
          ? format(addMonths(parseISO(base), payment.firstDueDate.addMonths ?? 0), ISO)
          : format(addDays(asOf, payment.firstDueDate.offsetDays ?? 0), ISO);
      } else {
        firstDueDate = nextOccurrence(payment, asOf);
      }
      const { firstDueDate: _discard, ...rest } = payment;
      return { ...rest, firstDueDate };
    });

    const grants = contract.grants.map((grant): ResolvedGrant => {
      const { startFrom, endFrom, ...rest } = grant;
      return {
        ...rest,
        start: dates.get(startFrom) ?? null,
        end: dates.get(endFrom) ?? null,
      };
    });

    return {
      docId: contract.docId,
      title: contract.title,
      fileName: contract.fileName,
      format: contract.format,
      scanned: contract.scanned === true,
      voice: contract.voice,
      notes: contract.notes ?? null,
      fields,
      payments,
      grants,
    };
  });

  return {
    asOf: format(asOf, ISO),
    generatedAt: new Date().toISOString(),
    contracts,
    expectedConflicts: template.expectedConflicts,
    expectedEscalations: template.expectedEscalations,
  };
}

/** "18 November 2025" — how dates appear inside the generated contracts. */
export function longDate(iso: string): string {
  return format(parseISO(iso), "d MMMM yyyy");
}

/** "S$40,000" from integer minor units plus a currency code. */
export function money(amountMinor: number, currency: string): string {
  const symbol = currency === "SGD" ? "S$" : `${currency} `;
  const major = amountMinor / 100;
  const formatted = Number.isInteger(major)
    ? major.toLocaleString("en-SG")
    : major.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${formatted}`;
}

/** "sixty (60)" — the way contracts actually write numbers. */
const WORDS: Record<number, string> = {
  14: "fourteen", 30: "thirty", 36: "thirty-six", 60: "sixty", 90: "ninety",
  3: "three", 6: "six", 12: "twelve", 24: "twenty-four",
};

export function spelled(n: number): string {
  const word = WORDS[n];
  if (!word) throw new Error(`No spelled-out form for ${n}; add it to WORDS in ground-truth.ts`);
  return `${word} (${n})`;
}
