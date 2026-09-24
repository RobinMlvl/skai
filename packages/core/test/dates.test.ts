import { describe, expect, it } from "vitest";
import { addDays, dateRange, daysBetween, googleShortDate, isValidIsoDate, todayIso } from "../src/dates";

describe("dates", () => {
  it("validates ISO dates", () => {
    expect(isValidIsoDate("2026-11-10")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-1-5")).toBe(false);
  });

  it("adds days across months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts days and builds inclusive ranges", () => {
    expect(daysBetween("2026-11-10", "2026-11-12")).toBe(2);
    expect(dateRange("2026-11-10", "2026-11-12")).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(dateRange("2026-11-12", "2026-11-10")).toEqual([]);
  });

  it("formats the Departure field like Google", () => {
    expect(googleShortDate("2026-11-15")).toBe("Sun, Nov 15");
    expect(googleShortDate("2026-11-11")).toBe("Wed, Nov 11");
  });

  it("uses the local calendar day for today", () => {
    expect(todayIso(new Date(2026, 8, 24, 23, 30))).toBe("2026-09-24");
  });
});
