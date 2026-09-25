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

  it("weights a word of the record's name above a word of its city", () => {
    // DXB is "Dubai International Airport"; DWC is "Al Maktoum International Airport" in "Dubai(Jebel Ali)".
    expect(codeFor("Dubai International Airport", ["DWC", "DXB"])).toBe("DXB");
  });

  it("returns null when the best score is tied", () => {
    expect(codeFor("London Airport", ["LHR", "LGW"])).toBeNull();
  });

  it("never shows the wrong Milan airport", () => {
    // Real records: MXP "Milan Malpensa International Airport", LIN "Milano Linate Airport",
    // BGY "Il Caravaggio International Airport" (city "Orio al Serio").
    const milan = ["MXP", "BGY", "LIN"];
    expect(codeFor("Milan Malpensa Airport", milan)).toBe("MXP");
    expect(["LIN", null]).toContain(codeFor("Milan Linate Airport", milan));
    expect(["BGY", null]).toContain(codeFor("Milan Bergamo Airport", milan));
  });
});
