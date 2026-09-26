import { explainTradeoff } from "./explain";
import type { Combination, Preference, Representative, Selection } from "./types";

const ALL_PREFERENCES: Preference[] = ["campusDays", "gaps", "early"];

/** Stable, order-independent identity for a combination's option set. */
export function signature(selections: Selection[]): string {
  return [...selections]
    .sort((a, b) => a.groupId.localeCompare(b.groupId))
    .map((selection) => `${selection.groupId}:${selection.optionId}`)
    .join("|");
}

function metricKey(preference: Preference): "campusDays" | "gapMinutes" | "earlyCount" {
  if (preference === "campusDays") return "campusDays";
  if (preference === "gaps") return "gapMinutes";
  return "earlyCount";
}

/** Lexicographic order for a preference: its metric first, the other two as tie-breakers, then a stable signature. */
function comparator(preference: Preference): (a: Combination, b: Combination) => number {
  const order = [
    metricKey(preference),
    ...ALL_PREFERENCES.filter((candidate) => candidate !== preference).map(metricKey),
  ];

  return (a, b) => {
    for (const key of order) {
      const diff = a.metrics[key] - b.metrics[key];
      if (diff !== 0) return diff;
    }
    return signature(a.selections).localeCompare(signature(b.selections));
  };
}

export function rankCombinations(combinations: Combination[], preference: Preference): Combination[] {
  return [...combinations].sort(comparator(preference));
}

/**
 * Representative plans: the best plan under the selected preference, then
 * the best under each of the other two preferences (deduplicated by
 * option-set identity), capped at three.
 */
export function selectRepresentatives(
  combinations: Combination[],
  preference: Preference,
): Representative[] {
  if (combinations.length === 0) return [];

  const primary = rankCombinations(combinations, preference)[0];
  if (!primary) return [];

  const representatives: Representative[] = [{ ...primary, bestFor: preference, tradeoff: "" }];
  const seen = new Set([signature(primary.selections)]);

  const others = ALL_PREFERENCES.filter((candidate) => candidate !== preference);
  for (const candidatePreference of others) {
    if (representatives.length >= 3) break;

    const best = rankCombinations(combinations, candidatePreference)[0];
    if (!best) continue;

    const sig = signature(best.selections);
    if (seen.has(sig)) continue;

    seen.add(sig);
    representatives.push({
      ...best,
      bestFor: candidatePreference,
      tradeoff: explainTradeoff(best.metrics, primary.metrics),
    });
  }

  return representatives;
}
