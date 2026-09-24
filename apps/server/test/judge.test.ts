import { analyze, DEFAULT_SETTINGS, type StoredItinerary } from "@skai/core";
import { describe, expect, it } from "vitest";
import { judgePreference, pickForJudging } from "../src/judge/judge";
import { fakeJev, noulAnswer } from "./fake-jev";
import { sampleItineraries } from "./helpers";

const items: StoredItinerary[] = sampleItineraries().map((it, i) => ({ ...it, id: `f${i}` }));

describe("pickForJudging", () => {
  it("takes the frontier first, then the cheapest others, up to the limit", () => {
    const analyzed = analyze(items, DEFAULT_SETTINGS);
    expect(pickForJudging(analyzed, 6).map((it) => it.id)).toEqual(["f5", "f0", "f1", "f2", "f6", "f7"]);
  });

  it("skips excluded itineraries", () => {
    const withSelfTransfer = items.map((it) => (it.id === "f5" ? { ...it, flags: { ...it.flags, selfTransfer: true } } : it));
    const picked = pickForJudging(analyze(withSelfTransfer, DEFAULT_SETTINGS));
    expect(picked.map((it) => it.id)).not.toContain("f5");
    expect(picked).toHaveLength(9);
  });
});

describe("judgePreference", () => {
  it("asks one yes/no question per itinerary with a readable state", async () => {
    const jev = fakeJev((state: { itinerary: { priceEur: number } }) => ({
      fits: noulAnswer(state.itinerary.priceEur < 550 ? 0.9 : 0.1),
    }));
    const judgments = await judgePreference(jev, "under 550 euros", items.slice(0, 3));
    expect(judgments).toEqual([
      { itineraryId: "f0", preference: "under 550 euros", probability: 0.9 },
      { itineraryId: "f1", preference: "under 550 euros", probability: 0.1 },
      { itineraryId: "f2", preference: "under 550 euros", probability: 0.1 },
    ]);
    expect(jev.states[0]).toEqual({
      preference: "under 550 euros",
      itinerary: {
        date: "2026-11-10",
        priceEur: 515,
        airlines: ["Etihad"],
        departure: { airport: "Geneva Airport", localTime: "09:35" },
        arrival: { airport: "Suvarnabhumi Airport", localTime: "06:35", daysAfterDeparture: 1 },
        totalDuration: "15h",
        stops: 1,
        layovers: [{ airport: "Zayed International Airport", city: "Abu Dhabi", duration: "2h15", overnight: false }],
      },
    });
  });

  it("keeps at most `concurrency` requests in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const jev = fakeJev(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      return { fits: noulAnswer(0.5) };
    });
    const judgments = await judgePreference(jev, "anything", items, { concurrency: 2 });
    expect(judgments).toHaveLength(10);
    expect(peak).toBe(2);
  });
});
