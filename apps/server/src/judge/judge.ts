import { formatDuration, type AnalyzedItinerary, type Judgment, type StoredItinerary } from "@skai/core";
import { noul } from "@typesafe-ai/sdk";
import { toEntry, type Jev } from "../jev";

export const JUDGE_LIMIT = 20;

const FITS = noul(
  "Does this itinerary satisfy ALL of the traveler's stated preferences? Times are local to each airport. " +
    "A preference the traveler did not state does not count against the itinerary.",
  {
    true: "Every stated preference is satisfied",
    false: "At least one stated preference is violated",
  },
);

/** `analyze` already orders the frontier first, then the others by price. */
export function pickForJudging(analyzed: readonly AnalyzedItinerary[], limit = JUDGE_LIMIT): StoredItinerary[] {
  return analyzed.filter((row) => !row.excluded).slice(0, limit).map((row) => row.item);
}

const toJudgeState = (preference: string, it: StoredItinerary) => ({
  preference,
  itinerary: {
    date: it.date,
    priceEur: it.priceEur,
    airlines: it.airlines,
    departure: { airport: it.departure.airport, localTime: it.departure.time },
    arrival: { airport: it.arrival.airport, localTime: it.arrival.time, daysAfterDeparture: it.arrival.dayOffset },
    totalDuration: formatDuration(it.durationMin),
    stops: it.stops,
    layovers: it.layovers.map((l) => ({
      airport: l.airport,
      city: l.city,
      duration: formatDuration(l.durationMin),
      overnight: l.overnight,
    })),
  },
});

export async function judgePreference(
  jev: Jev,
  preference: string,
  items: readonly StoredItinerary[],
  options: { concurrency?: number; signal?: AbortSignal } = {},
): Promise<Judgment[]> {
  const results = new Array<Judgment>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      const item = items[index]!;
      options.signal?.throwIfAborted();
      const answers = await jev.ask(toEntry(toJudgeState(preference, item)), { fits: FITS }, options.signal);
      results[index] = { itineraryId: item.id, preference, probability: answers.fits.noul };
    }
  };
  const workers = Math.min(options.concurrency ?? 5, items.length);
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}
