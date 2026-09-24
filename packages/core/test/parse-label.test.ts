import { describe, expect, it } from "vitest";
import fixture from "../fixtures/gva-bkk-2026-11-10.json";
import { parseLabel, parseLabels, RESULT_LABEL_SOURCE } from "../src/parse-label";

const [etihad, , lufthansa, emirates, , turkishOman, ita] = fixture.labels as string[];

describe("parseLabel on real Google labels", () => {
  it("parses a one-stop itinerary", () => {
    expect(parseLabel(etihad!, fixture.date)).toEqual({
      date: "2026-11-10",
      priceEur: 515,
      airlines: ["Etihad"],
      operatedBy: null,
      departure: { airport: "Geneva Airport", time: "09:35" },
      arrival: { airport: "Suvarnabhumi Airport", time: "06:35", dayOffset: 1 },
      durationMin: 900,
      stops: 1,
      layovers: [{ durationMin: 135, airport: "Zayed International Airport", city: "Abu Dhabi", overnight: false }],
      flags: { bagNotIncluded: false, selfTransfer: false, airportChange: false },
      rawLabel: etihad!.replace(/\s+/g, " ").trim(),
    });
  });

  it("parses two stops and several airlines", () => {
    const it2 = parseLabel(turkishOman!, fixture.date)!;
    expect(it2.airlines).toEqual(["Turkish Airlines", "Oman Air"]);
    expect(it2.stops).toBe(2);
    expect(it2.durationMin).toBe(1465);
    expect(it2.layovers.map((l) => [l.durationMin, l.city])).toEqual([
      [145, "Istanbul"],
      [490, "Muscat"],
    ]);
  });

  it("handles 12-hour times, minute-only layovers and +2 day arrivals", () => {
    expect(parseLabel(emirates!, fixture.date)!.arrival.time).toBe("12:05");
    expect(parseLabel(lufthansa!, fixture.date)!.departure.time).toBe("20:05");
    expect(parseLabel(lufthansa!, fixture.date)!.layovers[0]!.durationMin).toBe(55);
    const longOne = parseLabel(ita!, fixture.date)!;
    expect(longOne.arrival.dayOffset).toBe(2);
    expect(longOne.durationMin).toBe(1875);
  });

  it("parses every fixture label", () => {
    const { itineraries, unparsed } = parseLabels(fixture.labels, fixture.date);
    expect(unparsed).toEqual([]);
    expect(itineraries).toHaveLength(10);
  });
});

describe("parseLabel on format variants", () => {
  const date = "2026-09-20";

  it("reads nonstop flights, the cabin-bag notice and a missing space after the price", () => {
    const label =
      "From 216 euros.This price does not include overhead bin access. Nonstop flight with easyJet. Leaves Zurich Airport at 4:45 PM on Sunday, September 20 and arrives at London Gatwick Airport at 5:35 PM on Sunday, September 20. Total duration 1 hr 50 min.   Select flight";
    const it2 = parseLabel(label, date)!;
    expect(it2.stops).toBe(0);
    expect(it2.layovers).toEqual([]);
    expect(it2.flags.bagNotIncluded).toBe(true);
    expect(it2.durationMin).toBe(110);
    expect(it2.arrival.dayOffset).toBe(0);
  });

  it("reads the operating carrier", () => {
    const label =
      "From 265 euros. Nonstop flight with British Airways. Operated by BA Cityflyer. Leaves Zurich Airport at 8:25 PM on Sunday, September 20 and arrives at London City Airport at 9:00 PM on Sunday, September 20. Total duration 1 hr 35 min. Select flight";
    expect(parseLabel(label, date)!.operatedBy).toBe("BA Cityflyer");
  });

  it("keeps abbreviations in city names and reads overnight layovers", () => {
    const label =
      "From 410 euros. 1 stop flight with Delta. Leaves Paris Charles de Gaulle Airport at 10:00 AM on Sunday, September 20 and arrives at Denver International Airport at 9:00 AM on Monday, September 21. Total duration 31 hr. Layover (1 of 1) is a 12 hr 10 min overnight layover at St. Louis Lambert International Airport in St. Louis. Select flight";
    const layover = parseLabel(label, date)!.layovers[0]!;
    expect(layover).toEqual({ durationMin: 730, airport: "St. Louis Lambert International Airport", city: "St. Louis", overnight: true });
  });

  it("rolls the arrival into the next year", () => {
    const label =
      "From 300 euros. Nonstop flight with SWISS. Leaves Geneva Airport at 11:00 PM on Thursday, December 31 and arrives at Dubai International Airport at 7:00 AM on Friday, January 1. Total duration 6 hr. Select flight";
    expect(parseLabel(label, "2026-12-31")!.arrival.dayOffset).toBe(1);
  });

  it("flags separate tickets and airport changes (assumed wording, replace with captured labels)", () => {
    const base =
      "From 199 euros. 1 stop flight with Ryanair and easyJet. Leaves Geneva Airport at 6:00 AM on Sunday, September 20 and arrives at Lisbon Airport at 4:00 PM on Sunday, September 20. Total duration 11 hr. Layover (1 of 1) is a 4 hr layover at London Stansted Airport in London. ";
    expect(parseLabel(`${base}Self transfer. Select flight`, date)!.flags.selfTransfer).toBe(true);
    expect(parseLabel(`${base}Change of airport. Select flight`, date)!.flags.airportChange).toBe(true);
  });

  it("returns null for other currencies, stop-count mismatches and unknown shapes", () => {
    expect(
      parseLabel(
        "From 216 US dollars. Nonstop flight with easyJet. Leaves Zurich Airport at 4:45 PM on Sunday, September 20 and arrives at London Gatwick Airport at 5:35 PM on Sunday, September 20. Total duration 1 hr 50 min. Select flight",
        date,
      ),
    ).toBeNull();
    expect(
      parseLabel(
        "From 300 euros. 1 stop flight with SWISS. Leaves Geneva Airport at 9:00 AM on Sunday, September 20 and arrives at Dubai International Airport at 7:00 PM on Sunday, September 20. Total duration 8 hr. Select flight",
        date,
      ),
    ).toBeNull();
    expect(parseLabel("Select flight", date)).toBeNull();
  });
});

describe("parseLabels", () => {
  it("deduplicates identical labels and collects unparsed ones", () => {
    const { itineraries, unparsed } = parseLabels([etihad!, `  ${etihad!}  `, "From ??? Select flight"], fixture.date);
    expect(itineraries).toHaveLength(1);
    expect(unparsed).toEqual(["From ??? Select flight"]);
  });

  it("exposes the result-label pattern used in the browser", () => {
    const re = new RegExp(RESULT_LABEL_SOURCE, "s");
    expect(re.test(etihad!)).toBe(true);
    expect(re.test("Change ticket type.")).toBe(false);
  });
});
