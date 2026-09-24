import { expect, it } from "vitest";
import { niceTicks, paddedDomain } from "./chart-scale";

it("pads the domain by 8 % and never goes below zero", () => {
  expect(paddedDomain(10, 20)).toEqual([9.2, 20.8]);
  expect(paddedDomain(0, 100)).toEqual([0, 108]);
  expect(paddedDomain(50, 50)).toEqual([45, 55]);
});

it("produces round ticks inside the domain", () => {
  expect(niceTicks(12.7, 31.2, 5)).toEqual([15, 20, 25, 30]);
  expect(niceTicks(420, 630, 4)).toEqual([450, 500, 550, 600]);
});
