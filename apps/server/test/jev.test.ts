import { noul } from "@typesafe-ai/sdk";
import { expect, it, vi } from "vitest";
import { createJev, toEntry } from "../src/jev";

it("forwards state, questions and the abort signal, and counts calls", async () => {
  const systemOne = vi.fn(async () => ({
    model: "jev-latest",
    usage: { input_tokens: 10, output_tokens: 1 },
    answers: { fits: { type: "noul", noul: 0.9 } },
  }));
  const jev = createJev({ systemOne } as never);
  const signal = new AbortController().signal;
  const answers = await jev.ask({ preference: "no red-eye" }, { fits: noul("Does it fit?") }, signal);
  expect(answers.fits.noul).toBe(0.9);
  expect(jev.calls).toBe(1);
  expect(systemOne).toHaveBeenCalledWith(
    { state: { preference: "no red-eye" }, questions: { fits: expect.objectContaining({ type: "noul" }) } },
    { signal },
  );
});

it("turns values into JSON state", () => {
  expect(toEntry({ a: 1, b: undefined, c: [1, "x"] })).toEqual({ a: 1, c: [1, "x"] });
});
