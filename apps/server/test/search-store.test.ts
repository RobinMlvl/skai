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

  it("marks queued and running searches as failed after a restart", () => {
    store.create("a", sampleRequest(), "2026-09-24T10:00:00.000Z");
    store.create("b", sampleRequest(), "2026-09-24T10:01:00.000Z");
    store.create("c", sampleRequest(), "2026-09-24T10:02:00.000Z");
    store.setStatus("b", "running");
    store.finish("c", "done", emptyStats(), null);
    expect(store.failInterrupted()).toBe(2);
    expect(store.get("a")!.search).toMatchObject({ status: "failed", error: "Server restarted during the search" });
    expect(store.get("c")!.search.status).toBe("done");
  });

  it("returns null for unknown searches", () => {
    expect(store.get("missing")).toBeNull();
  });
});
