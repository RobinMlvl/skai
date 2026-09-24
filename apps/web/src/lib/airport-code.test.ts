import { describe, expect, it } from "vitest";
import { codeFor } from "./airport-code";

describe("codeFor", () => {
  it("matches the Google name to the candidate whose city shares a word", () => {
    expect(codeFor("Geneva Airport", ["GVA", "ZRH"])).toBe("GVA");
  });

  it("folds diacritics on the record side", () => {
    expect(codeFor("Zurich Airport", ["GVA", "ZRH"])).toBe("ZRH");
  });

  it("picks the airport whose city matches, ignoring 'airport'", () => {
    expect(codeFor("Suvarnabhumi Airport", ["BKK", "HKT"])).toBe("BKK");
  });

  it("ignores 'international' too", () => {
    expect(codeFor("Phuket International Airport", ["BKK", "HKT"])).toBe("HKT");
  });

  it("returns null when no candidate shares a word", () => {
    expect(codeFor("Heathrow Airport", ["BKK"])).toBeNull();
  });

  it("returns null for an unknown candidate code", () => {
    expect(codeFor("Geneva Airport", ["ZZZ"])).toBeNull();
  });
});
