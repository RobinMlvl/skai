import { homedir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { allowedHosts, loadConfig } from "../src/config";

it("uses defaults and expands ~", () => {
  expect(loadConfig({})).toEqual({ port: 4317, dataDir: join(homedir(), ".skai"), typesafeApiKey: null, webDevPort: 5173 });
});

it("reads overrides and trims the key", () => {
  const config = loadConfig({ SKAI_PORT: "5000", SKAI_DATA_DIR: "/tmp/skai", TYPESAFE_API_KEY: "  key  " });
  expect(config).toMatchObject({ port: 5000, dataDir: "/tmp/skai", typesafeApiKey: "key" });
  expect(allowedHosts(config)).toEqual(["127.0.0.1:5000", "localhost:5000", "127.0.0.1:5173", "localhost:5173"]);
});

it("rejects an invalid port", () => {
  expect(() => loadConfig({ SKAI_PORT: "abc" })).toThrow("Invalid SKAI_PORT");
});
