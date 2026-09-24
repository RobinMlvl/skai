import { describe, expect, it } from "vitest";
import { aroundDate, formatDay, nextTwoWeeks, nextWeekend, rangeLength } from "./dates";

describe("formatDay", () => {
  it("formats as weekday, day, short month (UTC)", () => {
    expect(formatDay("2026-11-15")).toBe("Sun 15 Nov");
  });

  it("handles a year boundary", () => {
    expect(formatDay("2025-12-31")).toBe("Wed 31 Dec");
    expect(formatDay("2026-01-01")).toBe("Thu 1 Jan");
  });
});

describe("aroundDate", () => {
  it("spans iso minus/plus days when that stays within range", () => {
    expect(aroundDate("2026-01-05", 3, "2026-01-01")).toEqual({ from: "2026-01-02", to: "2026-01-08" });
  });

  it("clamps from to today when iso - days lands before today", () => {
    expect(aroundDate("2026-01-02", 5, "2026-01-01")).toEqual({ from: "2026-01-01", to: "2026-01-07" });
  });

  it("clamps across a year boundary", () => {
    // 2026-01-02 - 5 days = 2025-12-28, before today, so from clamps to today.
    expect(aroundDate("2026-01-02", 5, "2026-01-01").from).toBe("2026-01-01");
  });
});

describe("nextWeekend", () => {
  it("when today is Thursday, next Friday is tomorrow", () => {
    expect(nextWeekend("2026-01-01")).toEqual({ from: "2026-01-02", to: "2026-01-04" });
  });

  it("when today is Friday, next Friday is one week later (strictly after today)", () => {
    expect(nextWeekend("2026-01-02")).toEqual({ from: "2026-01-09", to: "2026-01-11" });
  });

  it("when today is Sunday, next Friday is 5 days later", () => {
    expect(nextWeekend("2026-11-15")).toEqual({ from: "2026-11-20", to: "2026-11-22" });
  });
});

describe("nextTwoWeeks", () => {
  it("is tomorrow through today + 14", () => {
    expect(nextTwoWeeks("2026-01-01")).toEqual({ from: "2026-01-02", to: "2026-01-15" });
  });

  it("crosses a month boundary", () => {
    expect(nextTwoWeeks("2026-02-16")).toEqual({ from: "2026-02-17", to: "2026-03-02" });
  });
});

describe("rangeLength", () => {
  it("counts dates inclusively", () => {
    expect(rangeLength("2026-01-01", "2026-01-03")).toBe(3);
  });

  it("is 1 for a single day", () => {
    expect(rangeLength("2026-01-01", "2026-01-01")).toBe(1);
  });

  it("is 0 when to is before from", () => {
    expect(rangeLength("2026-01-03", "2026-01-01")).toBe(0);
  });
});
