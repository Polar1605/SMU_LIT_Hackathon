"use client";

/**
 * Everything interactive: which portfolio is showing, the tabs, the upload
 * control, and the progress view while a batch is being processed.
 *
 * Starts showing the bundled CUAD sample — 30 real, lawyer-annotated
 * contracts, already processed at build time, so the page opens instantly and
 * offline exactly as before. Uploading a batch replaces what is displayed,
 * for this browser tab only: nothing is written to a server, nothing is
 * shared with anyone else who opens this page, and there is no database
 * behind any of it. A refresh reverts to the CUAD sample, which is why a
 * confirmation prompt guards against losing a completed or in-progress
 * upload by accident.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Confidence, Results } from "@/lib/types";
import { CONFIDENCE_LABEL, CONFIDENCE_MEANING, CONFIDENCE_VAR } from "@/lib/display";
import { runUploadPipeline, type DocumentProgress, type UploadedDocument } from "@/lib/client-pipeline";
import { PortfolioSourceContext } from "@/lib/portfolio-source";
import { CalendarGrid, NextDeadline } from "@/components/CalendarGrid";
import { ConflictBanner, EscalationBriefCard, RefusalPanel, Unavailable } from "@/components/panels";
import { Workspace } from "@/components/Workspace";

const LEVELS: Confidence[] = ["FOUND", "INFERRED", "UNCERTAIN", "NOT_FOUND"];
const TABS = ["overview", "calendar", "contracts", "escalations"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  overview: "Overview",
  calendar: "Calendar",
  contracts: "Contracts",
  escalations: "Escalations",
};

export function Dashboard({ cuadResults }: { cuadResults: Results }) {
  const [results, setResults] = useState<Results>(cuadResults);
  const [source, setSource] = useState<"cuad" | "uploaded">("cuad");
  const [uploadedDocs, setUploadedDocs] = useState<Map<string, UploadedDocument>>(new Map());
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const [phase, setPhase] = useState<"idle" | "processing" | "error">("idle");
  const [progress, setProgress] = useState<DocumentProgress[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Guards against losing a completed or in-progress upload to an accidental
  // refresh or closed tab. There is nowhere for the data to go if it is lost —
  // no database, no server copy — so the only real protection is not losing it
  // in the first place.
  const hasUnsavedWork = phase === "processing" || source === "uploaded";
  useEffect(() => {
    if (!hasUnsavedWork) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedWork]);

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    const list = Array.from(files).filter((f) => /\.(pdf|docx)$/i.test(f.name));
    if (list.length === 0) {
      setUploadError("No .pdf or .docx files were found in that selection.");
      setPhase("error");
      return;
    }

    setPhase("processing");
    setUploadError(null);
    setProgress(list.map((f, i) => ({ id: `${i}-${f.name}`, fileName: f.name, status: "queued" })));

    try {
      const outcome = await runUploadPipeline({
        files: list,
        asOf: new Date(),
        windowDays: 90,
        onProgress: setProgress,
      });
      setResults(outcome.results);
      setUploadedDocs(outcome.documents);
      setSource("uploaded");
      setActiveTab("overview");
      setPhase("idle");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error));
      setPhase("error");
    }
  }

  function resetToSample(): void {
    if (hasUnsavedWork) {
      const proceed = window.confirm(
        "Switch back to the CUAD sample? Your uploaded results are not saved anywhere and will be lost.",
      );
      if (!proceed) return;
    }
    setResults(cuadResults);
    setUploadedDocs(new Map());
    setSource("cuad");
    setPhase("idle");
    setActiveTab("overview");
  }

  const fields = results.contracts.flatMap((c) => c.fields);
  const tally = (level: Confidence) => fields.filter((f) => f.confidence === level).length;
  const doneCount = progress.filter((p) => p.status === "done").length;
  const failedCount = progress.filter((p) => p.status === "failed").length;

  const uploadedDocsForContext = useMemo(
    () => (uploadedDocs.size > 0 ? uploadedDocs : null),
    [uploadedDocs],
  );

  return (
    <PortfolioSourceContext.Provider value={uploadedDocsForContext}>
      <div className="mx-auto max-w-[100rem] px-5 pb-16 pt-5 sm:px-7">
        {/* Upload control and what is currently showing. */}
        <section className="card mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[0.92rem] font-medium">
              {source === "cuad"
                ? `Showing the CUAD sample — ${results.contracts.length} real contracts`
                : `Showing your upload — ${results.contracts.length} contract${results.contracts.length === 1 ? "" : "s"}`}
            </p>
            <p className="text-[0.78rem]" style={{ color: "var(--ink-soft)" }}>
              {source === "cuad"
                ? "Pre-analysed and bundled with the app. Upload your own contracts to replace this view."
                : "Held only in this browser tab. Nothing was saved to a server; refreshing returns to the CUAD sample."}
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx"
            multiple
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <button
            type="button"
            className="btn"
            disabled={phase === "processing"}
            onClick={() => fileInputRef.current?.click()}
          >
            {phase === "processing" ? "Processing…" : "Upload contracts"}
          </button>
          {source === "uploaded" && (
            <button type="button" className="btn" onClick={resetToSample}>
              Back to CUAD sample
            </button>
          )}
        </section>

        {phase === "error" && uploadError && (
          <section
            className="card mb-5 border-l-4 px-4 py-3"
            style={{ borderLeftColor: "var(--alert)", background: "var(--alert-bg)" }}
          >
            <p className="text-[0.88rem]">Upload could not be processed: {uploadError}</p>
          </section>
        )}

        {phase === "processing" && (
          <section className="card mb-5 px-4 py-3.5" aria-live="polite">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-[0.98rem]">
                Processing — {doneCount} of {progress.length} done
                {failedCount > 0 && `, ${failedCount} failed`}
              </h2>
              <span className="ui text-[0.75rem]" style={{ color: "var(--ink-faint)" }}>
                each document runs independently
              </span>
            </div>
            <ul className="max-h-64 space-y-1 overflow-y-auto text-[0.82rem]">
              {progress.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <StatusDot status={p.status} />
                  <span className="min-w-0 flex-1 truncate">{p.fileName}</span>
                  <span className="ui shrink-0" style={{ color: "var(--ink-faint)" }}>
                    {p.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <dl className="card mb-5 grid gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-2 xl:grid-cols-4">
          {LEVELS.map((level) => (
            <div key={level}>
              <dt className="mb-0.5 flex items-baseline gap-2">
                <span className="ui text-[0.76rem] uppercase tracking-wide" style={{ color: CONFIDENCE_VAR[level] }}>
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

        <nav aria-label="Dashboard sections" className="mb-5 flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              aria-current={activeTab === tab ? "page" : undefined}
              className="ui px-3 py-2.5 text-[0.85rem]"
              style={{
                borderBottom: activeTab === tab ? "2px solid var(--header)" : "2px solid transparent",
                color: activeTab === tab ? "var(--ink)" : "var(--ink-soft)",
              }}
            >
              {TAB_LABEL[tab]}
              {tab === "escalations" && results.escalations.length > 0 && (
                <span
                  className="ml-1.5 rounded-full px-1.5 py-px text-[10px]"
                  style={{ background: "var(--alert-bg)", color: "var(--alert)" }}
                >
                  {results.escalations.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        {activeTab === "overview" && (
          <div className="max-w-3xl">
            <NextDeadline events={results.calendar} />
            <p className="text-[0.88rem] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              {results.contracts.length} contracts read. {tally("UNCERTAIN")} field
              {tally("UNCERTAIN") === 1 ? "" : "s"} could not be settled with confidence, and{" "}
              {tally("NOT_FOUND")} provision{tally("NOT_FOUND") === 1 ? "" : "s"} were identified as
              genuinely absent rather than unread. See Calendar for what falls due, Contracts for the
              detail behind every field, and Escalations for what needs a lawyer.
            </p>
          </div>
        )}

        {activeTab === "calendar" && (
          <div className="max-w-xl">
            <CalendarGrid
              events={results.calendar}
              contracts={results.contracts}
              asOf={results.asOf}
              windowDays={results.windowDays}
            />
          </div>
        )}

        {activeTab === "contracts" && <Workspace contracts={results.contracts} />}

        {activeTab === "escalations" && (
          <div>
            {results.escalations.length === 0 ? (
              <p className="text-[0.88rem]" style={{ color: "var(--ink-soft)" }}>
                Nothing in this portfolio has hit AITHENA&rsquo;s competence boundary — every liability,
                termination and exclusivity field settled with either a finding or a confirmed absence.
              </p>
            ) : (
              results.escalations.map((brief) => <EscalationBriefCard key={brief.id} brief={brief} />)
            )}
            <RefusalPanel refusals={results.refusals} />
            <Unavailable items={results.unavailable} />
          </div>
        )}
      </div>
    </PortfolioSourceContext.Provider>
  );
}

function StatusDot({ status }: { status: DocumentProgress["status"] }) {
  const color =
    status === "done"
      ? "var(--found)"
      : status === "failed"
        ? "var(--alert)"
        : status === "queued"
          ? "var(--ink-faint)"
          : "var(--inferred)";
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />;
}
