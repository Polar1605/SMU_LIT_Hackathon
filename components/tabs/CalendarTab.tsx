import type { Results } from "@/lib/types";

export function CalendarTab({ results, onOpenContract }: { results: Results; onOpenContract: (docId: string) => void }) {
  void results;
  void onOpenContract;
  return <p style={{ color: "var(--muted)" }}>Calendar tab — under construction.</p>;
}
