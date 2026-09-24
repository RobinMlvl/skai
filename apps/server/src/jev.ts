import type { EntryType, Questions, SystemOneResult, TypeSafeClient } from "@typesafe-ai/sdk";

export interface Jev {
  readonly calls: number;
  ask<const Q extends Questions>(state: EntryType, questions: Q, signal?: AbortSignal): Promise<SystemOneResult<Q>["answers"]>;
}

/** Thin wrapper over TypeSafe's System One endpoint that counts calls for the search stats. */
export function createJev(client: Pick<TypeSafeClient, "systemOne">): Jev {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async ask<const Q extends Questions>(state: EntryType, questions: Q, signal?: AbortSignal) {
      calls += 1;
      const result = await client.systemOne({ state, questions }, signal ? { signal } : undefined);
      return result.answers;
    },
  };
}

export const toEntry = (value: unknown): EntryType => JSON.parse(JSON.stringify(value)) as EntryType;
