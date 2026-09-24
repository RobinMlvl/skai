import { formatDuration } from "./format";
import type { Settings } from "./schemas";
import type { Itinerary } from "./types";

export type TrapKind =
  | "long-trip"
  | "long-layover"
  | "tight-connection"
  | "self-transfer"
  | "airport-change"
  | "bag-not-included";

export interface Trap {
  kind: TrapKind;
  severity: "exclude" | "warn";
  label: string;
}

export function detectTraps(itinerary: Itinerary, fastestSameDateMin: number, settings: Settings): Trap[] {
  const traps: Trap[] = [];
  const ratio = itinerary.durationMin / fastestSameDateMin;
  if (ratio > settings.maxDurationRatio) {
    traps.push({ kind: "long-trip", severity: "warn", label: `${ratio.toFixed(1)}× the fastest` });
  }
  const durations = itinerary.layovers.map((l) => l.durationMin);
  const longest = Math.max(0, ...durations);
  if (longest > settings.maxLayoverMin) {
    traps.push({ kind: "long-layover", severity: "warn", label: `${formatDuration(longest)} layover` });
  }
  const shortest = Math.min(Infinity, ...durations);
  if (shortest < settings.minLayoverMin) {
    traps.push({ kind: "tight-connection", severity: "warn", label: `${formatDuration(shortest)} connection` });
  }
  if (itinerary.flags.selfTransfer) {
    traps.push({ kind: "self-transfer", severity: settings.excludeSelfTransfer ? "exclude" : "warn", label: "Separate tickets" });
  }
  if (itinerary.flags.airportChange) {
    traps.push({ kind: "airport-change", severity: settings.excludeAirportChange ? "exclude" : "warn", label: "Airport change" });
  }
  if (itinerary.flags.bagNotIncluded) {
    traps.push({ kind: "bag-not-included", severity: "warn", label: "No cabin bag" });
  }
  return traps;
}
