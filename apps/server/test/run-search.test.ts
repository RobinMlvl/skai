import type { DateOutcome, ProgressEvent, SearchRequest } from "@skai/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BlockedError } from "../src/browser/page-state";
import { createSearchRunner } from "../src/jobs/run-search";
import { createProgressBus, type ProgressBus } from "../src/jobs/progress-bus";
import type { FlightSource } from "../src/sources/flight-source";
import { openSqliteStore, type SearchStore } from "../src/store/search-store";
import { fakeJev, noulAnswer } from "./fake-jev";
import { sampleItineraries, sampleRequest } from "./helpers";

let store: SearchStore;
let bus: ProgressBus;
let events: ProgressEvent[];
beforeEach(() => {
  store = openSqliteStore(":memory:");
  bus = createProgressBus();
  events = [];
  bus.subscribe("s1", (e) => events.push(e));
});
afterEach(() => store.close());

const ok = (date: string): DateOutcome => ({ date, status: "ok", itineraries: sampleItineraries().map((it) => ({ ...it, date })), unparsed: [] });
const missing = (date: string): DateOutcome => ({ date, status: "missing", itineraries: [], unparsed: [] });

function sourceOf(run: FlightSource["run"]): FlightSource {
  return { run };
}

async function runSearch(request: SearchRequest, source: FlightSource, jev: ReturnType<typeof fakeJev> | null = null, signal = new AbortController().signal) {
  store.create("s1", request, "2026-09-24T10:00:00.000Z");
  await createSearchRunner({ store, bus, source, jev, now: () => "2026-09-24T10:00:01.000Z" })("s1", signal);
  return store.get("s1")!;
}

describe("search runner", () => {
  it("stores results, judges the preference and finishes done", async () => {
    const jev = fakeJev(() => ({ fits: noulAnswer(0.8) }));
    const source = sourceOf(async (_request, progress) => {
      progress({ phase: "sweeping", message: "Scanning 2026-11-10", dateIndex: 1, dateCount: 2 });
      return { dates: [ok("2026-11-10"), ok("2026-11-11")] };
    });
    const detail = await runSearch(sampleRequest({ preference: "no Istanbul" }), source, jev);
    expect(detail.search.status).toBe("done");
    expect(detail.itineraries).toHaveLength(20);
    expect(detail.judgments).toHaveLength(20);
    expect(detail.search.stats).toMatchObject({ datesOk: 2, datesMissing: [], labelsRead: 20, labelsUnparsed: 0, jevCalls: 20, warnings: [] });
    expect(events.map((e) => e.phase)).toEqual(["sweeping", "analyzing", "judging", "finished"]);
    expect(events.at(-1)!.jevCalls).toBe(20);
    expect(detail.search.progress?.phase).toBe("finished");
  });

  it("finishes partial when some dates are missing, failed when all are", async () => {
    const partial = await runSearch(sampleRequest(), sourceOf(async () => ({ dates: [ok("2026-11-10"), missing("2026-11-11")] })));
    expect(partial.search.status).toBe("partial");
    expect(partial.search.stats?.datesMissing).toEqual(["2026-11-11"]);

    store.close();
    store = openSqliteStore(":memory:");
    const failed = await runSearch(sampleRequest(), sourceOf(async () => ({ dates: [missing("2026-11-10"), missing("2026-11-11")] })));
    expect(failed.search).toMatchObject({ status: "failed", error: "No date could be read." });
  });

  it("stops as blocked without retrying", async () => {
    let calls = 0;
    const detail = await runSearch(
      sampleRequest(),
      sourceOf(async () => {
        calls += 1;
        throw new BlockedError();
      }),
    );
    expect(calls).toBe(1);
    expect(detail.search.status).toBe("blocked");
    expect(detail.search.error).toContain("Google showed a block page");
    expect(events.at(-1)!.phase).toBe("finished");
  });

  it("records a cancellation", async () => {
    const controller = new AbortController();
    const source = sourceOf(async (_request, _progress, signal) => {
      controller.abort(new Error("Cancelled by the user"));
      signal.throwIfAborted();
      return { dates: [] };
    });
    const detail = await runSearch(sampleRequest(), source, null, controller.signal);
    expect(detail.search.status).toBe("cancelled");
  });

  it("warns when a preference cannot be checked or Google's format drifted", async () => {
    const drifted: DateOutcome = { ...ok("2026-11-10"), unparsed: Array.from({ length: 5 }, (_, i) => `From ??? ${i} Select flight`) };
    const detail = await runSearch(sampleRequest({ preference: "no red-eye", dateTo: "2026-11-10" }), sourceOf(async () => ({ dates: [drifted] })));
    expect(detail.search.status).toBe("done");
    expect(detail.search.stats?.warnings).toEqual([
      "TYPESAFE_API_KEY is not set, so your preferences were not checked.",
      "Google may have changed its format: some flights could not be read.",
    ]);
    // 10 parsed + 5 unparsed = 67 % coverage, below the 80 % threshold
  });

  it("keeps the results when Jev fails while judging", async () => {
    const jev = fakeJev(() => {
      throw new Error("TypeSafe unavailable");
    });
    const detail = await runSearch(sampleRequest({ preference: "no Istanbul", dateTo: "2026-11-10" }), sourceOf(async () => ({ dates: [ok("2026-11-10")] })), jev);
    expect(detail.search.status).toBe("done");
    expect(detail.itineraries).toHaveLength(10);
    expect(detail.search.stats?.warnings).toEqual(["Jev could not check your preferences."]);
  });
});
