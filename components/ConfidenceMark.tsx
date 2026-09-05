import type { Confidence } from "@/lib/types";
import { CONFIDENCE_LABEL, CONFIDENCE_VAR } from "@/lib/display";

const BG: Record<Confidence, string> = {
  FOUND: "var(--found-bg)",
  INFERRED: "var(--inferred-bg)",
  UNCERTAIN: "var(--uncertain-bg)",
  NOT_FOUND: "var(--silent-bg)",
};

/**
 * The status pill, always visible and never behind a hover.
 *
 * A filled dot alongside the word, so the state survives greyscale and
 * colour-blindness — the word carries the meaning and the colour only
 * reinforces it.
 */
export function ConfidenceMark({ level, size = "normal" }: { level: Confidence; size?: "normal" | "small" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold uppercase tracking-wide ${
        size === "small" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[10.5px]"
      }`}
      style={{ color: CONFIDENCE_VAR[level], background: BG[level] }}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{
          background: level === "NOT_FOUND" ? "transparent" : CONFIDENCE_VAR[level],
          boxShadow: level === "NOT_FOUND" ? `inset 0 0 0 1.5px ${CONFIDENCE_VAR[level]}` : undefined,
        }}
      />
      {CONFIDENCE_LABEL[level]}
    </span>
  );
}
