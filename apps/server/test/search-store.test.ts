import { emptyStats, type ProgressEvent } from "@skai/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openSqliteStore, type SearchStore } from "../src/store/search-store";
import { sampleItineraries, sampleRequest } from "./helpers";

let store: SearchStore;
beforeEach(() => {
  store = openSqliteStore(":memory:");
});
afterEach(() => store.close());

const progress = (phase: ProgressEvent["phase"], message: string = phase): ProgressEvent => ({
  phase,
  message,
  jevCalls: 0,
  at: "2026-09-24T10:00:00.000Z",
});

describe("SqliteSearchStore", () => {
  it("creates searches and lists the newest first", () => {
    store.create("a", sampleRequest(), "2026-09-24T10:00:00.000Z");
    store.create("b", sampleRequest({ destinations: ["HKT"] }), "2026-09-24T11:00:00.000Z");
    const list = store.list(10);
    expect(list.map((s) => s.id)).toEqual(["b", "a"]);
    expect(list[0]).toMatchObject({ status: "queued", phase: "queued", progress: null, stats: null, error: null });
    expect(list[0]!.request.destinations).toEqual(["HKT"]);
  });

  it("records status and progress", () => {
    store.create("a", sampleRequest(), "2026-09-24T10:00:00.000Z");
    store.setStatus("a", "running");
    store.setProgress("a", progress("sweeping", "Scanning 2026-11-10"));
    const { search } = store.get("a")!;
    expect(search.status).toBe("running");
    expect(search.phase).toBe("sweeping");
    expect(search.progress?.message).toBe("Scanning 2026-11-10");
  });

  it("stores itineraries with ids and their judgments", () => {
    store.create("a", sampleRequest(), "2026-09-24T10:00:00.000Z");
    const stored = store.saveItineraries("a", sampleItineraries().slice(0, 2));
    expect(stored).toHaveLength(2);
    expect(stored[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
    store.saveJudgments([{ itineraryId: stored[0]!.id, preference: "no Istanbul", probability: 0.82 }], "2026-09-24T10:05:00.000Z");
    const detail = store.get("a")!;
    expect(detail.itineraries.map((i) => i.id)).toEqual(stored.map((i) => i.id));
    expect(detail.itineraries[0]!.priceEur).toBe(515);
    expect(detail.judgments).toEqual([{ itineraryId: stored[0]!.id, preference: "no Istanbul", probability: 0.82 }]);
  });

  it("finishes with stats and an error message", () => {
    store.create("a", sampleRequest(), "2026-09-24T10:00:00.000Z");
    store.finish("a", "blocked", { ...emptyStats(), jevCalls: 3 }, "Blocked");
    const { search } = store.get("a")!;
    expect(search).toMatchObject({ status: "blocked", error: "Blocked" });
    expect(search.stats?.jevCalls).toBe(3);
  });

  it("marks queued and running searches as failed and finished after a restart", () => {
    store.create("a", sampleRequest(), "2026-09-24T10:00:00.000Z");
    store.create("b", sampleRequest(), "2026-09-24T10:01:00.000Z");
    store.create("c", sampleRequest(), "2026-09-24T10:02:00.000Z");
    store.setStatus("b", "running");
    store.setProgress("b", { ...progress("sweeping", "Scanning 2026-11-10"), jevCalls: 3 });
    store.finish("c", "done", emptyStats(), null);
    store.setProgress("c", progress("finished", "Scan complete"));
    expect(store.failInterrupted("2026-09-24T11:00:00.000Z")).toBe(2);
    expect(store.get("a")!.search).toMatchObject({ status: "failed", error: "Server restarted during the search" });
    expect(store.get("b")!.search).toMatchObject({
      status: "failed",
      phase: "finished",
      progress: { phase: "finished", message: "Server restarted during the search", jevCalls: 3, at: "2026-09-24T11:00:00.000Z" },
    });
    expect(store.get("a")!.search.progress).toMatchObject({ phase: "finished", jevCalls: 0 });
    expect(store.get("c")!.search).toMatchObject({ status: "done", progress: { message: "Scan complete" } });
  });

  it("returns null for unknown searches", () => {
    expect(store.get("missing")).toBeNull();
  });

  it("finds a stored itinerary with its search request", () => {
    store.create("a", sampleRequest({ origins: ["GVA", "ZRH"] }), "2026-09-24T10:00:00.000Z");
    const [first] = store.saveItineraries("a", sampleItineraries().slice(0, 1));
    const found = store.findItinerary(first!.id)!;
    expect(found.searchId).toBe("a");
    expect(found.request.origins).toEqual(["GVA", "ZRH"]);
    expect(found.itinerary).toEqual(first);
    expect(store.findItinerary("missing")).toBeNull();
  });
});

