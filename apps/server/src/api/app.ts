import { emptyStats, isTerminal, makeSearchRequestSchema, type ProgressEvent } from "@skai/core";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { JobQueue } from "../jobs/job-queue";
import type { ProgressBus } from "../jobs/progress-bus";
import { FINISH_MESSAGES } from "../jobs/run-search";
import type { SearchStore } from "../store/search-store";
import { localGuard } from "./guard";

export interface AppDeps {
  store: SearchStore;
  queue: JobQueue;
  bus: ProgressBus;
  allowedHosts: readonly string[];
  today: () => string;
  newId: () => string;
  now: () => string;
}

const PING_MS = 15_000;
const notFound = { error: "not_found", message: "Search not found" } as const;

export function createApp(deps: AppDeps) {
  const app = new Hono().basePath("/api");
  app.use("*", localGuard(deps.allowedHosts));

  app.post("/searches", async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = makeSearchRequestSchema(deps.today()).safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid request";
      return c.json({ error: "invalid_request", message, issues: parsed.error.issues }, 400);
    }
    const id = deps.newId();
    deps.store.create(id, parsed.data, deps.now());
    deps.store.setProgress(id, { phase: "queued", message: "Waiting in queue", jevCalls: 0, at: deps.now() });
    deps.queue.enqueue(id);
    return c.json({ id }, 201);
  });

  app.get("/searches", (c) => c.json(deps.store.list(50)));

  app.get("/searches/:id", (c) => {
    const detail = deps.store.get(c.req.param("id"));
    return detail ? c.json(detail) : c.json(notFound, 404);
  });

  app.post("/searches/:id/cancel", (c) => {
    const id = c.req.param("id");
    if (!deps.store.get(id)) return c.json(notFound, 404);
    const result = deps.queue.cancel(id);
    if (result === "dequeued") {
      deps.store.finish(id, "cancelled", emptyStats(), null);
      const finished: ProgressEvent = { phase: "finished", message: "Scan cancelled", jevCalls: 0, at: deps.now() };
      deps.store.setProgress(id, finished);
      deps.bus.publish(id, finished);
    }
    // "aborted": the runner records the cancellation and emits "finished" itself.
    return c.json({ result }, 202);
  });

  app.get("/searches/:id/events", (c) => {
    const id = c.req.param("id");
    if (!deps.store.get(id)) return c.json(notFound, 404);
    return streamSSE(c, async (stream) => {
      const pending: ProgressEvent[] = [];
      let wake: (() => void) | null = null;
      // Subscribe before reading the stored progress so no event can fall in between.
      const unsubscribe = deps.bus.subscribe(id, (event) => {
        pending.push(event);
        wake?.();
      });
      stream.onAbort(() => {
        unsubscribe();
        wake?.();
      });
      try {
        const { search } = deps.store.get(id)!;
        if (search.progress) {
          await stream.writeSSE({ event: "progress", data: JSON.stringify(search.progress) });
        }
        // A terminal search never waits for events: it ends with a finished event, stored or added here.
        if (isTerminal(search.status)) {
          if (search.progress?.phase !== "finished") {
            const finished: ProgressEvent = {
              phase: "finished",
              message: FINISH_MESSAGES[search.status],
              jevCalls: search.progress?.jevCalls ?? 0,
              at: deps.now(),
            };
            await stream.writeSSE({ event: "progress", data: JSON.stringify(finished) });
          }
          return;
        }
        while (!stream.aborted) {
          const next = pending.shift();
          if (!next) {
            const timedOut = await new Promise<boolean>((resolve) => {
              const timer = setTimeout(() => resolve(true), PING_MS);
              wake = () => {
                clearTimeout(timer);
                resolve(false);
              };
            });
            wake = null;
            if (timedOut && !stream.aborted) await stream.writeSSE({ event: "ping", data: "" });
            continue;
          }
          await stream.writeSSE({ event: "progress", data: JSON.stringify(next) });
          if (next.phase === "finished") return;
        }
      } finally {
        unsubscribe();
      }
    });
  });

  return app;
}
