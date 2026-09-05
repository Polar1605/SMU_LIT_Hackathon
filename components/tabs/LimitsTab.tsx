import type { RefusedQuestion } from "@/lib/types";

export function LimitsTab({ refusals }: { refusals: RefusedQuestion[] }) {
  void refusals;
  return <p style={{ color: "var(--muted)" }}>Limits tab — under construction.</p>;
}
