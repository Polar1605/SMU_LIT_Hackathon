import type { Confidence } from "@/lib/types";
import { CONFIDENCE_LABEL, CONFIDENCE_VAR, CONFIDENCE_WASH } from "@/lib/display";

/**
 * The confidence marker, always visible and never behind a hover.
 *
 * Deliberately a flat tinted label rather than a coloured pill floating on a
 * card: it reads as an annotation on the row it belongs to, which is what it is.
 * The colour is carried by the text and a solid left edge, so it survives being
 * printed or screenshotted in greyscale — where the word still says everything.
 */
export function ConfidenceMark({ level, size = "normal" }: { level: Confidence; size?: "normal" | "small" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 border-l-2 font-medium ${
        size === "small" ? "px-1.5 py-px text-[11px]" : "px-2 py-0.5 text-xs"
      }`}
      style={{
        color: CONFIDENCE_VAR[level],
        background: CONFIDENCE_WASH[level],
        borderColor: CONFIDENCE_VAR[level],
      }}
    >
      {CONFIDENCE_LABEL[level]}
    </span>
  );
}
