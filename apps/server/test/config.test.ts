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
  expect(() => loadConfig({ SKAI_WEB_PORT: "abc" })).toThrow("Invalid SKAI_WEB_PORT: abc");
  expect(() => loadConfig({ SKAI_WEB_PORT: "70000" })).toThrow("Invalid SKAI_WEB_PORT");
});

it("reads the web dev port", () => {
  expect(allowedHosts(loadConfig({ SKAI_PORT: "4400", SKAI_WEB_PORT: "5200" }))).toEqual([
    "127.0.0.1:4400",
    "localhost:4400",
    "127.0.0.1:5200",
    "localhost:5200",
  ]);
});
