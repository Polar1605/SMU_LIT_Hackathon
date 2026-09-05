import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Confidence, Results } from "@/lib/types";
import { CONFIDENCE_LABEL, CONFIDENCE_MEANING, CONFIDENCE_VAR, formatDate } from "@/lib/display";
import { CalendarGrid, NextDeadline } from "@/components/CalendarGrid";
import { ConflictBanner, EscalationBriefCard, RefusalPanel, Unavailable } from "@/components/panels";
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
        <pre className="card mt-4 p-3 text-sm">npm run pipeline -- --corpus ./your-folder</pre>
      </main>
    );
  }

  const fields = results.contracts.flatMap((c) => c.fields);
  const tally = (level: Confidence) => fields.filter((f) => f.confidence === level).length;

  return (
    <>
      {/* App chrome: a fixed bar that says what this is and what it read. */}
      <header className="sticky top-0 z-40" style={{ background: "var(--header)", color: "#fff" }}>
        <div className="mx-auto flex max-w-[100rem] flex-wrap items-baseline gap-x-5 gap-y-1 px-5 py-2.5 sm:px-7">
          <h1 className="text-[1.35rem] leading-none tracking-tight">AITHENA</h1>
          <p className="text-[0.82rem]" style={{ color: "var(--header-soft)" }}>
            Contract obligations, traced to the clause
          </p>
          <p className="ml-auto text-[0.78rem]" style={{ color: "var(--header-soft)" }}>
            {results.contracts.length} contracts · {fields.length} fields · read {formatDate(results.asOf)}
          </p>
        </div>
      </header>

      {/* Non-dismissable, and phrased as a boundary rather than a disclaimer. */}
      <div style={{ background: "#1b333f", color: "#dbe6eb" }}>
        <p className="mx-auto max-w-[100rem] px-5 py-1.5 text-[0.8rem] sm:px-7">
          <strong className="font-semibold" style={{ color: "#fff" }}>
            Not legal advice.
          </strong>{" "}
          AITHENA reports what these documents say and when they require action. It does not tell you what
          to do, does not interpret the law, and makes no claim it cannot trace to a clause it has read.
        </p>
      </div>

      <div className="mx-auto max-w-[100rem] px-5 pb-16 pt-5 sm:px-7">
        {/* Status strip: the legend and the counts, as one row of interface. */}
        <dl className="card mb-5 grid gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-2 xl:grid-cols-4">
          {LEVELS.map((level) => (
            <div key={level}>
              <dt className="mb-0.5 flex items-baseline gap-2">
                <span
                  className="ui text-[0.76rem] uppercase tracking-wide"
                  style={{ color: CONFIDENCE_VAR[level] }}
                >
                  {CONFIDENCE_LABEL[level]}
                </span>
                <span className="text-[1.05rem] font-semibold">{tally(level)}</span>
              </dt>
              <dd className="text-[0.75rem] leading-snug" style={{ color: "var(--ink-faint)" }}>
                {CONFIDENCE_MEANING[level]}
              </dd>
            </div>
          ))}
        </dl>

        <ConflictBanner conflicts={results.conflicts} />

        <div className="flex flex-col gap-7 xl:flex-row">
          <div className="xl:w-[25rem] xl:shrink-0">
            <NextDeadline events={results.calendar} />
            <CalendarGrid
              events={results.calendar}
              contracts={results.contracts}
              asOf={results.asOf}
              windowDays={results.windowDays}
            />

            {results.escalations.length > 0 && (
              <div className="mt-6">
                <h2 className="mb-1 text-[1.1rem]">Where AITHENA stops</h2>
                <p className="mb-3 text-[0.83rem]" style={{ color: "var(--ink-soft)" }}>
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
    </>
  );
}
