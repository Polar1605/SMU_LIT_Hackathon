"use client";

/**
 * Shows the clause behind a claim, in the document it came from.
 *
 * One code path for every PDF: the page is rendered to a canvas and the verified
 * span is drawn over it as absolutely-positioned boxes, scaled from the stored
 * geometry. Nothing here reads a text layer, which is precisely why the scanned
 * document works the same way as the born-digital ones — its boxes come from
 * character recognition, and the viewer neither knows nor cares.
 *
 * A word-processor file has no pages to render, so it shows the passage in its
 * surrounding text and says plainly that page numbers do not apply, rather than
 * drawing an illustration of a page that does not exist.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Citation, ContractResult } from "@/lib/types";
import { citationRef, matchNote } from "@/lib/display";

interface SlimDoc {
  fullText: string;
  html: string | null;
}

export function EvidenceViewer({
  citation,
  contract,
  onClose,
}: {
  citation: Citation;
  contract: ContractResult;
  onClose: () => void;
}) {
  const [page, setPage] = useState(citation.pageNum ?? 1);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [slim, setSlim] = useState<SlimDoc | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* ---- word-processor documents: show the passage in context ---- */

  useEffect(() => {
    if (contract.paginated) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/parsed/${contract.docId}.json`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as SlimDoc;
        if (!cancelled) {
          setSlim(data);
          setStatus("ready");
        }
      } catch (error) {
        if (!cancelled) {
          setStatus("error");
          setMessage(
            `The source text for ${contract.fileName} could not be loaded, so this passage cannot be shown in context. Run: npm run compute`,
          );
        }
        void error;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contract.docId, contract.fileName, contract.paginated]);

  /* ---- PDFs: render the page, then draw the verified span over it ---- */

  const renderPage = useCallback(async () => {
    if (!contract.paginated) return;
    setStatus("loading");
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

      const doc = await pdfjs.getDocument({ url: `/corpus/${contract.fileName}` }).promise;
      const pdfPage = await doc.getPage(page);

      // Render at device resolution so the scan stays legible when zoomed.
      const scale = Math.min(2, (window.devicePixelRatio || 1) * 1.4);
      const viewport = pdfPage.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${Math.ceil(viewport.width / scale)}px`;
      canvas.style.height = `${Math.ceil(viewport.height / scale)}px`;

      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser did not provide a 2D canvas context.");
      await pdfPage.render({ canvasContext: context, viewport, canvas }).promise;

      if (layerRef.current) {
        layerRef.current.style.width = `${Math.ceil(viewport.width / scale)}px`;
        layerRef.current.style.height = `${Math.ceil(viewport.height / scale)}px`;
      }

      await doc.cleanup();
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setMessage(
        `${contract.fileName} could not be rendered, so the clause cannot be shown in place: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }, [contract.fileName, contract.paginated, page]);

  useEffect(() => {
    void renderPage();
  }, [renderPage]);

  const boxes = citation.bboxes.filter((b) => b.pageNum === page);
  const otherPages = [...new Set(citation.bboxes.map((b) => b.pageNum))];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Evidence for ${citation.clauseId}`}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: "rgba(22, 38, 43, 0.55)" }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet w-full max-w-4xl">
        <header
          className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-3.5"
          style={{ borderColor: "var(--rule)" }}
        >
          <div className="min-w-0">
            <h2 className="text-[1.05rem]">{citation.docTitle}</h2>
            <p className="ref mt-0.5" style={{ color: "var(--ink-faint)" }}>
              {citationRef(citation)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border px-2.5 py-1 text-sm"
            style={{ borderColor: "var(--rule-strong)" }}
          >
            Close
          </button>
        </header>

        <div className="px-5 py-4">
          <blockquote
            className="mb-4 border-l-2 pl-3 text-[0.92rem] leading-relaxed"
            style={{ borderColor: "var(--found)", fontFamily: "var(--font-newsreader)" }}
          >
            {citation.quotedText}
          </blockquote>

          {status === "error" && (
            <p
              className="border-l-4 px-3 py-2 text-[0.88rem]"
              style={{ borderColor: "var(--alert)", background: "var(--alert-wash)" }}
            >
              {message}
            </p>
          )}

          {contract.paginated ? (
            <>
              {otherPages.length > 1 && (
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-[0.85rem]" style={{ color: "var(--ink-soft)" }}>
                    This clause runs across two pages:
                  </span>
                  {otherPages.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPage(n)}
                      className="ref border px-2 py-0.5"
                      style={{
                        borderColor: n === page ? "var(--ink)" : "var(--rule)",
                        background: n === page ? "var(--sheet-sunk)" : "transparent",
                      }}
                    >
                      page {n}
                    </button>
                  ))}
                </div>
              )}

              <div
                className="relative mx-auto w-fit border"
                style={{ borderColor: "var(--rule-strong)", background: "#fff" }}
              >
                <canvas ref={canvasRef} className="block" />
                <div ref={layerRef} className="pointer-events-none absolute left-0 top-0">
                  {boxes.map((box, i) => (
                    <span
                      key={i}
                      className="evidence-box"
                      data-kind={citation.matchKind}
                      style={{
                        left: `${box.box.x}px`,
                        top: `${box.box.y}px`,
                        width: `${box.box.w}px`,
                        height: `${box.box.h}px`,
                      }}
                    />
                  ))}
                </div>
                {status === "loading" && (
                  <p className="px-6 py-10 text-center text-sm" style={{ color: "var(--ink-soft)" }}>
                    Rendering page {page}…
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="mb-3 text-[0.85rem]" style={{ color: "var(--ink-soft)" }}>
                This is a word-processor file. It has no fixed pagination, so there is no page number to
                cite and none is shown — the passage is highlighted in its surrounding text instead.
              </p>
              {slim && (
                <div
                  className="max-h-[26rem] overflow-y-auto border p-4 text-[0.88rem] leading-relaxed"
                  style={{ borderColor: "var(--rule)", background: "#fff" }}
                >
                  <Context text={slim.fullText} start={citation.charStart} end={citation.charEnd} />
                </div>
              )}
            </>
          )}

          <p className="mt-4 text-[0.82rem]" style={{ color: "var(--ink-soft)" }}>
            {matchNote(citation)}
          </p>
        </div>
      </div>
    </div>
  );
}

/** The cited span in its surrounding paragraph, marked in place. */
function Context({ text, start, end }: { text: string; start: number; end: number }) {
  const from = Math.max(0, start - 700);
  const to = Math.min(text.length, end + 700);

  return (
    <p className="whitespace-pre-wrap">
      {from > 0 && "… "}
      {text.slice(from, start)}
      <mark style={{ background: "rgba(31, 93, 76, 0.18)", borderBottom: "2px solid var(--found)" }}>
        {text.slice(start, end)}
      </mark>
      {text.slice(end, to)}
      {to < text.length && " …"}
    </p>
  );
}
