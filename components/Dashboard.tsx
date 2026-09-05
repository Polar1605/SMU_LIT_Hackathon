"use client";

/**
 * App chrome and routing: header, disclaimer, the seven-tab bar, the
 * add-document control, and which portfolio is currently showing.
 *
 * Every tab is its own file under components/tabs/ — this component only
 * owns state that genuinely crosses tab boundaries (which contract is
 * selected, which tab is active) and the upload machinery. Files are staged
 * in a browser-only queue, then submitted as a group through per-document requests to
 * /api/ingest and /api/extract, assembled client-side with the exact
 * lib/assemble.ts functions the CLI uses, held only in this browser tab.
 * No database, no server-side session — see lib/client-pipeline.ts.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Results } from "@/lib/types";
import { runUploadPipeline, type DocumentProgress, type UploadedDocument } from "@/lib/client-pipeline";
import { PortfolioSourceContext } from "@/lib/portfolio-source";
import { collectUncertainties } from "@/lib/uncertainties";

import { SummaryTab } from "@/components/tabs/SummaryTab";
import { DeadlinesTab } from "@/components/tabs/DeadlinesTab";
import { CalendarTab } from "@/components/tabs/CalendarTab";
import { UncertaintiesTab } from "@/components/tabs/UncertaintiesTab";
import { EscalationsTab } from "@/components/tabs/EscalationsTab";
import { LimitsTab } from "@/components/tabs/LimitsTab";
import { Workspace } from "@/components/Workspace";

const TABS = [
  "summary",
  "deadlines",
  "calendar",
  "contracts",
  "uncertainties",
  "escalations",
  "limits",
] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  summary: "Summary",
  deadlines: "Deadlines",
  calendar: "Calendar",
  contracts: "Contracts",
  uncertainties: "Uncertainties",
  escalations: "Escalations",
  limits: "Limits",
};

interface QueuedDocument {
  id: string;
  file: File;
}

export function Dashboard({ cuadResults }: { cuadResults: Results }) {
  const [results, setResults] = useState<Results>(cuadResults);
  const [source, setSource] = useState<"cuad" | "uploaded">("cuad");
  const [uploadedDocs, setUploadedDocs] = useState<Map<string, UploadedDocument>>(new Map());

  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [docId, setDocId] = useState<string | null>(null);

  const [phase, setPhase] = useState<"idle" | "processing" | "error">("idle");
  const [progress, setProgress] = useState<DocumentProgress[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [queuedDocuments, setQueuedDocuments] = useState<QueuedDocument[]>([]);

  const filesInputRef = useRef<HTMLInputElement>(null);

  const hasUnsavedWork = phase === "processing" || source === "uploaded" || queuedDocuments.length > 0;
  useEffect(() => {
    if (!hasUnsavedWork) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedWork]);

  async function processFiles(files: File[]): Promise<void> {
    if (files.length === 0) return;
    setPhase("processing");
    setUploadError(null);
    setProgress(files.map((f, i) => ({ id: `${i}-${f.name}`, fileName: f.name, status: "queued" })));

    try {
      const outcome = await runUploadPipeline({
        files,
        asOf: new Date(),
        windowDays: 90,
        onProgress: setProgress,
      });
      setResults(outcome.results);
      setUploadedDocs(outcome.documents);
      setSource("uploaded");
      setActiveTab("summary");
      setDocId(null);
      setQueuedDocuments([]);
      setPhase("idle");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error));
      setPhase("error");
    }
  }

  function handleFileInput(fileList: FileList | null): void {
    if (!fileList || fileList.length === 0) return;
    const valid = Array.from(fileList).filter((f) => /\.(pdf|docx)$/i.test(f.name));
    if (valid.length === 0) {
      setUploadError("No .pdf or .docx files were found in that selection.");
      setPhase("error");
      return;
    }
    setQueuedDocuments((current) => [
      ...current,
      ...valid.map((file) => ({ id: `${crypto.randomUUID()}-${file.name}`, file })),
    ]);
    setUploadError(null);
    setPhase("idle");
  }

  function removeQueuedDocument(id: string): void {
    setQueuedDocuments((current) => current.filter((document) => document.id !== id));
  }

  function submitQueuedDocuments(): void {
    if (queuedDocuments.length === 0 || phase === "processing") return;
    void processFiles(queuedDocuments.map((document) => document.file));
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
    setQueuedDocuments([]);
    setSource("cuad");
    setPhase("idle");
    setActiveTab("summary");
    setDocId(null);
  }

  function openContract(id: string): void {
    setActiveTab("contracts");
    setDocId(id);
  }

  const uncertainties = useMemo(() => collectUncertainties(results.contracts), [results]);
  const datedCount = useMemo(
    () => results.calendar.filter((e) => e.actionDeadline !== null).length,
    [results],
  );
  const next90Count = useMemo(
    () => results.calendar.filter((e) => e.daysUntilDeadline !== null && e.daysUntilDeadline >= 0 && e.daysUntilDeadline <= 90).length,
    [results],
  );

  const tabCount: Record<Tab, number | null> = {
    summary: null,
    deadlines: datedCount,
    calendar: next90Count,
    contracts: results.contracts.length,
    uncertainties: uncertainties.length,
    escalations: results.escalations.length,
    limits: results.refusals.length,
  };

  const uploadedDocsForContext = useMemo(
    () => (uploadedDocs.size > 0 ? uploadedDocs : null),
    [uploadedDocs],
  );

  function openFilePicker(): void {
    filesInputRef.current?.click();
  }

  return (
    <PortfolioSourceContext.Provider value={uploadedDocsForContext}>
      <input
        ref={filesInputRef}
        type="file"
        accept=".pdf,.docx"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFileInput(e.target.files);
          // Allow choosing the same file again after removing it from the queue.
          e.currentTarget.value = "";
        }}
      />

      <header style={{ background: "var(--header)", color: "#fbfcfe" }}>
        <div
          className="mx-auto flex max-w-[88rem] flex-wrap items-baseline gap-x-7 gap-y-1 px-10 py-[18px]"
        >
          <h1 className="m-0 text-2xl uppercase" style={{ letterSpacing: "0.2em", lineHeight: 1 }}>
            CLARA
          </h1>
          <p className="m-0 italic" style={{ fontSize: "0.95rem", color: "var(--header-muted)" }}>
            Contract Liability &amp; Agreement Risk Assistant
          </p>
        </div>
      </header>

      <div style={{ background: "var(--header-disclaimer)", color: "#dbe6eb" }}>
        <p className="mx-auto max-w-[88rem] px-10 py-2.5" style={{ fontSize: "0.82rem", lineHeight: 1.5 }}>
          <strong style={{ fontWeight: 600, color: "#fbfcfe" }}>Not legal advice.</strong> CLARA reports
          what these documents say and when they require action. It does not tell you what to do, does
          not interpret the law, and makes no claim it cannot trace to a clause it has read.
        </p>
      </div>

      <nav
        aria-label="Sections"
        className="sticky top-0 z-30"
        style={{ background: "var(--page)", borderBottom: "1px solid var(--rule)" }}
      >
        <div className="mx-auto flex max-w-[88rem] flex-wrap items-center gap-x-[30px] px-10">
          {TABS.map((tab) => {
            const active = activeTab === tab;
            const count = tabCount[tab];
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                aria-current={active ? "page" : undefined}
                className="ui inline-flex items-baseline gap-2 border-0 bg-transparent uppercase"
                style={{
                  cursor: "pointer",
                  padding: "15px 0 13px",
                  marginBottom: "-1px",
                  borderBottom: `2px solid ${active ? "var(--ink)" : "transparent"}`,
                  fontSize: "0.72rem",
                  letterSpacing: "0.13em",
                  color: active ? "var(--ink)" : "var(--muted-strong)",
                }}
              >
                {TAB_LABEL[tab]}
                {count !== null && (
                  <span style={{ fontSize: "0.66rem", letterSpacing: "0.04em", color: active ? "var(--accent-blue)" : "var(--muted)" }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          <div className="ml-auto self-center py-2">
            <button
              type="button"
              onClick={openFilePicker}
              disabled={phase === "processing"}
              className="ui inline-flex items-center gap-2 uppercase"
              style={{
                cursor: phase === "processing" ? "wait" : "pointer",
                background: "var(--header)",
                color: "#fbfcfe",
                border: "1px solid var(--header)",
                borderRadius: "2px",
                padding: "9px 16px",
                fontSize: "0.7rem",
                letterSpacing: "0.13em",
              }}
            >
              <span aria-hidden="true" style={{ fontSize: "0.95rem", lineHeight: 1, fontFamily: "var(--font-plex)" }}>
                +
              </span>
              {phase === "processing" ? "Processing…" : "Add document"}
            </button>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-[88rem] px-10 pb-[88px] pt-9">
        <div
          className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2"
          style={{ fontSize: "0.82rem", color: "var(--muted)" }}
        >
          <span>
            {source === "cuad"
              ? `Showing the CUAD sample — ${results.contracts.length} real contracts.`
              : `Showing your upload — ${results.contracts.length} contract${results.contracts.length === 1 ? "" : "s"}. Held only in this browser tab; refreshing returns to the CUAD sample.`}
          </span>
          {source === "uploaded" && (
            <button type="button" className="btn" onClick={resetToSample}>
              Back to CUAD sample
            </button>
          )}
        </div>

        {phase === "error" && uploadError && (
          <div
            className="card mb-5 px-4 py-3"
            style={{ borderLeftWidth: "4px", borderLeftColor: "var(--accent-blue)" }}
          >
            <p style={{ fontSize: "0.88rem" }}>Upload could not be processed: {uploadError}</p>
          </div>
        )}

        {queuedDocuments.length > 0 && phase !== "processing" && (
          <section className="card mb-5 px-4 py-3.5" aria-label="Documents ready to submit">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 style={{ fontSize: "0.98rem" }}>Ready to analyse</h2>
                <p className="mt-1" style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                  Add more files if needed. Nothing is processed until you submit this group.
                </p>
              </div>
              <button type="button" className="btn" onClick={submitQueuedDocuments}>
                Submit {queuedDocuments.length} document{queuedDocuments.length === 1 ? "" : "s"}
              </button>
            </div>
            <ul className="divide-y" style={{ borderColor: "var(--wash-alt)" }}>
              {queuedDocuments.map((document) => (
                <li key={document.id} className="flex items-center gap-3 py-2" style={{ fontSize: "0.85rem" }}>
                  <span className="min-w-0 flex-1 truncate">{document.file.name}</span>
                  <span className="shrink-0" style={{ color: "var(--muted)", fontSize: "0.76rem" }}>
                    {(document.file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <button
                    type="button"
                    onClick={() => removeQueuedDocument(document.id)}
                    className="cite ref shrink-0"
                    style={{ color: "var(--accent-blue)" }}
                    aria-label={`Remove ${document.file.name} from the submission`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {phase === "processing" && (
          <div className="card mb-5 px-4 py-3.5" aria-live="polite">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 style={{ fontSize: "0.98rem" }}>
                Processing — {progress.filter((p) => p.status === "done").length} of {progress.length} done
                {progress.some((p) => p.status === "failed") &&
                  `, ${progress.filter((p) => p.status === "failed").length} failed`}
              </h2>
              <span className="ui" style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                each document runs independently
              </span>
            </div>
            <ul className="max-h-64 space-y-1 overflow-y-auto" style={{ fontSize: "0.82rem" }}>
              {progress.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background:
                        p.status === "done"
                          ? "var(--found)"
                          : p.status === "failed"
                            ? "var(--accent-blue)"
                            : p.status === "queued"
                              ? "var(--disabled)"
                              : "var(--inferred)",
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">{p.fileName}</span>
                  <span className="ui shrink-0" style={{ color: "var(--muted)" }}>
                    {p.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {activeTab === "summary" && <SummaryTab results={results} onOpenContract={openContract} />}
        {activeTab === "deadlines" && <DeadlinesTab results={results} onOpenContract={openContract} />}
        {activeTab === "calendar" && <CalendarTab results={results} onOpenContract={openContract} />}
        {activeTab === "contracts" && (
          <Workspace
            contracts={results.contracts}
            calendar={results.calendar}
            selectedDocId={docId}
            onSelectDocId={setDocId}
          />
        )}
        {activeTab === "uncertainties" && <UncertaintiesTab results={results} />}
        {activeTab === "escalations" && <EscalationsTab results={results} />}
        {activeTab === "limits" && <LimitsTab refusals={results.refusals} />}
      </div>
    </PortfolioSourceContext.Provider>
  );
}
