import { describe, expect, it } from "vitest";
import { airportByIata, searchAirports } from "./search";

describe("airport search", () => {
  it("finds airports by exact code first", () => {
    expect(searchAirports("gva")[0]?.iata).toBe("GVA");
    expect(airportByIata("BKK")?.city).toBe("Bangkok");
  });

  it("finds airports by city", () => {
    const codes = searchAirports("zurich").map((a) => a.iata);
    expect(codes).toContain("ZRH");
  });

  it("returns nothing for an empty query and respects the limit", () => {
    expect(searchAirports("  ")).toEqual([]);
    expect(searchAirports("a", 5)).toHaveLength(5);
  });
});
