import { expect, it } from "vitest";
import { cubicBezier, EASE_IN_OUT, EASE_OUT } from "./easing";

it("maps 0 to 0 and 1 to 1, monotonically", () => {
  for (const ease of [EASE_OUT, EASE_IN_OUT]) {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    let previous = 0;
    for (let t = 0.05; t < 1; t += 0.05) {
      expect(ease(t)).toBeGreaterThanOrEqual(previous);
      previous = ease(t);
    }
  }
});

it("matches the curves' shape", () => {
  expect(EASE_OUT(0.25)).toBeGreaterThan(0.7); // strong ease-out: most of the way early
  expect(EASE_IN_OUT(0.5)).toBeGreaterThan(0.5); // (0.77, 0, 0.175, 1) leans slightly forward: ~0.6
  expect(EASE_IN_OUT(0.5)).toBeLessThan(0.7);
  expect(EASE_IN_OUT(0.1)).toBeLessThan(0.05);
  expect(cubicBezier(0, 0, 1, 1)(0.3)).toBeCloseTo(0.3, 3); // linear
});
