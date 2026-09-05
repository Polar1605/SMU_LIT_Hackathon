import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Results } from "@/lib/types";
import { formatDate } from "@/lib/display";
import { Dashboard } from "@/components/Dashboard";

async function loadCuadResults(): Promise<Results | null> {
  try {
    const file = path.join(process.cwd(), "data", "cuad", "results.json");
    return JSON.parse(await readFile(file, "utf8")) as Results;
  } catch {
    return null;
  }
}

export default async function Page() {
  const cuadResults = await loadCuadResults();

  if (!cuadResults) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-20">
        <h1 className="mb-3 text-2xl">Nothing has been analysed yet</h1>
        <p className="text-[0.95rem] leading-relaxed">
          There is no <code>data/cuad/results.json</code> to read. Generate the bundled sample, or point
          the offline pipeline at any folder of contracts:
        </p>
        <pre className="card mt-4 p-3 text-sm">
          npm run cuad:pipeline{"\n"}npm run pipeline -- --corpus ./your-folder
        </pre>
      </main>
    );
  }

  return (
    <>
      {/* App chrome: a fixed bar that says what this is. */}
      <header className="sticky top-0 z-40" style={{ background: "var(--header)", color: "#fff" }}>
        <div className="mx-auto flex max-w-[100rem] flex-wrap items-baseline gap-x-5 gap-y-1 px-5 py-2.5 sm:px-7">
          <h1 className="text-[1.35rem] leading-none tracking-tight">AITHENA</h1>
          <p className="text-[0.82rem]" style={{ color: "var(--header-soft)" }}>
            Contract obligations, traced to the clause
          </p>
          <p className="ml-auto text-[0.78rem]" style={{ color: "var(--header-soft)" }}>
            CUAD sample read {formatDate(cuadResults.asOf)}
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

      <Dashboard cuadResults={cuadResults} />
    </>
  );
}
