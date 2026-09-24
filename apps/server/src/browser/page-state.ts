import { RESULT_LABEL_SOURCE } from "@skai/core";
import type { Page } from "playwright";

export class BlockedError extends Error {
  constructor(message = "Google showed a block page") {
    super(message);
    this.name = "BlockedError";
  }
}

export type ResultsState = "results" | "empty" | "timeout";

/** Google's cookie screen: always the privacy-preserving choice. */
export async function handleConsent(page: Page): Promise<void> {
  if (new URL(page.url()).hostname !== "consent.google.com") return;
  await page.getByRole("button", { name: "Reject all" }).first().click({ timeout: 10_000 });
  await page.waitForURL((url) => url.hostname !== "consent.google.com", { timeout: 15_000 });
}

/** Throws BlockedError on Google's block page. SkAI never retries or bypasses it. */
export async function assertNotBlocked(page: Page): Promise<void> {
  if (page.url().includes("/sorry/")) throw new BlockedError();
  const blocked = await page.evaluate(
    () =>
      /unusual traffic/i.test(document.body?.innerText ?? "") ||
      document.querySelector('iframe[src*="recaptcha"]') !== null,
  );
  if (blocked) throw new BlockedError();
}

export function readResultLabels(page: Page): Promise<string[]> {
  return page.evaluate((source) => {
    const pattern = new RegExp(source, "s");
    return [...document.querySelectorAll("[aria-label]")]
      .map((element) => element.getAttribute("aria-label") ?? "")
      .filter((label) => pattern.test(label));
  }, RESULT_LABEL_SOURCE);
}

export async function waitForResults(page: Page, timeoutMs: number): Promise<ResultsState> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await page
      .evaluate((source) => {
        const pattern = new RegExp(source, "s");
        const hasResult = [...document.querySelectorAll("[aria-label]")].some((element) =>
          pattern.test(element.getAttribute("aria-label") ?? ""),
        );
        if (hasResult) return "results" as const;
        if (/No (?:results|flights) (?:returned|found)/i.test(document.body?.innerText ?? "")) return "empty" as const;
        return null;
      }, RESULT_LABEL_SOURCE)
      .catch(() => null); // the page may be navigating
    if (state) return state;
    await page.waitForTimeout(250);
  }
  return "timeout";
}

export function readDepartureValue(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const input = [...document.querySelectorAll("input")].find((element) =>
      /departure/i.test(element.getAttribute("aria-label") ?? ""),
    );
    return input ? input.value : null;
  });
}

export async function expandMoreFlights(page: Page): Promise<boolean> {
  const button = page.getByRole("button", { name: /more flights/i }).first();
  if ((await button.count()) === 0) return false;
  const before = (await readResultLabels(page)).length;
  await button.click({ timeout: 5_000 });
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && (await readResultLabels(page)).length <= before) {
    await page.waitForTimeout(250);
  }
  return true;
}
