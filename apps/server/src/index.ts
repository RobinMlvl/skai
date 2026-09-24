import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { todayIso } from "@skai/core";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { createApp } from "./api/app";
import { createBrowserSession } from "./browser/session";
import { allowedHosts, loadConfig } from "./config";
import { createJev } from "./jev";
import { createJobQueue } from "./jobs/job-queue";
import { createProgressBus } from "./jobs/progress-bus";
import { createSearchRunner } from "./jobs/run-search";
import { createGoogleFlightsSource } from "./sources/google-flights";
import { openSqliteStore } from "./store/search-store";

const config = loadConfig(process.env);
mkdirSync(config.dataDir, { recursive: true });

const store = openSqliteStore(join(config.dataDir, "skai.db"));
const interrupted = store.failInterrupted();
if (interrupted > 0) console.warn(`[skai] ${interrupted} interrupted search(es) marked as failed`);

const jev = config.typesafeApiKey ? createJev(new TypeSafeClient({ apiKey: config.typesafeApiKey })) : null;
if (!jev) console.warn("[skai] TYPESAFE_API_KEY is not set: Jev rescue and preference checks are disabled");

const now = () => new Date().toISOString();
const bus = createProgressBus();
const session = createBrowserSession({ profileDir: join(config.dataDir, "chrome-profile") });
const source = createGoogleFlightsSource({ session, jev, debugDir: join(config.dataDir, "debug") });
const queue = createJobQueue(createSearchRunner({ store, bus, source, jev, now }));
const app = createApp({ store, queue, bus, allowedHosts: allowedHosts(config), today: () => todayIso(), newId: randomUUID, now });

const server = serve({ fetch: app.fetch, port: config.port, hostname: "127.0.0.1" }, (info) => {
  console.log(`[skai] API on http://127.0.0.1:${info.port}/api, web app on http://127.0.0.1:${config.webDevPort}`);
});

const shutdown = async () => {
  server.close();
  await session.close();
  store.close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
