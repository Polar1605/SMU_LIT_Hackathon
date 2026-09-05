import type { CalendarEvent } from "@/lib/types";
import { CONFIDENCE_LABEL, CONFIDENCE_VAR, CONFIDENCE_WASH, formatDate } from "@/lib/display";

/**
 * The single most urgent thing, shared between Summary and Deadlines —
 * both show the same card, so it lives in one place rather than two.
 */
export function NextDeadlineCard({ events }: { events: CalendarEvent[] }) {
  const next = events.find((e) => e.actionDeadline !== null && (e.daysUntilDeadline ?? -1) >= 0);
  if (!next) return null;

  const urgent = (next.daysUntilDeadline ?? 99) <= 30;

  return (
    <section
      aria-label="Next action deadline"
      className="mb-4"
      style={{
        overflow: "hidden",
        background: "var(--card)",
        borderRadius: "3px",
        border: `1px solid ${urgent ? "var(--accent-blue)" : "var(--rule)"}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <div
          style={{
            display: "flex",
            width: "112px",
            flexShrink: 0,
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px 12px",
            textAlign: "center",
            color: "#fbfcfe",
            background: urgent ? "var(--accent-blue)" : "var(--header)",
          }}
        >
          <span style={{ fontFamily: "var(--font-newsreader)", fontSize: "2.9rem", fontWeight: 400, lineHeight: 0.9 }}>
            {next.daysUntilDeadline}
          </span>
          <span
            className="ui"
            style={{ marginTop: "8px", fontSize: "9.5px", textTransform: "uppercase", letterSpacing: "0.14em", opacity: 0.8 }}
          >
            days to act
          </span>
        </div>
        <div style={{ minWidth: 0, flex: 1, padding: "16px 20px" }}>
          <div style={{ marginBottom: "4px", display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: "8px", rowGap: "4px" }}>
            <h2 style={{ margin: 0, fontSize: "1.2rem" }}>{next.title}</h2>
            <span
              className="ui"
              style={{
                display: "inline-flex",
                flexShrink: 0,
                alignItems: "center",
                gap: "6px",
                borderRadius: "999px",
                padding: "2px 9px",
                fontSize: "9.5px",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: CONFIDENCE_VAR[next.confidence],
                background: CONFIDENCE_WASH[next.confidence],
              }}
            >
              <span aria-hidden="true" style={{ display: "inline-block", height: "6px", width: "6px", borderRadius: "999px", background: CONFIDENCE_VAR[next.confidence] }} />
              {CONFIDENCE_LABEL[next.confidence]}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--muted)" }}>
            {next.docTitle} — act by {formatDate(next.actionDeadline)}
            {next.eventDate && next.eventDate !== next.actionDeadline && (
              <> to stop it renewing on {formatDate(next.eventDate)}</>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
