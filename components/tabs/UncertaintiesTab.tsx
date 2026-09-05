"use client";

import { useState } from "react";
import type { Citation, ContractResult, Results } from "@/lib/types";
import { citationRef } from "@/lib/display";
import { collectUncertainties } from "@/lib/uncertainties";
import { EvidenceViewer } from "@/components/EvidenceViewer";

export function UncertaintiesTab({ results }: { results: Results }) {
  const uncertainties = collectUncertainties(results.contracts);
  const undated = results.calendar.filter((e) => e.actionDeadline === null);
  const total = uncertainties.length + undated.length;

  const [evidence, setEvidence] = useState<{ citation: Citation; contract: ContractResult } | null>(null);
  function openCitation(citation: Citation): void {
    const contract = results.contracts.find((c) => c.docId === citation.docId);
    if (contract) setEvidence({ citation, contract });
  }

  return (
    <div style={{ maxWidth: "62rem" }}>
      <p
        style={{
          margin: "8px 0 0",
          maxWidth: "46ch",
          fontFamily: "var(--font-newsreader)",
          fontWeight: 300,
          fontSize: "clamp(1.5rem, 2.8vw, 2rem)",
          lineHeight: 1.25,
          letterSpacing: "-0.015em",
        }}
      >
        {total === 0
          ? "Nothing in this portfolio is left unsettled."
          : `${total} thing${total === 1 ? "" : "s"} this portfolio ${total === 1 ? "does" : "do"} not settle.`}
      </p>
      <p style={{ margin: "16px 0 0", maxWidth: "66ch", fontSize: "0.95rem", lineHeight: 1.65, color: "var(--muted)" }}>
        Each was found in the document but could not be stated plainly — the clause leaves it open, two
        clauses disagree, or the scan could not be read reliably. The reason is given in every case, with
        the clause behind it.
      </p>

      <h2 className="ui" style={{ margin: "38px 0 0", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--muted-strong)" }}>
        Unsettled by the document
      </h2>
      {uncertainties.length === 0 ? (
        <p style={{ margin: "18px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
          Nothing was left unresolved by the documents themselves.
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {uncertainties.map((item) => (
            <li
              key={item.id}
              style={{ display: "grid", gridTemplateColumns: "minmax(0, 15rem) minmax(0, 1fr)", columnGap: "32px", rowGap: "8px", padding: "18px 0", borderTop: "1px solid var(--rule)" }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontFamily: "var(--font-newsreader)", fontSize: "1.02rem", lineHeight: 1.35 }}>{item.docTitle}</p>
                <p className="ui" style={{ margin: "4px 0 0", fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--uncertain)" }}>
                  {item.kind}
                </p>
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontFamily: "var(--font-newsreader)", fontSize: "1.06rem", lineHeight: 1.5 }}>{item.value}</p>
                {item.reasons.map((reason, i) => (
                  <p key={i} style={{ margin: "10px 0 0", borderLeft: "2px solid var(--uncertain)", paddingLeft: "14px", fontSize: "0.87rem", lineHeight: 1.6, color: "var(--muted)" }}>
                    {reason}
                  </p>
                ))}
                {item.citations.map((citation, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => openCitation(citation)}
                    className="cite ref"
                    style={{ marginRight: "8px", marginTop: "8px" }}
                  >
                    {citationRef(citation)}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="ui" style={{ margin: "40px 0 0", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--muted-strong)" }}>
        Owed, but never dated
      </h2>
      {undated.length === 0 ? (
        <p style={{ margin: "18px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
          Every obligation in this portfolio has a fixed date.
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {undated.map((event) => (
            <li
              key={event.id}
              style={{ display: "grid", gridTemplateColumns: "minmax(0, 15rem) minmax(0, 1fr)", columnGap: "32px", rowGap: "8px", padding: "18px 0", borderTop: "1px solid var(--rule)" }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontFamily: "var(--font-newsreader)", fontSize: "1.02rem", lineHeight: 1.35 }}>{event.docTitle}</p>
                <p className="ui" style={{ margin: "4px 0 0", fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--uncertain)" }}>
                  No due date
                </p>
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontFamily: "var(--font-newsreader)", fontSize: "1.06rem", lineHeight: 1.5 }}>{event.title}</p>
                <p style={{ margin: "10px 0 0", borderLeft: "2px solid var(--uncertain)", paddingLeft: "14px", fontSize: "0.87rem", lineHeight: 1.6, color: "var(--muted)" }}>
                  {event.caveat}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {undated.length > 0 && (
        <p style={{ margin: "22px 0 0", maxWidth: "66ch", fontSize: "0.85rem", lineHeight: 1.6, color: "var(--muted)", borderTop: "1px solid var(--rule)", paddingTop: "18px" }}>
          {undated.length} of these turn{undated.length === 1 ? "s" : ""} on a term the contract never
          defines — &ldquo;business day&rdquo;, &ldquo;first business day&rdquo;, the date of an invoice. CLARA holds no
          holiday calendar and will not invent one, so no date is shown rather than a date that might be
          wrong.
        </p>
      )}

      {evidence && (
        <EvidenceViewer citation={evidence.citation} contract={evidence.contract} onClose={() => setEvidence(null)} />
      )}
    </div>
  );
}
