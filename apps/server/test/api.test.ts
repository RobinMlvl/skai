import type { ProgressEvent } from "@skai/core";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createApp } from "../src/api/app";
import { BookingBusyError, type Booker } from "../src/booking/booking";
import type { JobQueue } from "../src/jobs/job-queue";
import { createProgressBus, type ProgressBus } from "../src/jobs/progress-bus";
import { openSqliteStore, type SearchStore } from "../src/store/search-store";
import { sampleItineraries } from "./helpers";

const BASE = "http://127.0.0.1:4317/api";
const NOW = "2026-09-24T10:00:00.000Z";
const body = { origins: ["GVA"], destinations: ["BKK"], dateFrom: "2026-11-10", dateTo: "2026-11-12" };
const post = (path: string, payload?: unknown, headers: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json", "x-skai": "1", ...headers },
  body: payload === undefined ? undefined : JSON.stringify(payload),
});

/** Reads an SSE response until the server ends it, or cancels it after `ms`. */
async function readStream(res: Response, ms = 1_000) {
  const reader = res.body!.getReader();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel();
  }, ms);
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    text += new TextDecoder().decode(value);
  }
  clearTimeout(timer);
  const events = text
    .split("\n")
    .filter((line) => line.startsWith("data: {"))
    .map((line) => JSON.parse(line.slice(6)) as ProgressEvent);
  return { events, ended: !timedOut };
}

let store: SearchStore;
let bus: ProgressBus;
type CancelResult = ReturnType<JobQueue["cancel"]>;
let queue: { enqueue: Mock<(id: string) => void>; cancel: Mock<(id: string) => CancelResult>; idle: () => Promise<void> };
let app: ReturnType<typeof createApp>;
let book: Mock<Booker>;
let ids = 0;

beforeEach(() => {
  store = openSqliteStore(":memory:");
  bus = createProgressBus();
  queue = {
    enqueue: vi.fn<(id: string) => void>(),
    cancel: vi.fn<(id: string) => CancelResult>(() => "unknown"),
    idle: async () => {},
  };
  ids = 0;
  book = vi.fn<Booker>(async () => ({ status: "options" as const }));
  app = createApp({
    book,
    store,
    queue,
    bus,
    allowedHosts: ["127.0.0.1:4317", "localhost:4317", "127.0.0.1:5173", "localhost:5173"],
    today: () => "2026-09-24",
    newId: () => `s${++ids}`,
    now: () => NOW,
  });
});
afterEach(() => store.close());

describe("local guard", () => {
  it("rejects unknown hosts (DNS rebinding)", async () => {
    const res = await app.request("http://evil.test/api/searches");
    expect(res.status).toBe(403);
  });

  it("rejects mutating requests without the X-SkAI header", async () => {
    const res = await app.request(`${BASE}/searches`, post("/searches", body, { "x-skai": "" }));
    expect(res.status).toBe(403);
  });

  it("rejects foreign origins", async () => {
    const res = await app.request(`${BASE}/searches`, { headers: { origin: "https://evil.test" } });
    expect(res.status).toBe(403);
  });

  it("allows same-machine reads and the Vite dev origin", async () => {
    expect((await app.request(`${BASE}/searches`)).status).toBe(200);
    const viaVite = await app.request("http://127.0.0.1:5173/api/searches", { headers: { origin: "http://127.0.0.1:5173" } });
    expect(viaVite.status).toBe(200);
  });
});

describe("searches API", () => {
  it("creates a queued search and enqueues it", async () => {
    const res = await app.request(`${BASE}/searches`, post("/searches", body));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "s1" });
    expect(queue.enqueue).toHaveBeenCalledWith("s1");
    const { search } = store.get("s1")!;
    expect(search).toMatchObject({ status: "queued", phase: "queued", createdAt: NOW });
    expect(search.progress).toEqual({ phase: "queued", message: "Waiting in queue", jevCalls: 0, at: NOW });
  });

  it("returns the first validation message", async () => {
    const res = await app.request(`${BASE}/searches`, post("/searches", { ...body, origins: [] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_request", message: "Add at least one departure airport" });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    const res = await app.request(`${BASE}/searches`, { method: "POST", headers: { "x-skai": "1" }, body: "nope" });
    expect(res.status).toBe(400);
  });

  it("lists searches and returns details", async () => {
    await app.request(`${BASE}/searches`, post("/searches", body));
    const list = (await (await app.request(`${BASE}/searches`)).json()) as { id: string }[];
    expect(list.map((s) => s.id)).toEqual(["s1"]);
    const detail = await (await app.request(`${BASE}/searches/s1`)).json();
    expect(detail).toMatchObject({ search: { id: "s1" }, itineraries: [], judgments: [] });
    expect((await app.request(`${BASE}/searches/nope`)).status).toBe(404);
  });

  it("cancels a queued search", async () => {
    await app.request(`${BASE}/searches`, post("/searches", body));
    queue.cancel.mockReturnValueOnce("dequeued");
    const events: ProgressEvent[] = [];
    bus.subscribe("s1", (e) => events.push(e));
    const res = await app.request(`${BASE}/searches/s1/cancel`, post("/searches/s1/cancel"));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ result: "dequeued" });
    expect(store.get("s1")!.search.status).toBe("cancelled");
    expect(events.map((e) => e.phase)).toEqual(["finished"]);
  });

  it("returns 404 when cancelling an unknown search", async () => {
    expect((await app.request(`${BASE}/searches/nope/cancel`, post("/searches/nope/cancel"))).status).toBe(404);
  });
});

describe("progress stream", () => {
  it("sends the current progress, then live events, and ends at finished", async () => {
    await app.request(`${BASE}/searches`, post("/searches", body));
    const res = await app.request(`${BASE}/searches/s1/events`);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    await new Promise((resolve) => setTimeout(resolve, 20));
    bus.publish("s1", { phase: "sweeping", message: "Scanning 2026-11-10", jevCalls: 0, at: NOW });
    bus.publish("s1", { phase: "finished", message: "Scan complete", jevCalls: 0, at: NOW });
    let text = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    const payloads = text
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)) as ProgressEvent);
    expect(payloads.map((p) => p.phase)).toEqual(["queued", "sweeping", "finished"]);
  });

  it("closes immediately for a finished search", async () => {
    await app.request(`${BASE}/searches`, post("/searches", body));
    store.finish("s1", "done", { datesOk: 3, datesMissing: [], labelsRead: 0, labelsUnparsed: 0, jevCalls: 0, durationMs: 1, warnings: [] }, null);
    store.setProgress("s1", { phase: "finished", message: "Scan complete", jevCalls: 0, at: NOW });
    const text = await (await app.request(`${BASE}/searches/s1/events`)).text();
    expect(text).toContain('"phase":"finished"');
  });

  it("ends with finished for a search interrupted by a server restart", async () => {
    await app.request(`${BASE}/searches`, post("/searches", body));
    store.setStatus("s1", "running");
    store.setProgress("s1", { phase: "sweeping", message: "Scanning 2026-11-10", jevCalls: 0, at: NOW });
    store.failInterrupted(NOW);
    const { events, ended } = await readStream(await app.request(`${BASE}/searches/s1/events`));
    expect(ended).toBe(true);
    expect(events.at(-1)).toMatchObject({ phase: "finished", message: "Server restarted during the search" });
  });

  it("adds a finished event and ends for a terminal search whose stored progress is not finished", async () => {
    await app.request(`${BASE}/searches`, post("/searches", body));
    store.setProgress("s1", { phase: "sweeping", message: "Scanning 2026-11-10", jevCalls: 2, at: NOW });
    store.finish("s1", "failed", { datesOk: 0, datesMissing: [], labelsRead: 0, labelsUnparsed: 0, jevCalls: 2, durationMs: 1, warnings: [] }, "Server restarted during the search");
    const { events, ended } = await readStream(await app.request(`${BASE}/searches/s1/events`));
    expect(ended).toBe(true);
    expect(events.map((e) => e.phase)).toEqual(["sweeping", "finished"]);
    expect(events[1]).toMatchObject({ message: "Scan failed", jevCalls: 2, at: NOW });
  });
});

describe("booking API", () => {
  it("opens the booking of a stored flight", async () => {
    await app.request(`${BASE}/searches`, post("/searches", body));
    const [stored] = store.saveItineraries("s1", sampleItineraries().slice(0, 1));
    book.mockResolvedValueOnce({ status: "airline", seller: "Etihad", url: "https://www.etihad.com/x" });
    const res = await app.request(`${BASE}/itineraries/${stored!.id}/book`, post(""));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "airline", seller: "Etihad", url: "https://www.etihad.com/x" });
    expect(book.mock.calls[0]![0].origins).toEqual(["GVA"]);
    expect(book.mock.calls[0]![1].id).toBe(stored!.id);
  });

  it("answers 404 for an unknown flight and 409 while another booking opens", async () => {
    expect((await app.request(`${BASE}/itineraries/nope/book`, post(""))).status).toBe(404);
    await app.request(`${BASE}/searches`, post("/searches", body));
    const [stored] = store.saveItineraries("s1", sampleItineraries().slice(0, 1));
    book.mockRejectedValueOnce(new BookingBusyError());
    const res = await app.request(`${BASE}/itineraries/${stored!.id}/book`, post(""));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "busy" });
  });
});

