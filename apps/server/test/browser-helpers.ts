import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import { createBrowserSession, type BrowserSession } from "../src/browser/session";

export const testSession = (): BrowserSession =>
  createBrowserSession({ profileDir: mkdtempSync(join(tmpdir(), "skai-test-")), headless: true });

/** Answer every request of `page` with fixture HTML (no network access in tests). */
export async function serve(page: Page, html: string | ((url: URL) => string)): Promise<void> {
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.route("**/*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: typeof html === "string" ? html : html(new URL(route.request().url())),
    }),
  );
}

export const escapeAttr = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export const resultsPage = (departure: string, labels: readonly string[], extra = "") =>
  `<!doctype html><html><body>
    <input aria-label="Departure" value="${escapeAttr(departure)}">
    <ul id="results">${labels.map((l) => `<li><div aria-label="${escapeAttr(l)}">flight</div></li>`).join("")}</ul>
    ${extra}
  </body></html>`;
