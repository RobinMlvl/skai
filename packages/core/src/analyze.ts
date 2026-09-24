import { paretoFrontier } from "./frontier";
import type { Settings } from "./schemas";
import { detectTraps, type Trap } from "./traps";
import type { StoredItinerary } from "./types";

export interface AnalyzedItinerary {
  item: StoredItinerary;
  traps: Trap[];
  excluded: boolean;
  onFrontier: boolean;
  frontierStep: { extraEur: number; savedMin: number } | null;
}

export function analyze(items: readonly StoredItinerary[], settings: Settings): AnalyzedItinerary[] {
  const fastest = new Map<string, number>();
  for (const item of items) fastest.set(item.date, Math.min(fastest.get(item.date) ?? Infinity, item.durationMin));

  const rows: AnalyzedItinerary[] = items.map((item) => {
    const traps = detectTraps(item, fastest.get(item.date)!, settings);
    return { item, traps, excluded: traps.some((t) => t.severity === "exclude"), onFrontier: false, frontierStep: null };
  });

  const frontier = paretoFrontier(
    rows.filter((row) => !row.excluded),
    (row) => row.item.priceEur,
    (row) => row.item.durationMin,
  );
  frontier.forEach((row, i) => {
    row.onFrontier = true;
    const previous = frontier[i - 1];
    row.frontierStep = previous
      ? { extraEur: row.item.priceEur - previous.item.priceEur, savedMin: previous.item.durationMin - row.item.durationMin }
      : null;
  });

  const others = rows
    .filter((row) => !row.onFrontier)
    .sort((a, b) => a.item.priceEur - b.item.priceEur || a.item.durationMin - b.item.durationMin);
  return [...frontier, ...others];
}

export type Verdict = "fits" | "no-fit" | "unsure";

export function verdictFor(probability: number): Verdict {
  if (probability >= 0.7) return "fits";
  if (probability <= 0.3) return "no-fit";
  return "unsure";
}
