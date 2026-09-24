import { EventEmitter } from "node:events";
import type { ProgressEvent } from "@skai/core";

export interface ProgressBus {
  publish(searchId: string, event: ProgressEvent): void;
  subscribe(searchId: string, listener: (event: ProgressEvent) => void): () => void;
}

export function createProgressBus(): ProgressBus {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  return {
    publish: (searchId, event) => void emitter.emit(searchId, event),
    subscribe(searchId, listener) {
      emitter.on(searchId, listener);
      return () => void emitter.off(searchId, listener);
    },
  };
}
