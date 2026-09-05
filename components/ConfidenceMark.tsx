import type { Confidence } from "@/lib/types";
import { CONFIDENCE_LABEL, CONFIDENCE_VAR, CONFIDENCE_WASH } from "@/lib/display";

/**
 * The status pill, always visible and never behind a hover. Matches the
 * design's exact pill spec: 999px radius, Mono 500 at 9.5px, uppercase,
 * 0.1em letter-spacing, a 6px dot carrying the same color as the text so the
 * state survives greyscale and colour-blindness.
 */
export function ConfidenceMark({ level, size = "normal" }: { level: Confidence; size?: "normal" | "small" }) {
  return (
    <span
      className="ui inline-flex shrink-0 items-center gap-1.5 rounded-full uppercase"
      style={{
        padding: size === "small" ? "2px 8px" : "2px 9px",
        fontSize: "9.5px",
        letterSpacing: "0.1em",
        color: CONFIDENCE_VAR[level],
        background: CONFIDENCE_WASH[level],
      }}
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
