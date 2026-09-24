// Dev-only: SKAI_DATA_DIR=/tmp/x npx tsx apps/server/scripts/seed-demo.ts
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { emptyStats, makeSearchRequestSchema, parseLabels } from "@skai/core";
import fixture from "../../../packages/core/fixtures/gva-bkk-2026-11-10.json";
import { loadConfig } from "../src/config";
import { openSqliteStore } from "../src/store/search-store";

const store = openSqliteStore(join(loadConfig(process.env).dataDir, "skai.db"));
// The fixture date is "today", so the seed keeps validating once that date is past.
const request = makeSearchRequestSchema(fixture.date).parse({
  origins: ["GVA"],
  destinations: ["BKK"],
  dateFrom: fixture.date,
  dateTo: fixture.date,
});
const id = randomUUID();
const now = new Date().toISOString();
store.create(id, request, now);
store.saveItineraries(id, parseLabels(fixture.labels, fixture.date).itineraries);
store.finish(id, "done", { ...emptyStats(), datesOk: 1, labelsRead: fixture.labels.length }, null);
store.setProgress(id, { phase: "finished", message: "Scan complete", jevCalls: 0, at: now });
store.close();
console.log(`Seeded search ${id}`);
