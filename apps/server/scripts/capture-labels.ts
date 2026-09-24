// Usage: npm run capture -w @skai/server -- GVA,ZRH BKK,HKT 2026-11-10
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isValidIsoDate, parseLabels, searchUrl } from "@skai/core";
import {
  assertNotBlocked,
  expandMoreFlights,
  handleConsent,
  readResultLabels,
  waitForResults,
} from "../src/browser/page-state";
import { createBrowserSession } from "../src/browser/session";

const [originsArg, destinationsArg, date] = process.argv.slice(2);
if (!originsArg || !destinationsArg || !date || !isValidIsoDate(date)) {
  console.error("Usage: npm run capture -w @skai/server -- <ORIG,ORIG> <DEST,DEST> <YYYY-MM-DD>");
  process.exit(1);
}

const input = { date, origins: originsArg.split(","), destinations: destinationsArg.split(",") };
const session = createBrowserSession({ profileDir: join(homedir(), ".skai", "chrome-profile") });

try {
  const page = await session.page();
  const url = searchUrl(input);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await handleConsent(page);
  await assertNotBlocked(page);
  const state = await waitForResults(page, 20_000);
  const expanded = state === "results" ? await expandMoreFlights(page) : false;
  const labels = [...new Set(await readResultLabels(page))];
  const { itineraries, unparsed } = parseLabels(labels, date);
  const clues = await page.evaluate(() => ({
    buttons: [...document.querySelectorAll("button, [role=button]")]
      .map((b) => (b.getAttribute("aria-label") || (b as HTMLElement).innerText || "").replace(/\s+/g, " ").trim())
      .filter((text) => /more|other|flights/i.test(text))
      .slice(0, 30),
    hints: [
      ...new Set(
        [...document.querySelectorAll("[aria-label]")]
          .map((e) => e.getAttribute("aria-label") ?? "")
          .filter((l) => /transfer|separate|ticket|overnight|change of airport|different airport/i.test(l)),
      ),
    ].slice(0, 30),
  }));

  const dir = join(import.meta.dirname, "..", "..", "..", "packages", "core", "fixtures", "captured");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${input.origins.join("-")}_${input.destinations.join("-")}_${date}.json`);
  writeFileSync(
    file,
    JSON.stringify({ capturedAt: new Date().toISOString(), url, date, state, expanded, labels, unparsed, ...clues }, null, 2),
  );
  console.log(`${state}: ${labels.length} labels, ${itineraries.length} parsed, ${unparsed.length} unparsed`);
  console.log(`saved ${file}`);
} finally {
  await session.close();
}
