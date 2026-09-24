import {
  flightIdentity,
  RESULT_LABEL_SOURCE,
  searchUrl,
  type SearchRequest,
  type StoredItinerary,
  type TfsInput,
} from "@skai/core";
import type { Page } from "playwright";
import {
  assertNotBlocked,
  expandMoreFlights,
  handleConsent,
  readResultLabels,
  waitForResults,
  waitForStableResults,
} from "../browser/page-state";
import type { BrowserSession } from "../browser/session";

/**
 * Opens the booking of one flight, only when the user clicks its card: SkAI selects that flight on
 * Google and continues to the airline's own site. It never fills anything in and never pays.
 */
export type BookingResult =
  | { status: "airline"; seller: string; url: string } // the airline's site is open in SkAI's window
  | { status: "options" } // no airline sells it: Google's booking options are open for the user
  | { status: "not-found" }; // Google no longer lists this flight: its results are open

export type Booker = (request: SearchRequest, itinerary: StoredItinerary) => Promise<BookingResult>;

export class BookingBusyError extends Error {
  constructor() {
    super("A booking is already opening");
    this.name = "BookingBusyError";
  }
}

export interface BookerOptions {
  session: BrowserSession;
  urlFor?: (input: TfsInput) => string;
  resultsTimeoutMs?: number;
  sellersTimeoutMs?: number;
}

const SELLER = /^Continue to book with /i;
const AIRLINE_SELLER = /^Continue to book with (.+?) airline\b/i;
const STEP_MS = 250;

const onGoogle = (page: Page) => new URL(page.url()).hostname.endsWith("google.com");

async function until<T>(timeoutMs: number, probe: () => Promise<T | null>): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe().catch(() => null);
    if (value !== null || Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, STEP_MS));
  }
}

/** Clicks the visible result row showing this flight (price ignored: Google may have re-priced it). */
async function clickFlight(page: Page, itinerary: StoredItinerary): Promise<boolean> {
  const target = flightIdentity(itinerary.rawLabel);
  const indices = (await readResultLabels(page)).flatMap((label, i) => (flightIdentity(label) === target ? [i] : []));
  if (indices.length === 0) return false;
  const tagged = await page.evaluate(
    ({ source, indices }) => {
      const pattern = new RegExp(source, "s");
      const rows = [...document.querySelectorAll("[aria-label]")].filter((e) => pattern.test(e.getAttribute("aria-label") ?? ""));
      const row = indices.map((i) => rows[i]).find((e) => e instanceof HTMLElement && e.checkVisibility());
      row?.setAttribute("data-skai-book", "1");
      return row !== undefined;
    },
    { source: RESULT_LABEL_SOURCE, indices },
  );
  if (!tagged) return false;
  await page.locator('[data-skai-book="1"]').first().click({ timeout: 5_000 });
  return true;
}

const readSellers = (page: Page) =>
  page.evaluate((source) => {
    const pattern = new RegExp(source, "i");
    return [...document.querySelectorAll("button, [role=button]")]
      .map((b) => b.getAttribute("aria-label") ?? "")
      .filter((label) => pattern.test(label));
  }, SELLER.source);

export function createBooker(options: BookerOptions): Booker {
  const urlFor = options.urlFor ?? searchUrl;
  const resultsTimeoutMs = options.resultsTimeoutMs ?? 20_000;
  const sellersTimeoutMs = options.sellersTimeoutMs ?? 20_000;
  let busy = false;

  return async (request, itinerary) => {
    if (busy) throw new BookingBusyError();
    busy = true;
    try {
      const page = await options.session.newPage();
      await page.bringToFront();
      await page.goto(urlFor({ date: itinerary.date, origins: request.origins, destinations: request.destinations }), {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await handleConsent(page);
      await assertNotBlocked(page);
      if ((await waitForResults(page, resultsTimeoutMs)) !== "results") return { status: "not-found" };
      await waitForStableResults(page);
      const clicked = (await clickFlight(page, itinerary)) || ((await expandMoreFlights(page)) && (await clickFlight(page, itinerary)));
      if (!clicked) return { status: "not-found" };

      // Google loads its sellers progressively: wait for the first one, then for the list to settle.
      const first = await until(sellersTimeoutMs, async () => ((await readSellers(page)).length > 0 ? true : null));
      await assertNotBlocked(page);
      if (!first) return { status: "options" };
      await page.waitForTimeout(1_000);
      const airline = (await readSellers(page)).map((label) => AIRLINE_SELLER.exec(label)).find((m) => m !== null);
      if (!airline) return { status: "options" };

      // "Continue" opens the airline in a new tab (or, sometimes, in the same one).
      const popup = page.context().waitForEvent("page", { timeout: 15_000 });
      const sameTab = until(15_000, async () => (onGoogle(page) ? null : page)).then(
        (left) => left ?? Promise.reject(new Error("Google did not open the airline's site")),
      );
      await page.getByRole("button", { name: airline.input, exact: true }).click({ timeout: 5_000 });
      const tab = await Promise.any([popup, sameTab]);
      await until(15_000, async () => (onGoogle(tab) ? null : true)); // let Google's redirect reach the airline
      await tab.bringToFront();
      return { status: "airline", seller: airline[1]!, url: tab.url() };
    } finally {
      busy = false;
    }
  };
}
