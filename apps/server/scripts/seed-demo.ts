// Dev-only: SKAI_DATA_DIR=/tmp/x npx tsx apps/server/scripts/seed-demo.ts
import { join } from "node:path";
import { emptyStats, makeSearchRequestSchema, parseLabels, todayIso } from "@skai/core";
import fixture from "../../../packages/core/fixtures/gva-bkk-2026-11-10.json";
import { loadConfig } from "../src/config";
import { openSqliteStore } from "../src/store/search-store";

const store = openSqliteStore(join(loadConfig(process.env).dataDir, "skai.db"));
const request = makeSearchRequestSchema(todayIso()).parse({
  origins: ["GVA"],
  destinations: ["BKK"],
  dateFrom: fixture.date,
  dateTo: fixture.date,
});
const now = new Date().toISOString();
store.create("demo", request, now);
store.saveItineraries("demo", parseLabels(fixture.labels, fixture.date).itineraries);
store.finish("demo", "done", { ...emptyStats(), datesOk: 1, labelsRead: fixture.labels.length }, null);
store.setProgress("demo", { phase: "finished", message: "Scan complete", jevCalls: 0, at: now });
store.close();
console.log("Seeded search 'demo'");
