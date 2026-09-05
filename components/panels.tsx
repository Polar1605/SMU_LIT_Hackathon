/**
 * The read-only panels: what is coming up, what is inconsistent, what needs a
 * lawyer, and what we will not answer.
 *
 * The calendar sorts by the date action must be TAKEN, not the date the event
 * happens. A renewal 74 days away with 60 days' notice is a 14-day problem, and
 * sorting by event date would bury it below things that matter less.
 */

import type {
  CalendarEvent,
  EscalationBrief,
  ExclusivityConflict,
  RefusedQuestion,
} from "@/lib/types";
import { citationRef, daysLabel, formatDate, formatDayMonth } from "@/lib/display";
import { ConfidenceMark } from "./ConfidenceMark";

/* ------------------------------------------------------------------ */

export function ConflictBanner({ conflicts }: { conflicts: ExclusivityConflict[] }) {
  if (conflicts.length === 0) return null;

  return (
    <section
      aria-label="Cross-contract conflicts"
      className="mb-6 border-l-4 px-5 py-4"
      style={{ borderColor: "var(--alert)", background: "var(--alert-wash)" }}
    >
      {conflicts.map((conflict) => (
        <div key={conflict.id} className="max-w-[80ch]">
          <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-[1.05rem]" style={{ color: "var(--alert)" }}>
              Two contracts promise the same territory
            </h2>
            <ConfidenceMark level={conflict.confidence} size="small" />
          </div>
          <p className="text-[0.9rem] leading-relaxed" style={{ color: "var(--ink)" }}>
            {conflict.explanation}
          </p>
          {/* The full reasoning lives in the escalation brief. A banner that
              reproduces it buries the finding under its own workings. */}
          {conflict.confidence !== "FOUND" && (
            <p className="mt-2 text-[0.82rem]" style={{ color: "var(--ink-soft)" }}>
              Reported as {conflict.confidence === "UNCERTAIN" ? "uncertain" : "less than certain"} because a
              conflict is never more certain than the grants it rests on. The brief below sets out what is
              established and what is not.
            </p>
          )}
        </div>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function EventRow({ event, lead }: { event: CalendarEvent; lead: boolean }) {
  const stamp = event.actionDeadline ? formatDayMonth(event.actionDeadline) : null;
  const overdue = event.daysUntilDeadline !== null && event.daysUntilDeadline < 0;

  return (
    <li className="flex gap-4 py-4 first:pt-0 [&+&]:border-t" style={{ borderColor: "var(--rule)" }}>
      <div
        className="flex w-14 shrink-0 flex-col items-center justify-center border py-1.5"
        style={{
          borderColor: stamp ? "var(--rule-strong)" : "var(--rule)",
          background: stamp ? "var(--sheet)" : "transparent",
        }}
      >
        {stamp ? (
          <>
            <span className={`font-medium leading-none ${lead ? "text-2xl" : "text-lg"}`}>{stamp.day}</span>
            <span className="ref mt-0.5 leading-none" style={{ color: "var(--ink-faint)" }}>
              {stamp.month}
            </span>
          </>
        ) : (
          <span className="ref px-1 text-center leading-tight" style={{ color: "var(--ink-faint)" }}>
            no date
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span
            className={lead ? "text-[1.05rem] font-medium" : "text-sm font-medium"}
            style={{ color: overdue ? "var(--alert)" : "var(--ink)" }}
          >
            {daysLabel(event.daysUntilDeadline)}
          </span>
          <ConfidenceMark level={event.confidence} size="small" />
        </div>

        <p className={`mt-0.5 ${lead ? "text-[0.95rem]" : "text-sm"}`}>{event.title}</p>
        <p className="mt-0.5 text-[0.82rem]" style={{ color: "var(--ink-soft)" }}>
          {event.docTitle}
          {event.actionDeadline && event.eventDate && event.actionDeadline !== event.eventDate && (
            <> · act by {formatDate(event.actionDeadline)} for {formatDate(event.eventDate)}</>
          )}
        </p>

        {event.caveat && (
          <p
            className="mt-2 border-l-2 pl-2.5 text-[0.82rem] leading-snug"
            style={{ borderColor: "var(--uncertain)", color: "var(--ink-soft)" }}
          >
            {event.caveat}
          </p>
        )}

        {event.citations.length > 0 && (
          <p className="ref mt-1.5" style={{ color: "var(--ink-faint)" }}>
            {citationRef(event.citations[0])}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * Three groups, because they demand different things of the reader.
 *
 * Inside the window is what you act on now. Beyond it is context, kept because a
 * notice deadline you cannot yet miss is still worth knowing about. Undated
 * obligations are real commitments the contract never pins to a date, and
 * burying them among dated ones made the urgent items unfindable — but dropping
 * them would be worse, since an obligation you cannot schedule is exactly the
 * kind that goes unpaid.
 */
export function Calendar({ events, windowDays }: { events: CalendarEvent[]; windowDays: number }) {
  const dated = events.filter((e) => e.daysUntilDeadline !== null);
  const soon = dated.filter((e) => e.daysUntilDeadline! <= windowDays);
  const later = dated.filter((e) => e.daysUntilDeadline! > windowDays);
  const undated = events.filter((e) => e.daysUntilDeadline === null);

  return (
    <section aria-labelledby="calendar-heading">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="calendar-heading" className="text-[1.15rem]">
          Next {windowDays} days
        </h2>
        <span className="text-[0.8rem]" style={{ color: "var(--ink-faint)" }}>
          by date you must act
        </span>
      </div>

      {soon.length === 0 ? (
        <p className="max-w-[46ch] text-sm" style={{ color: "var(--ink-soft)" }}>
          Nothing requires action in the next {windowDays} days. That is a finding rather than an empty
          screen — every contract below was read, and the deadlines they do carry fall later.
        </p>
      ) : (
        <ul>
          {soon.map((event, index) => (
            <EventRow key={event.id} event={event} lead={index === 0} />
          ))}
        </ul>
      )}

      {later.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-[0.85rem]" style={{ color: "var(--ink-soft)" }}>
            {later.length} deadline{later.length === 1 ? "" : "s"} beyond {windowDays} days
          </summary>
          <ul className="mt-2 rule-t pt-2">
            {later.map((event) => (
              <EventRow key={event.id} event={event} lead={false} />
            ))}
          </ul>
        </details>
      )}

      {undated.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[0.85rem]" style={{ color: "var(--uncertain)" }}>
            {undated.length} obligation{undated.length === 1 ? "" : "s"} the contracts never date
          </summary>
          <p className="mt-2 max-w-[46ch] text-[0.82rem]" style={{ color: "var(--ink-soft)" }}>
            These are owed, but the document ties them to an event it does not date — an invoice being
            issued, say. No due date can honestly be given, so none is shown.
          </p>
          <ul className="mt-2 rule-t pt-2">
            {undated.map((event) => (
              <EventRow key={event.id} event={event} lead={false} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

export function EscalationBriefCard({ brief }: { brief: EscalationBrief }) {
  return (
    <article className="sheet mb-4 p-5">
      <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[1.02rem]">Worth a lawyer&rsquo;s hour</h3>
        <span
          className="border-l-2 px-1.5 py-px text-[11px] font-medium"
          style={{
            color: brief.severity === "high" ? "var(--alert)" : "var(--uncertain)",
            background: brief.severity === "high" ? "var(--alert-wash)" : "var(--uncertain-wash)",
            borderColor: brief.severity === "high" ? "var(--alert)" : "var(--uncertain)",
          }}
        >
          {brief.severity === "high" ? "High" : "Medium"}
        </span>
      </header>

      <p className="mb-4 text-[0.92rem] leading-relaxed">{brief.issue}</p>

      <BriefSection title="What is established">
        <ul className="space-y-1.5">
          {brief.established.map((item, i) => (
            <li key={i} className="text-[0.86rem]">
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
            <li key={i} className="text-[0.86rem]" style={{ color: "var(--ink-soft)" }}>
              {item}
            </li>
          ))}
        </ul>
      </BriefSection>

      <BriefSection title="The question to ask">
        <p className="text-[0.9rem] italic" style={{ fontFamily: "var(--font-newsreader)" }}>
          {brief.question}
        </p>
      </BriefSection>

      <BriefSection title="What is at stake">
        <p className="text-[0.86rem]" style={{ color: "var(--ink-soft)" }}>
          {brief.exposure}
        </p>
      </BriefSection>
    </article>
  );
}

function BriefSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5 last:mb-0">
      <h4 className="mb-1 text-[0.78rem] font-semibold" style={{ color: "var(--ink-faint)" }}>
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
    <section aria-labelledby="refusals-heading" className="mt-8">
      <h2 id="refusals-heading" className="mb-1 text-[1.15rem]">
        Questions AITHENA will not answer
      </h2>
      <p className="mb-3 max-w-[62ch] text-[0.85rem]" style={{ color: "var(--ink-soft)" }}>
        These were put to the system and declined. A partial answer to either would be worse than none.
      </p>

      <ul className="space-y-3">
        {refusals.map((refusal) => (
          <li key={refusal.id} className="sheet p-4">
            <p className="mb-2 text-[0.92rem] italic" style={{ fontFamily: "var(--font-newsreader)" }}>
              &ldquo;{refusal.question}&rdquo;
            </p>
            <p className="text-[0.85rem] leading-relaxed">{refusal.reason}</p>
            <p className="mt-2 text-[0.85rem]" style={{ color: "var(--ink-soft)" }}>
              <span className="font-medium" style={{ color: "var(--ink)" }}>
                What to do instead:
              </span>{" "}
              {refusal.nextStep}
            </p>
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
      className="mt-8 border-l-4 px-4 py-3"
      style={{ borderColor: "var(--uncertain)", background: "var(--uncertain-wash)" }}
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
