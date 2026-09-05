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

export function ConflictBanner({ conflicts }: { conflicts: ExclusivityConflict[] }) {
  if (conflicts.length === 0) return null;

  return (
    <section aria-label="Cross-contract conflicts" className="mb-5">
      {conflicts.map((conflict) => (
        <div
          key={conflict.id}
          className="card overflow-hidden"
          style={{ borderColor: "var(--alert)", boxShadow: "var(--shadow-raised)" }}
        >
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2"
            style={{ background: "var(--alert)", color: "#fff" }}
          >
            <span className="ui text-[0.72rem] uppercase tracking-wider">Conflict across contracts</span>
            <h2 className="text-[1rem]">Singapore is promised to two distributors</h2>
            <span className="ml-auto">
              <ConfidenceMark level={conflict.confidence} size="small" />
            </span>
          </div>
          <div className="px-4 py-3" style={{ background: "var(--alert-bg)" }}>
            <p className="max-w-[88ch] text-[0.88rem] leading-relaxed">{conflict.explanation}</p>
            {conflict.confidence !== "FOUND" && (
              <p className="mt-2 max-w-[88ch] text-[0.8rem]" style={{ color: "var(--ink-soft)" }}>
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
  const tone = brief.severity === "high" ? "var(--alert)" : "var(--uncertain)";

  return (
    <article className="card mb-3 overflow-hidden">
      <header
        className="card-head flex flex-wrap items-center gap-x-2.5 gap-y-1 border-l-4 px-4 py-2.5"
        style={{ borderLeftColor: tone }}
      >
        <h3 className="text-[0.98rem]">Worth a lawyer&rsquo;s hour</h3>
        <span
          className="ui rounded-full px-2 py-px text-[10px] uppercase tracking-wide"
          style={{ color: tone, background: brief.severity === "high" ? "var(--alert-bg)" : "var(--uncertain-bg)" }}
        >
          {brief.severity}
        </span>
      </header>

      <div className="px-4 py-3.5">
        <p className="serif mb-4 text-[0.95rem] leading-relaxed">{brief.issue}</p>

        <BriefSection title="What is established">
          <ul className="space-y-1.5">
            {brief.established.map((item, i) => (
              <li key={i} className="text-[0.85rem]">
                {item.statement}{" "}
                <span className="ref" style={{ color: "var(--ink-faint)" }}>
                  {citationRef(item.citation)}
                </span>
              </li>
            ))}
          </ul>
        </BriefSection>

        <BriefSection title="What is unresolved">
          <ul className="space-y-1.5">
            {brief.unresolved.map((item, i) => (
              <li key={i} className="text-[0.85rem]" style={{ color: "var(--ink-soft)" }}>
                {item}
              </li>
            ))}
          </ul>
        </BriefSection>

        <BriefSection title="The question to ask">
          <p className="serif text-[0.92rem] italic">{brief.question}</p>
        </BriefSection>

        <BriefSection title="What is at stake">
          <p className="text-[0.85rem]" style={{ color: "var(--ink-soft)" }}>
            {brief.exposure}
          </p>
        </BriefSection>
      </div>
    </article>
  );
}

function BriefSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5 last:mb-0">
      <h4 className="ui mb-1 text-[0.7rem] uppercase tracking-wider" style={{ color: "var(--ink-faint)" }}>
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
    <section aria-labelledby="refusals-heading" className="mt-7">
      <h2 id="refusals-heading" className="mb-1 text-[1.1rem]">
        Questions AITHENA will not answer
      </h2>
      <p className="mb-3 max-w-[70ch] text-[0.85rem]" style={{ color: "var(--ink-soft)" }}>
        These were put to the system and declined. A partial answer to either would be worse than none.
      </p>

      <ul className="space-y-3">
        {refusals.map((refusal) => (
          <li key={refusal.id} className="card overflow-hidden">
            <div className="card-head px-4 py-2.5">
              <p className="serif text-[0.92rem] italic">&ldquo;{refusal.question}&rdquo;</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[0.85rem] leading-relaxed">{refusal.reason}</p>
              <p className="mt-2 text-[0.85rem]" style={{ color: "var(--ink-soft)" }}>
                <span className="ui text-[0.78rem] uppercase tracking-wide" style={{ color: "var(--ink-faint)" }}>
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
