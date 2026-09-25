import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/schemas";
import { detectTraps } from "../src/traps";
import type { Itinerary } from "../src/types";

const base: Itinerary = {
  date: "2026-11-10",
  priceEur: 400,
  airlines: ["SWISS"],
  operatedBy: null,
  departure: { airport: "Geneva Airport", time: "09:00" },
  arrival: { airport: "Suvarnabhumi Airport", time: "06:00", dayOffset: 1 },
  durationMin: 800,
  stops: 1,
  layovers: [{ durationMin: 120, airport: "Zurich Airport", city: "Zürich", overnight: false }],
  flags: { bagNotIncluded: false, selfTransfer: false, airportChange: false },
  rawLabel: "",
};
const kinds = (it: Itinerary, fastest = 800, settings = DEFAULT_SETTINGS) =>
  detectTraps(it, fastest, settings).map((t) => [t.kind, t.severity, t.label]);

describe("detectTraps", () => {
  it("finds nothing on a clean itinerary", () => {
    expect(kinds(base)).toEqual([]);
  });

  it("flags trips more than maxDurationRatio times the fastest of the day", () => {
    expect(kinds({ ...base, durationMin: 1875 }, 765)).toEqual([["long-trip", "warn", "2.5× the fastest from this airport"]]);
    expect(kinds({ ...base, durationMin: 1530 }, 765)).toEqual([]);
  });

  it("flags long and tight layovers", () => {
    const layovers = [
      { durationMin: 490, airport: "Muscat International Airport", city: "Muscat", overnight: false },
      { durationMin: 40, airport: "Istanbul Airport", city: "Istanbul", overnight: false },
    ];
    expect(kinds({ ...base, stops: 2, layovers })).toEqual([
      ["long-layover", "warn", "8h10 layover"],
      ["tight-connection", "warn", "40m connection"],
    ]);
  });

  it("excludes separate tickets and airport changes only when the setting is on", () => {
    const risky = { ...base, flags: { bagNotIncluded: true, selfTransfer: true, airportChange: true } };
    expect(kinds(risky)).toEqual([
      ["self-transfer", "exclude", "Separate tickets"],
      ["airport-change", "exclude", "Airport change"],
      ["bag-not-included", "warn", "No cabin bag"],
    ]);
    const relaxed = { ...DEFAULT_SETTINGS, excludeSelfTransfer: false, excludeAirportChange: false };
    expect(kinds(risky, 800, relaxed).map(([, severity]) => severity)).toEqual(["warn", "warn", "warn"]);
  });
});
