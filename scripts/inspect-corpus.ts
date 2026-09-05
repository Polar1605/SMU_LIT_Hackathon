/**
 * Reports what the corpus actually looks like from a reader's point of view:
 * page counts, how much text each document exposes, and — for the scanned one —
 * that there is no text layer to cheat with.
 *
 * Also writes a PNG of any page so a scan can be eyeballed rather than assumed.
 *
 *   npm run inspect
 *   npm run inspect -- --render supplier-agreement-scanned.pdf:1 --out preview.png
 */

import { readdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";
import { openPdf } from "../lib/pdf.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      corpus: { type: "string", default: path.join(ROOT, "data", "corpus") },
      render: { type: "string" },
      out: { type: "string", default: "page.png" },
      grep: { type: "string" },
    },
  });

  const corpusDir = path.resolve(values.corpus!);
  const files = (await readdir(corpusDir)).filter((f) => f.endsWith(".pdf")).sort();

  console.log("file                              pages  text chars  note");
  for (const file of files) {
    const doc = await openPdf(path.join(corpusDir, file));
    let total = 0;
    const perPage: number[] = [];
    for (let p = 1; p <= doc.numPages; p += 1) {
      const text = (await doc.getPageText(p)).items.map((i) => i.str).join("");
      perPage.push(text.trim().length);
      total += text.trim().length;
    }
    const note = total === 0 ? "no text layer — OCR required" : `per page: ${perPage.join(", ")}`;
    console.log(`${file.padEnd(34)}${String(doc.numPages).padStart(4)}${String(total).padStart(12)}  ${note}`);
    await doc.close();
  }

  if (values.grep) {
    console.log(`\nsearching for ${JSON.stringify(values.grep)}:`);
    for (const file of files) {
      const doc = await openPdf(path.join(corpusDir, file));
      for (let p = 1; p <= doc.numPages; p += 1) {
        const text = (await doc.getPageText(p)).items.map((i) => i.str).join(" ");
        if (text.includes(values.grep)) console.log(`  ${file} page ${p}`);
      }
      await doc.close();
    }
  }

  if (values.render) {
    const [fileName, pageStr] = values.render.split(":");
    const doc = await openPdf(path.join(corpusDir, fileName));
    const canvas = await doc.renderPage(Number(pageStr ?? 1), 1.4);
    await writeFile(values.out!, await canvas.encode("png"));
    await doc.close();
    console.log(`\nrendered ${values.render} -> ${values.out}`);
  }
}

await main();
