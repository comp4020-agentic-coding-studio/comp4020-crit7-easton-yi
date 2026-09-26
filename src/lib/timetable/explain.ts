import type { Metrics } from "./types";

/** Short, factual trade-off of `candidate` versus `baseline` — no opinion, just the deltas. */
export function explainTradeoff(candidate: Metrics, baseline: Metrics): string {
  const parts: string[] = [];

  const dayDiff = candidate.campusDays - baseline.campusDays;
  if (dayDiff !== 0) {
    const n = Math.abs(dayDiff);
    parts.push(`${n} ${dayDiff > 0 ? "more" : "fewer"} campus day${n === 1 ? "" : "s"}`);
  }

  const gapDiff = candidate.gapMinutes - baseline.gapMinutes;
  if (gapDiff !== 0) {
    parts.push(`${Math.abs(gapDiff)} ${gapDiff > 0 ? "more" : "fewer"} minutes of gaps`);
  }

  const earlyDiff = candidate.earlyCount - baseline.earlyCount;
  if (earlyDiff !== 0) {
    const n = Math.abs(earlyDiff);
    parts.push(`${n} ${earlyDiff > 0 ? "more" : "fewer"} early start${n === 1 ? "" : "s"}`);
  }

  if (parts.length === 0) return "Same metrics as your top pick.";
  return parts.join(", ");
}
