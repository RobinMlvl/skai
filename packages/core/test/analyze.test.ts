import { describe, expect, it } from "vitest";
import fixture from "../fixtures/gva-bkk-2026-11-10.json";
import { analyze, verdictFor } from "../src/analyze";
import { paretoFrontier } from "../src/frontier";
import { parseLabel } from "../src/parse-label";
import { DEFAULT_SETTINGS } from "../src/schemas";
import type { StoredItinerary } from "../src/types";

// Fixture index → itinerary: f0 Etihad 515/15h, f1 SWISS 576/14h05, f2 Lufthansa 580/12h45, f3 Emirates 600,
// f4 Qatar 607, f5 Turkish+Oman 452/24h25, f6 ITA 505/31h15, f7 Etihad 506/26h10, f8 Etihad+Condor 515/15h40,
// f9 Turkish+THAI 545/28h55.
const items: StoredItinerary[] = (fixture.labels as string[]).map((label, i) => ({
  ...parseLabel(label, fixture.date)!,
  id: `f${i}`,
}));

describe("paretoFrontier", () => {
  it("keeps items no other item beats on both price and duration", () => {
    const points = [
      { p: 100, d: 50 },
      { p: 100, d: 60 },
      { p: 80, d: 90 },
      { p: 120, d: 40 },
      { p: 130, d: 45 },
    ];
    expect(paretoFrontier(points, (x) => x.p, (x) => x.d)).toEqual([
      { p: 80, d: 90 },
      { p: 100, d: 50 },
      { p: 120, d: 40 },
    ]);
  });
});

describe("analyze on real results", () => {
  const analyzed = analyze(items, DEFAULT_SETTINGS);
  const byId = new Map(analyzed.map((a) => [a.item.id, a]));

  it("puts the frontier first, then the others by price", () => {
    expect(analyzed.map((a) => a.item.id)).toEqual(["f5", "f0", "f1", "f2", "f6", "f7", "f8", "f9", "f3", "f4"]);
    expect(analyzed.filter((a) => a.onFrontier).map((a) => a.item.id)).toEqual(["f5", "f0", "f1", "f2"]);
  });

  it("explains each frontier step", () => {
    expect(byId.get("f5")!.frontierStep).toBeNull();
    expect(byId.get("f0")!.frontierStep).toEqual({ extraEur: 63, savedMin: 565 });
    expect(byId.get("f1")!.frontierStep).toEqual({ extraEur: 61, savedMin: 55 });
    expect(byId.get("f2")!.frontierStep).toEqual({ extraEur: 4, savedMin: 80 });
  });

  it("flags the 30-hour traps against the fastest flight of the day", () => {
    expect(byId.get("f6")!.traps.map((t) => t.label)).toEqual(["2.5× the fastest", "18h40 layover"]);
    expect(byId.get("f7")!.traps.map((t) => t.label)).toEqual(["2.1× the fastest", "13h25 layover"]);
    expect(byId.get("f9")!.traps.map((t) => t.label)).toEqual(["2.3× the fastest", "16h50 layover"]);
    expect(byId.get("f5")!.traps.map((t) => t.label)).toEqual(["8h10 layover"]);
    expect(byId.get("f2")!.traps).toEqual([]);
  });

  it("removes excluded itineraries from the frontier", () => {
    const withSelfTransfer = items.map((it) =>
      it.id === "f5" ? { ...it, flags: { ...it.flags, selfTransfer: true } } : it,
    );
    const result = analyze(withSelfTransfer, DEFAULT_SETTINGS);
    const f5 = result.find((a) => a.item.id === "f5")!;
    expect(f5.excluded).toBe(true);
    expect(f5.onFrontier).toBe(false);
    expect(result.filter((a) => a.onFrontier).map((a) => a.item.id)).toEqual(["f6", "f7", "f0", "f1", "f2"]);
  });
});

describe("verdictFor", () => {
  it("maps probabilities to verdicts", () => {
    expect(verdictFor(0.7)).toBe("fits");
    expect(verdictFor(0.3)).toBe("no-fit");
    expect(verdictFor(0.5)).toBe("unsure");
  });
});
