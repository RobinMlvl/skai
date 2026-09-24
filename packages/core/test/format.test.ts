import { expect, it } from "vitest";
import { formatDuration, formatPrice } from "../src/format";

it("formats durations compactly", () => {
  expect(formatDuration(900)).toBe("15h");
  expect(formatDuration(845)).toBe("14h05");
  expect(formatDuration(55)).toBe("55m");
});

it("formats euro prices", () => {
  expect(formatPrice(1234)).toBe("€1,234");
});
