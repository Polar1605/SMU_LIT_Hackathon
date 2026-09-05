import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Results } from "@/lib/types";
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

  // Dashboard.tsx owns all of the app chrome now (header, disclaimer, tab
  // bar) — this page is just the server-side data load. It used to also
  // render its own header here, which duplicated Dashboard's.
  return <Dashboard cuadResults={cuadResults} />;
}
