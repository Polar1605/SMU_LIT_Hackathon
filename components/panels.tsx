/**
 * Conflict alert, escalation briefs, refusals and unavailability notices.
 *
 * The briefs keep a document voice deliberately — they are meant to be handed
 * to a lawyer as they stand, and a numbered brief reads as one. The chrome
 * around them is interface.
 */

import type { EscalationBrief, ExclusivityConflict, RefusedQuestion } from "@/lib/types";
import { citationRef } from "@/lib/display";
import { ConfidenceMark } from "./ConfidenceMark";

/**
 * A punchy one-line heading computed from the actual conflict, not a fixed
 * string — this used to hardcode "Singapore is promised to two
 * distributors" unconditionally, which was correct only for the one
 * synthetic-corpus conflict it was written against and wrong for any other
 * conflict a real portfolio (CUAD, or an upload) might surface.
 */
function conflictHeading(conflict: ExclusivityConflict): string {
  const scope = conflict.overlapTerritories[0] ?? conflict.grants[0].territoryLabel;
  return `${scope} is promised to two parties`;
}

export function ConflictBanner({ conflicts }: { conflicts: ExclusivityConflict[] }) {
  if (conflicts.length === 0) return null;

  return (
    <section aria-label="Cross-contract conflicts" className="mb-5">
      {conflicts.map((conflict) => (
        <div
          key={conflict.id}
          style={{
            overflow: "hidden",
            background: "var(--card)",
            border: "1px solid var(--accent-blue)",
            borderRadius: "3px",
            boxShadow: "var(--shadow-modal)",
          }}
        >
          <div
            className="flex flex-wrap items-center gap-x-3.5 gap-y-1"
            style={{ padding: "12px 20px", background: "var(--accent-blue)", color: "#fbfcfe" }}
          >
            <span className="ui" style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.85 }}>
              Conflict across contracts
            </span>
            <h2 style={{ margin: 0, fontSize: "1.18rem" }}>{conflictHeading(conflict)}</h2>
            <span className="ml-auto">
              <ConfidenceMark level={conflict.confidence} size="small" />
            </span>
          </div>
          <div style={{ padding: "18px 20px", background: "var(--conflict-bg)" }}>
            <p style={{ margin: 0, maxWidth: "84ch", fontFamily: "var(--font-newsreader)", fontSize: "1.02rem", lineHeight: 1.6 }}>
              {conflict.explanation}
            </p>
            {conflict.confidence !== "FOUND" && (
              <p style={{ margin: "8px 0 0", maxWidth: "88ch", fontSize: "0.8rem", color: "var(--muted)" }}>
                Reported as {conflict.confidence.toLowerCase().replace("_", " ")} because a conflict is never
                more certain than the grants it rests on. The brief below sets out what is established and
                what is not.
              </p>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------ */

export function EscalationBriefCard({ brief }: { brief: EscalationBrief }) {
  const tone = brief.severity === "high" ? "var(--accent-blue)" : "var(--uncertain)";
  const badgeColor = brief.severity === "high" ? "#fff" : "var(--uncertain)";
  const badgeBg = brief.severity === "high" ? "var(--accent-indigo)" : "var(--uncertain-bg)";

  return (
    <article style={{ marginBottom: "12px", overflow: "hidden", background: "var(--card)", border: "1px solid var(--rule)", borderRadius: "3px" }}>
      <header
        className="flex flex-wrap items-center gap-x-2.5 gap-y-1"
        style={{ padding: "12px 20px", borderBottom: "1px solid var(--rule)", background: "var(--wash)", borderLeft: `4px solid ${tone}` }}
      >
        <h3 style={{ margin: 0, fontSize: "1.14rem" }}>Worth a lawyer&rsquo;s hour</h3>
        <span
          className="ui"
          style={{ borderRadius: "999px", padding: "2px 9px", fontSize: "9.5px", textTransform: "uppercase", letterSpacing: "0.1em", color: badgeColor, background: badgeBg }}
        >
          {brief.severity}
        </span>
      </header>

      <div style={{ padding: "20px" }}>
        <p style={{ margin: "0 0 22px", fontFamily: "var(--font-newsreader)", fontSize: "1.08rem", lineHeight: 1.6 }}>{brief.issue}</p>

        <BriefSection title="What is established">
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
            {brief.established.map((item, i) => (
              <li key={i} style={{ fontSize: "0.85rem" }}>
                {item.statement}{" "}
                <span className="ref" style={{ color: "var(--muted-strong)" }}>
                  {citationRef(item.citation)}
                </span>
              </li>
            ))}
          </ul>
        </BriefSection>

        <BriefSection title="What is unresolved">
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
            {brief.unresolved.map((item, i) => (
              <li key={i} style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                {item}
              </li>
            ))}
          </ul>
        </BriefSection>

        <BriefSection title="The question to ask">
          <p style={{ margin: 0, fontFamily: "var(--font-newsreader)", fontStyle: "italic", fontSize: "1.1rem", lineHeight: 1.55 }}>{brief.question}</p>
        </BriefSection>

        <BriefSection title="What is at stake" last>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>{brief.exposure}</p>
        </BriefSection>
      </div>
    </article>
  );
}

function BriefSection({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 0 : "14px" }}>
      <h4 className="ui" style={{ margin: "0 0 8px", fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted-strong)" }}>
        {title}
      </h4>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function RefusalPanel({ refusals }: { refusals: RefusedQuestion[] }) {
  if (refusals.length === 0) return null;

  return (
    <section aria-labelledby="refusals-heading" style={{ marginTop: "28px" }}>
      <h2 id="refusals-heading" style={{ margin: "0 0 4px", fontSize: "1.34rem", letterSpacing: "-0.008em" }}>
        Questions CLARA will not answer
      </h2>
      <p style={{ margin: "0 0 12px", maxWidth: "70ch", fontSize: "0.85rem", color: "var(--muted)" }}>
        These were put to the system and declined. A partial answer to either would be worse than none.
      </p>

      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "12px" }}>
        {refusals.map((refusal) => (
          <li key={refusal.id} style={{ overflow: "hidden", background: "var(--card)", border: "1px solid var(--rule)", borderRadius: "3px" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--rule)", background: "var(--wash)" }}>
              <p style={{ margin: 0, fontFamily: "var(--font-newsreader)", fontStyle: "italic", fontSize: "1.1rem", lineHeight: 1.55 }}>
                &ldquo;{refusal.question}&rdquo;
              </p>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <p style={{ margin: 0, fontSize: "0.85rem", lineHeight: 1.55 }}>{refusal.reason}</p>
              <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
                <span className="ui" style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--muted-strong)" }}>
                  What to do instead
                </span>
                <br />
                {refusal.nextStep}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */

export function Unavailable({ items }: { items: { stage: string; reason: string }[] }) {
  if (items.length === 0) return null;

  return (
    <section
      className="card mt-7 border-l-4 px-4 py-3"
      style={{ borderLeftColor: "var(--uncertain)", background: "var(--uncertain-bg)" }}
    >
      <h2 className="mb-1 text-[0.95rem]">Not available in this run</h2>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-[0.85rem]">
            {item.reason}
          </li>
        ))}
      </ul>
    </section>
  );
}
