import type { Questions } from "@typesafe-ai/sdk";
import type { Jev } from "../src/jev";

export const choiceAnswer = (choice: string, confidence = 0.9) => ({
  type: "choice",
  choice,
  confidence,
  probabilities: { [choice]: confidence },
});

export const noulAnswer = (noul: number) => ({ type: "noul", noul });

/** A scripted Jev: `respond` returns the answers object for each call. */
export function fakeJev(
  respond: (state: any, questions: Questions, call: number) => Record<string, unknown> | Promise<Record<string, unknown>>,
): Jev & { states: unknown[] } {
  let calls = 0;
  const states: unknown[] = [];
  return {
    states,
    get calls() {
      return calls;
    },
    async ask(state, questions) {
      calls += 1;
      states.push(state);
      return (await respond(state, questions, calls)) as never;
    },
  };
}
