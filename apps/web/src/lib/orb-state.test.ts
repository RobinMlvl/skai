import { expect, it } from "vitest";
import { orbState } from "./orb-state";

it("maps each engine phase to an orb animation", () => {
  expect(orbState("connecting")).toBe("connecting");
  expect(orbState("sweeping")).toBe("working");
  expect(orbState("rescuing")).toBe("searching");
  expect(orbState("analyzing")).toBe("solving");
  expect(orbState("judging")).toBe("composing");
  expect(orbState("finished")).toBe("breathing");
  expect(orbState(null)).toBe("breathing");
});
