import type { RefusedQuestion } from "@/lib/types";
import { RefusalPanel } from "@/components/panels";

export function LimitsTab({ refusals }: { refusals: RefusedQuestion[] }) {
  if (refusals.length === 0) {
    return (
      <div style={{ maxWidth: "60rem" }}>
        <h2 style={{ margin: "0 0 4px", fontSize: "1.34rem", letterSpacing: "-0.008em" }}>
          Questions CLARA will not answer
        </h2>
        <p style={{ margin: 0, maxWidth: "70ch", fontSize: "0.85rem", color: "var(--muted)" }}>
          No questions were put to the system this run. This tab lists anything asked that fell outside
          what these documents can answer — legal advice, outcome prediction, or a document CLARA never
          read — each declined with a reason and a next step rather than a guess.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "60rem" }}>
      <RefusalPanel refusals={refusals} />
    </div>
  );
}
