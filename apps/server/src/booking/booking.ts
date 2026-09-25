import {
  flightIdentity,
  searchUrl,
  type BookingResult,
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
  /** How long Google may take to open the airline's site after "Continue". */
  airlineTimeoutMs?: number;
}

const SELLER = /^Continue to book with /i;

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/**
 * The seller behind a Google "Continue to book with …" label, when it is one of the flight's airlines.
 * Seen live: "… with Etihad airline for 516 euros" and "… with Icelandair, Economy Light for 283 euros".
 */
export function airlineSeller(label: string, airlines: readonly string[]): string | null {
  const name = label.replace(SELLER, "").split(/ for [\d,.]+ /)[0]!;
  const seller = name.replace(/ airline$/i, "").split(",")[0]!.trim();
  const isAirline = / airline$/i.test(name) || airlines.some((airline) => fold(airline) === fold(seller));
  return isAirline && seller ? seller : null;
}
const STEP_MS = 250;

/** An http(s) page off Google: not Google, and not a placeholder (about:blank, chrome-error:). */
const onAirline = (page: Page) => {
  const url = new URL(page.url());
  return /^https?:$/.test(url.protocol) && !url.hostname.endsWith("google.com");
};

/** Polls `probe` until it returns a value, `timeoutMs` passes or `signal` aborts (then null). */
async function until<T>(timeoutMs: number, probe: () => Promise<T | null>, signal?: AbortSignal): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe().catch(() => null);
    if (value !== null || Date.now() > deadline || signal?.aborted) return value;
    await new Promise((resolve) => setTimeout(resolve, STEP_MS));
  }
}

/**
 * Clicks, in one page call (no gap for Google to re-sort the list), the first visible row labelled
 * exactly as one of `labels`, and returns its label (null when none is visible).
 */
const clickRow = (page: Page, labels: readonly string[]) =>
  page.evaluate((labels) => {
    const row = [...document.querySelectorAll("[aria-label]")].find(
      (e): e is HTMLElement => e instanceof HTMLElement && labels.includes(e.getAttribute("aria-label")!) && e.checkVisibility(),
    );
    const label = row?.getAttribute("aria-label") ?? null;
    // On Google the labelled row sits under its visible content (same click handler), which
    // intercepts a mouse click: fire the click on the row itself. It only navigates, no popup.
    row?.click();
    return label;
  }, labels);

/** Selects Google's "Cheapest" results tab; false when there is none. */
async function showCheapest(page: Page): Promise<boolean> {
  const name = /^Cheapest/i;
  const tab = page.getByRole("tab", { name }).or(page.getByRole("button", { name })).first();
  if ((await tab.count()) === 0) return false;
  await tab.click({ timeout: 5_000 });
  return true;
}

/** Clicks the visible result row showing this flight (price ignored: Google may have re-priced it). */
async function clickFlight(page: Page, itinerary: StoredItinerary): Promise<boolean> {
  const target = flightIdentity(itinerary.rawLabel);
  const labels = (await readResultLabels(page)).filter((label) => flightIdentity(label) === target);
  if (labels.length === 0) return false;
  // Listed but hidden: the flight is only in the "Cheapest" tab. Retry there (its list may render late).
  const clicked =
    (await clickRow(page, labels)) ?? ((await showCheapest(page)) ? await until(3_000, () => clickRow(page, labels)) : null);
  return clicked !== null && flightIdentity(clicked) === target;
}

const readSellers = (page: Page) =>
  page.evaluate((source) => {
    const pattern = new RegExp(source, "i");
    return [...document.querySelectorAll("button, [role=button]")]
      .filter((b) => b.checkVisibility()) // what the click can reach: Google keeps some sellers hidden
      .map((b) => b.getAttribute("aria-label") ?? "")
      .filter((label) => pattern.test(label));
  }, SELLER.source);

export function createBooker(options: BookerOptions): Booker {
  const urlFor = options.urlFor ?? searchUrl;
  const resultsTimeoutMs = options.resultsTimeoutMs ?? 20_000;
  const sellersTimeoutMs = options.sellersTimeoutMs ?? 20_000;
  const airlineTimeoutMs = options.airlineTimeoutMs ?? 15_000;
  let busy = false;

  return async (request, itinerary) => {
    if (busy) throw new BookingBusyError();
    busy = true;
    const ended = new AbortController(); // stops the background polling when the booking ends
    try {
      const page = await options.session.newPage();
      await page.bringToFront();
      await page.goto(urlFor({ date: itinerary.date, origins: request.origins, destinations: request.destinations }), {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await handleConsent(page);
      await assertNotBlocked(page);
      // A block page that shows up late is a block, not a missing flight.
      const notFound = async () => {
        await assertNotBlocked(page);
        return { status: "not-found" } as const;
      };
      if ((await waitForResults(page, resultsTimeoutMs)) !== "results") return await notFound();
      await waitForStableResults(page);
      const clicked = (await clickFlight(page, itinerary)) || ((await expandMoreFlights(page)) && (await clickFlight(page, itinerary)));
      if (!clicked) return await notFound();

      // Google loads its sellers progressively: wait for the first one, then for the list to settle.
      const first = await until(sellersTimeoutMs, async () => ((await readSellers(page)).length > 0 ? true : null));
      await assertNotBlocked(page);
      if (!first) return { status: "options" };
      await page.waitForTimeout(1_000);
      const sellers = await readSellers(page);
      const label = sellers.find((candidate) => airlineSeller(candidate, itinerary.airlines) !== null);
      if (!label) return { status: "options" };
      const seller = airlineSeller(label, itinerary.airlines)!;

      // "Continue" opens the airline in a new tab (or, sometimes, in the same one). Both waits start
      // before the click so neither misses it; Promise.all handles them even if the click throws.
      const popup = page.context().waitForEvent("page", { timeout: airlineTimeoutMs });
      const sameTab = until(airlineTimeoutMs, async () => (onAirline(page) ? page : null), ended.signal).then(
        (left) => left ?? Promise.reject(new Error("Still on Google")),
      );
      const [tab] = await Promise.all([
        Promise.any([popup, sameTab]).catch(() => {
          throw new Error("Google did not open the airline's site.");
        }),
        page.getByRole("button", { name: label, exact: true }).click({ timeout: 5_000 }),
      ]);
      await until(airlineTimeoutMs, async () => (onAirline(tab) ? true : null)); // let Google's redirect reach the airline
      await tab.bringToFront();
      return { status: "airline", seller, url: tab.url() };
    } finally {
      ended.abort();
      busy = false;
    }
  };
}
