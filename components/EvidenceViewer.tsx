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
import { useUploadedDocument } from "@/lib/portfolio-source";

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
  const uploaded = useUploadedDocument(contract.docId);

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

    // An uploaded document's text is already in memory — nothing to fetch.
    if (uploaded) {
      setSlim({ fullText: uploaded.parsedDoc.fullText, html: uploaded.parsedDoc.html ?? null });
      setStatus("ready");
      return;
    }

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
  }, [contract.docId, contract.fileName, contract.paginated, uploaded]);

  /* ---- PDFs: render the page, then draw the verified span over it ---- */

  const renderPage = useCallback(async () => {
    if (!contract.paginated) return;
    setStatus("loading");
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

      // An uploaded PDF's bytes are already in memory — pdfjs takes them
      // directly, with no server round trip, exactly as it does for the
      // static corpora except reading from memory instead of a URL.
      const doc = uploaded
        ? await pdfjs.getDocument({ data: new Uint8Array(uploaded.bytes.slice(0)) }).promise
        : await pdfjs.getDocument({ url: `/corpus/${contract.fileName}` }).promise;
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
  }, [contract.fileName, contract.paginated, page, uploaded]);

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
      style={{ background: "rgba(18, 30, 45, 0.5)" }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div style={{ width: "100%", maxWidth: "56rem", background: "var(--card)", border: "1px solid var(--rule)", borderRadius: "3px", boxShadow: "var(--shadow-modal)" }}>
        <header
          className="flex flex-wrap items-start justify-between gap-3"
          style={{ borderBottom: "1px solid var(--rule)", padding: "14px 20px" }}
        >
          <div className="min-w-0">
            <h2 style={{ margin: 0, fontSize: "1.2rem", letterSpacing: "-0.008em" }}>{citation.docTitle}</h2>
            <p className="ref" style={{ margin: "2px 0 0", color: "var(--muted-strong)" }}>
              {citationRef(citation)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn"
            style={{ fontSize: "0.82rem" }}
          >
            Close
          </button>
        </header>

        <div className="px-5 py-4">
          <blockquote
            className="mb-4 pl-3 text-[0.92rem] leading-relaxed"
            style={{ borderLeft: "2px solid var(--found)", fontFamily: "var(--font-newsreader)" }}
          >
            {citation.quotedText}
          </blockquote>

          {status === "error" && (
            <p
              className="px-3 py-2 text-[0.88rem]"
              style={{ borderLeft: "4px solid var(--accent-blue)", background: "var(--conflict-bg)" }}
            >
              {message}
            </p>
          )}

          {contract.paginated ? (
            <>
              {otherPages.length > 1 && (
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-[0.85rem]" style={{ color: "var(--muted)" }}>
                    This clause runs across two pages:
                  </span>
                  {otherPages.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPage(n)}
                      className="ref"
                      style={{
                        border: `1px solid ${n === page ? "var(--ink)" : "var(--rule)"}`,
                        padding: "2px 8px",
                        background: n === page ? "var(--wash-alt)" : "transparent",
                      }}
                    >
                      page {n}
                    </button>
                  ))}
                </div>
              )}

              <div
                className="relative mx-auto w-fit"
                style={{ border: "1px solid var(--input-border)", background: "#fff" }}
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
                  <p className="px-6 py-10 text-center text-sm" style={{ color: "var(--muted)" }}>
                    Rendering page {page}…
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="mb-3 text-[0.85rem]" style={{ color: "var(--muted)" }}>
                This is a word-processor file. It has no fixed pagination, so there is no page number to
                cite and none is shown — the passage is highlighted in its surrounding text instead.
              </p>
              {slim && (
                <div
                  className="max-h-[26rem] overflow-y-auto p-4 text-[0.88rem] leading-relaxed"
                  style={{ border: "1px solid var(--rule)", background: "#fff" }}
                >
                  <Context text={slim.fullText} start={citation.charStart} end={citation.charEnd} />
                </div>
              )}
            </>
          )}

          <p className="mt-4 text-[0.82rem]" style={{ color: "var(--muted)" }}>
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
      <mark style={{ background: "rgba(26, 122, 176, 0.18)", borderBottom: "2px solid var(--found)" }}>
        {text.slice(start, end)}
      </mark>
      {text.slice(end, to)}
      {to < text.length && " …"}
    </p>
  );
}
