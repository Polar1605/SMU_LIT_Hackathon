/**
 * A small typesetter for the generated corpus.
 *
 * We need real page breaks (so page-number derivation has something to derive),
 * real clause numbering (so citations have clause ids), and the ability to force
 * a clause across a page boundary (so the cross-page span path is exercised by a
 * real document rather than only by a unit-test fixture).
 *
 * Note on characters: pdf-lib's standard fonts use WinAnsi, which covers curly
 * quotes and en/em dashes — so the corpus does exercise the normaliser's quote
 * and dash unification. It does not cover ligatures (fi, fl), so that branch of
 * the normaliser is covered by tests/fixtures rather than by a generated PDF.
 */

import { PDFDocument, StandardFonts, type PDFFont, type PDFPage, rgb } from "pdf-lib";

export interface Clause {
  /** "3.1", or "Parties" for an unnumbered block. */
  id: string;
  heading?: string;
  /** Paragraphs separated by a blank line. */
  body: string;
  pageBreakBefore?: boolean;
  /**
   * Push this clause down the page so it starts a couple of lines from the
   * bottom, guaranteeing its text flows onto the next page.
   */
  startNearPageBottom?: boolean;
  /** Rendered without a clause number (used for the parties block, schedules). */
  unnumbered?: boolean;
}

export interface DocSpec {
  docId: string;
  title: string;
  subtitle?: string;
  font: "times" | "helvetica" | "courier";
  clauses: Clause[];
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 64;
const BODY_SIZE = 10.5;
const LINE_GAP = 4.2;
const FOOTER_SIZE = 8;

interface FontSet {
  regular: PDFFont;
  bold: PDFFont;
}

async function loadFonts(pdf: PDFDocument, which: DocSpec["font"]): Promise<FontSet> {
  const map = {
    times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold],
    helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold],
    courier: [StandardFonts.Courier, StandardFonts.CourierBold],
  } as const;
  const [r, b] = map[which];
  return { regular: await pdf.embedFont(r), bold: await pdf.embedFont(b) };
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * A cursor that lays text down the page and starts a new one when it runs out
 * of room. Kept deliberately dumb — this is corpus scaffolding, not a rendering
 * engine we have to maintain.
 */
class Layout {
  private page: PDFPage;
  private y: number;
  readonly pages: PDFPage[] = [];
  private readonly contentWidth: number;

  constructor(
    private readonly pdf: PDFDocument,
    private readonly fonts: FontSet,
  ) {
    this.contentWidth = A4.width - MARGIN * 2;
    this.page = this.newPage();
    this.y = A4.height - MARGIN;
  }

  private newPage(): PDFPage {
    const page = this.pdf.addPage([A4.width, A4.height]);
    this.pages.push(page);
    this.page = page;
    this.y = A4.height - MARGIN;
    return page;
  }

  get remaining(): number {
    return this.y - MARGIN;
  }

  breakPage(): void {
    this.newPage();
  }

  space(points: number): void {
    this.y -= points;
    if (this.remaining <= 0) this.newPage();
  }

  /** Force the cursor to sit `points` above the bottom margin. */
  pushToNearBottom(points: number): void {
    if (this.y - points <= MARGIN) return; // already low enough
    this.y = MARGIN + points;
  }

  text(
    content: string,
    opts: { size?: number; bold?: boolean; indent?: number; gapAfter?: number } = {},
  ): void {
    const size = opts.size ?? BODY_SIZE;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const indent = opts.indent ?? 0;
    const lines = wrap(content, font, size, this.contentWidth - indent);
    for (const line of lines) {
      if (this.remaining < size + LINE_GAP) this.newPage();
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y - size,
        size,
        font,
        color: rgb(0.08, 0.08, 0.1),
      });
      this.y -= size + LINE_GAP;
    }
    if (opts.gapAfter) this.space(opts.gapAfter);
  }

  finish(docTitle: string): void {
    this.pages.forEach((page, i) => {
      const label = `${docTitle}  ·  page ${i + 1} of ${this.pages.length}`;
      page.drawText(label, {
        x: MARGIN,
        y: MARGIN - 22,
        size: FOOTER_SIZE,
        font: this.fonts.regular,
        color: rgb(0.45, 0.45, 0.5),
      });
    });
  }
}

export async function renderPdf(spec: DocSpec): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(spec.title);
  const fonts = await loadFonts(pdf, spec.font);
  const layout = new Layout(pdf, fonts);

  layout.text(spec.title.toUpperCase(), { size: 14, bold: true, gapAfter: 6 });
  if (spec.subtitle) layout.text(spec.subtitle, { size: 10, gapAfter: 10 });
  else layout.space(8);

  for (const clause of spec.clauses) {
    if (clause.pageBreakBefore) layout.breakPage();
    if (clause.startNearPageBottom) layout.pushToNearBottom(34);

    const headingText = clause.unnumbered
      ? (clause.heading ?? clause.id)
      : clause.heading
        ? `${clause.id}  ${clause.heading}`
        : clause.id;
    layout.text(headingText, { size: 10.5, bold: true, gapAfter: 2 });

    const paragraphs = clause.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    paragraphs.forEach((paragraph, i) => {
      layout.text(paragraph, { indent: 14, gapAfter: i === paragraphs.length - 1 ? 9 : 5 });
    });
  }

  layout.finish(spec.title);
  return pdf.save();
}
