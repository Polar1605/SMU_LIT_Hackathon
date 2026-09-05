import type { Results } from "@/lib/types";

export function DeadlinesTab({ results, onOpenContract }: { results: Results; onOpenContract: (docId: string) => void }) {
  void results;
  void onOpenContract;
  return <p style={{ color: "var(--muted)" }}>Deadlines tab — under construction.</p>;
}
