import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Confidence, Results } from "@/lib/types";
import { CONFIDENCE_LABEL, CONFIDENCE_MEANING, CONFIDENCE_VAR, formatDate } from "@/lib/display";
import { Calendar, ConflictBanner, EscalationBriefCard, RefusalPanel, Unavailable } from "@/components/panels";
import { Workspace } from "@/components/Workspace";

export const dynamic = "force-static";

async function loadResults(): Promise<Results | null> {
  try {
    const file = path.join(process.cwd(), "data", "results.json");
    return JSON.parse(await readFile(file, "utf8")) as Results;
  } catch {
    return null;
  }
}

const LEVELS: Confidence[] = ["FOUND", "INFERRED", "UNCERTAIN", "NOT_FOUND"];

export default async function Page() {
  const results = await loadResults();

  if (!results) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-20">
        <h1 className="mb-3 text-2xl">Nothing has been analysed yet</h1>
        <p className="text-[0.95rem] leading-relaxed">
          There is no <code>data/results.json</code> to read. Point the pipeline at a folder of contracts
          and it will build one:
        </p>
        <pre className="mt-4 border p-3 text-sm" style={{ borderColor: "var(--rule-strong)" }}>
          npm run pipeline -- --corpus ./your-folder
        </pre>
      </main>
    );
  }

  const fields = results.contracts.flatMap((c) => c.fields);
  const tally = (level: Confidence) => fields.filter((f) => f.confidence === level).length;

  return (
    <div className="mx-auto max-w-[92rem] px-5 pb-20 pt-6 sm:px-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div>
            <h1 className="text-[1.9rem] leading-none tracking-tight">AITHENA</h1>
            <p className="mt-1.5 max-w-[54ch] text-[0.92rem]" style={{ color: "var(--ink-soft)" }}>
              What this business is committed to across {results.contracts.length} signed contracts, and
              what falls due next. Every line traces to the clause it came from.
            </p>
          </div>
          <p className="text-right text-[0.82rem] leading-relaxed" style={{ color: "var(--ink-faint)" }}>
            Read {formatDate(results.asOf)}
            <br />
            {fields.length} fields extracted by {results.model}
          </p>
        </div>

        {/* Non-dismissable, and phrased as a boundary rather than a disclaimer. */}
        <p
          className="mt-4 border-l-4 px-4 py-2.5 text-[0.88rem] leading-relaxed"
          style={{ borderColor: "var(--ink)", background: "var(--sheet)" }}
        >
          <strong className="font-semibold">This is not legal advice.</strong> AITHENA reports what these
          documents say and when they require action. It does not tell you what to do, does not interpret
          the law, and makes no claim it cannot trace to a clause in a document it has read.
        </p>

        {/* The legend is the key to every row below, so it states what each
            level means rather than only colouring it. */}
        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
          {LEVELS.map((level) => (
            <div key={level}>
              <dt
                className="mb-1 flex items-baseline gap-1.5 border-l-2 pl-2 text-[0.82rem] font-medium"
                style={{ color: CONFIDENCE_VAR[level], borderColor: CONFIDENCE_VAR[level] }}
              >
                {CONFIDENCE_LABEL[level]}
                <span style={{ color: "var(--ink-faint)" }}>{tally(level)} fields</span>
              </dt>
              <dd className="pl-2 text-[0.76rem] leading-snug" style={{ color: "var(--ink-faint)" }}>
                {CONFIDENCE_MEANING[level]}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      <ConflictBanner conflicts={results.conflicts} />

      <div className="flex flex-col gap-10 xl:flex-row">
        <div className="xl:w-[24rem] xl:shrink-0">
          <Calendar events={results.calendar} windowDays={results.windowDays} />

          {results.escalations.length > 0 && (
            <div className="mt-9">
              <h2 className="mb-1 text-[1.15rem]">Where AITHENA stops</h2>
              <p className="mb-3 text-[0.85rem]" style={{ color: "var(--ink-soft)" }}>
                {results.escalations.length === 1
                  ? "One question this system cannot settle."
                  : `${results.escalations.length} questions this system cannot settle.`}{" "}
                Each brief is written to be handed to a lawyer as it stands.
              </p>
              {results.escalations.map((brief) => (
                <EscalationBriefCard key={brief.id} brief={brief} />
              ))}
            </div>
          )}
        </div>

        <main className="min-w-0 flex-1">
          <Workspace contracts={results.contracts} />
          <RefusalPanel refusals={results.refusals} />
          <Unavailable items={results.unavailable} />
        </main>
      </div>
    </div>
  );
}
