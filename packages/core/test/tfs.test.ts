import { expect, it } from "vitest";
import { buildTfs, searchUrl } from "../src/tfs";

it("reproduces Google's tfs for GVA → BKK one-way", () => {
  expect(buildTfs({ date: "2026-11-11", origins: ["GVA"], destinations: ["BKK"] })).toBe(
    "CBwQAhoeEgoyMDI2LTExLTExagcIARIDR1ZBcgcIARIDQktLQAFIAXABggELCP___________wGYAQI",
  );
});

it("encodes several airports on each side", () => {
  expect(buildTfs({ date: "2026-11-15", origins: ["GVA", "ZRH"], destinations: ["BKK", "HKT"] })).toBe(
    "CBwQAhowEgoyMDI2LTExLTE1agcIARIDR1ZBagcIARIDWlJIcgcIARIDQktLcgcIARIDSEtUQAFIAXABggELCP___________wGYAQI",
  );
});

it("builds the English, euro search URL", () => {
  expect(searchUrl({ date: "2026-11-11", origins: ["GVA"], destinations: ["BKK"] })).toBe(
    "https://www.google.com/travel/flights/search?tfs=CBwQAhoeEgoyMDI2LTExLTExagcIARIDR1ZBcgcIARIDQktLQAFIAXABggELCP___________wGYAQI&hl=en&curr=EUR",
  );
});
