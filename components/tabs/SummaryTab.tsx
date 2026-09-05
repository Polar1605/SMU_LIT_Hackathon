import type { Results } from "@/lib/types";

export function SummaryTab({ results, onOpenContract }: { results: Results; onOpenContract: (docId: string) => void }) {
  void results;
  void onOpenContract;
  return <p style={{ color: "var(--muted)" }}>Summary tab — under construction.</p>;
}
