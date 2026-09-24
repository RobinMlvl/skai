import { expect, it } from "vitest";
import { CORE_VERSION } from "../src/index";

it("loads the core package", () => {
  expect(CORE_VERSION).toBe("0.0.0");
});
