import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, makeSearchRequestSchema } from "../src/schemas";
import { emptyStats, isTerminal } from "../src/types";

const schema = makeSearchRequestSchema("2026-09-24");
const valid = { origins: ["GVA", "ZRH"], destinations: ["BKK"], dateFrom: "2026-11-10", dateTo: "2026-11-16" };
const messages = (input: unknown) => {
  const result = schema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe("SearchRequest schema", () => {
  it("accepts a valid request and fills default settings", () => {
    const request = schema.parse(valid);
    expect(request.settings).toEqual(DEFAULT_SETTINGS);
    expect(request.preference).toBeUndefined();
  });

  it("has the documented default settings", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      maxDurationRatio: 2,
      maxLayoverMin: 360,
      minLayoverMin: 45,
      excludeSelfTransfer: true,
      excludeAirportChange: true,
    });
  });

  it("trims the preference and drops it when empty", () => {
    expect(schema.parse({ ...valid, preference: "  no red-eye  " }).preference).toBe("no red-eye");
    expect(schema.parse({ ...valid, preference: "   " }).preference).toBeUndefined();
  });

  it("rejects bad, duplicate, too many and crossing airport codes", () => {
    expect(messages({ ...valid, origins: ["gva"] })).toContain("Use 3-letter airport codes (e.g. GVA)");
    expect(messages({ ...valid, origins: ["GVA", "GVA"] })).toContain("Duplicate departure airport");
    expect(messages({ ...valid, origins: ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH"] })).toContain(
      "At most 7 departure airports",
    );
    expect(messages({ ...valid, destinations: ["ZRH"] })).toContain("An airport cannot be both departure and arrival");
  });

  it("checks the date range", () => {
    expect(messages({ ...valid, dateFrom: "2026-09-23" })).toContain("Start date is in the past");
    expect(messages({ ...valid, dateFrom: "2026-11-16", dateTo: "2026-11-10" })).toContain(
      "End date is before start date",
    );
    expect(messages({ ...valid, dateFrom: "2026-11-01", dateTo: "2026-12-02" })).toContain(
      "Range is limited to 31 days",
    );
    expect(schema.safeParse({ ...valid, dateFrom: "2026-11-01", dateTo: "2026-12-01" }).success).toBe(true);
  });

  it("limits the preference length", () => {
    expect(schema.safeParse({ ...valid, preference: "x".repeat(301) }).success).toBe(false);
  });
});

describe("status helpers", () => {
  it("knows terminal statuses and empty stats", () => {
    expect(isTerminal("done")).toBe(true);
    expect(isTerminal("running")).toBe(false);
    expect(emptyStats()).toEqual({
      datesOk: 0,
      datesMissing: [],
      labelsRead: 0,
      labelsUnparsed: 0,
      jevCalls: 0,
      durationMs: 0,
      warnings: [],
    });
  });
});
