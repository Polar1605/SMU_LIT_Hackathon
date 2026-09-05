import type { Results } from "@/lib/types";
import { ConflictBanner, EscalationBriefCard } from "@/components/panels";

export function EscalationsTab({ results }: { results: Results }) {
  return (
    <div style={{ maxWidth: "60rem" }}>
      <ConflictBanner conflicts={results.conflicts} />

      <div>
        <h2 style={{ margin: "0 0 4px", fontSize: "1.34rem", letterSpacing: "-0.008em" }}>Where CLARA stops</h2>
        <p style={{ margin: "0 0 12px", fontSize: "0.83rem", color: "var(--muted)" }}>
          {results.escalations.length === 0
            ? "Nothing in this portfolio has hit CLARA's competence boundary — every liability, termination and exclusivity field settled with either a finding or a confirmed absence."
            : `${results.escalations.length} question${results.escalations.length === 1 ? "" : "s"} cannot be answered from the documents alone. Each brief below is written to be handed to a lawyer as it stands.`}
        </p>
        {results.escalations.map((brief) => (
          <EscalationBriefCard key={brief.id} brief={brief} />
        ))}
      </div>
    </div>
  );
}
