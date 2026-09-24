import type { ProgressEvent } from "@skai/core";
import { describe, expect, it } from "vitest";
import { createJobQueue } from "../src/jobs/job-queue";
import { createProgressBus } from "../src/jobs/progress-bus";

const event = (message: string): ProgressEvent => ({ phase: "sweeping", message, jevCalls: 0, at: "t" });

describe("ProgressBus", () => {
  it("delivers events to the subscribers of that search only, until they unsubscribe", () => {
    const bus = createProgressBus();
    const a: string[] = [];
    const b: string[] = [];
    const stopA = bus.subscribe("a", (e) => a.push(e.message));
    bus.subscribe("b", (e) => b.push(e.message));
    bus.publish("a", event("one"));
    stopA();
    bus.publish("a", event("two"));
    expect(a).toEqual(["one"]);
    expect(b).toEqual([]);
  });
});

describe("JobQueue", () => {
  it("runs jobs one at a time, in order", async () => {
    const log: string[] = [];
    const queue = createJobQueue(async (id) => {
      log.push(`start ${id}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
      log.push(`end ${id}`);
    });
    queue.enqueue("a");
    queue.enqueue("b");
    await queue.idle();
    expect(log).toEqual(["start a", "end a", "start b", "end b"]);
  });

  it("dequeues a waiting job and aborts the running one", async () => {
    const ran: string[] = [];
    let abortedReason: unknown = null;
    const queue = createJobQueue(async (id, signal) => {
      ran.push(id);
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => {
          abortedReason = signal.reason;
          resolve();
        });
      });
    });
    queue.enqueue("a");
    queue.enqueue("b");
    expect(queue.cancel("b")).toBe("dequeued");
    expect(queue.cancel("a")).toBe("aborted");
    expect(queue.cancel("zzz")).toBe("unknown");
    await queue.idle();
    expect(ran).toEqual(["a"]);
    expect(abortedReason).not.toBeNull();
  });

  it("keeps going after a job throws", async () => {
    const ran: string[] = [];
    const queue = createJobQueue(async (id) => {
      ran.push(id);
      if (id === "a") throw new Error("boom");
    });
    queue.enqueue("a");
    queue.enqueue("b");
    await queue.idle();
    expect(ran).toEqual(["a", "b"]);
  });
});
