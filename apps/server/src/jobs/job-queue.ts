export type JobRunner = (searchId: string, signal: AbortSignal) => Promise<void>;

export interface JobQueue {
  enqueue(searchId: string): void;
  cancel(searchId: string): "dequeued" | "aborted" | "unknown";
  idle(): Promise<void>;
}

/** In-memory queue with a concurrency of 1: SkAI drives a single Chrome window. */
export function createJobQueue(run: JobRunner): JobQueue {
  const pending: string[] = [];
  let current: { id: string; controller: AbortController } | null = null;
  let idleWaiters: (() => void)[] = [];

  const pump = async (): Promise<void> => {
    if (current) return;
    const id = pending.shift();
    if (id === undefined) {
      for (const resolve of idleWaiters) resolve();
      idleWaiters = [];
      return;
    }
    current = { id, controller: new AbortController() };
    try {
      await run(id, current.controller.signal);
    } catch (error) {
      console.error(`[skai] search ${id} crashed`, error);
    } finally {
      current = null;
      void pump();
    }
  };

  return {
    enqueue(id) {
      pending.push(id);
      void pump();
    },
    cancel(id) {
      const index = pending.indexOf(id);
      if (index >= 0) {
        pending.splice(index, 1);
        return "dequeued";
      }
      if (current?.id === id) {
        current.controller.abort(new Error("Cancelled by the user"));
        return "aborted";
      }
      return "unknown";
    },
    idle() {
      if (!current && pending.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => idleWaiters.push(resolve));
    },
  };
}
