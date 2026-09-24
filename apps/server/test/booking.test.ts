import type { StoredItinerary } from "@skai/core";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BookingBusyError, createBooker } from "../src/booking/booking";
import { BlockedError } from "../src/browser/page-state";
import type { BrowserSession } from "../src/browser/session";
import { escapeAttr, testSession } from "./browser-helpers";
import { sampleItineraries, sampleRequest } from "./helpers";

let session: BrowserSession;
let page: Page;
beforeAll(async () => {
  session = testSession();
  page = await session.page();
});
afterAll(() => session.close());

const request = sampleRequest();
const [etihad, , lufthansa, , , turkishOman] = sampleItineraries();
const target: StoredItinerary = { ...etihad!, id: "it-1" };
const repriced = (label: string) => label.replace("From 515 euros", "From 530 euros");

// Every request of every tab in the context (including popups) gets fixture HTML: no network.
async function serveAll(html: (url: URL) => string) {
  const context = page.context();
  await context.unrouteAll({ behavior: "ignoreErrors" });
  await context.route("**/*", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: html(new URL(route.request().url())) }),
  );
}

const searchPage = (labels: readonly string[]) => `<!doctype html><html><body>
  <input aria-label="Departure" value="Tue, Nov 10">
  ${labels.map((l) => `<div role="link" tabindex="0" aria-label="${escapeAttr(l)}">flight</div>`).join("")}
  <script>
    document.querySelectorAll("[role=link]").forEach((row, i) =>
      row.addEventListener("click", () => { location.href = "https://www.google.com/travel/flights/booking?row=" + i; }));
  </script>
</body></html>`;

const bookingPage = (sellers: string[]) => `<!doctype html><html><body>
  <h2>Booking options</h2>
  ${sellers.map((s) => `<button aria-label="${escapeAttr(s)}">Continue</button>`).join("")}
  <script>
    const row = new URLSearchParams(location.search).get("row");
    document.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => window.open("https://www.etihad.com/booking?row=" + row)));
  </script>
</body></html>`;

const ETIHAD = "Continue to book with Etihad airline for 516 euros (Equivalent to 485 Swiss francs on Etihad)";
const BRAVOFLY = "Continue to book with Bravofly for 510 euros";

function site(labels: readonly string[], sellers: string[]) {
  return (url: URL) => {
    if (url.hostname === "www.etihad.com") return "<h1>Etihad booking</h1>";
    if (url.pathname.startsWith("/travel/flights/booking")) return bookingPage(sellers);
    return searchPage(labels);
  };
}

const booker = (overrides: Partial<Parameters<typeof createBooker>[0]> = {}) =>
  createBooker({
    session,
    urlFor: (input) => `https://www.google.com/travel/flights/search?d=${input.date}`,
    resultsTimeoutMs: 3_000,
    sellersTimeoutMs: 3_000,
    ...overrides,
  });

describe("booking a flight on the airline's site", () => {
  it("clicks the same flight even if its price changed, then opens the airline's site", async () => {
    await serveAll(site([lufthansa!.rawLabel, repriced(etihad!.rawLabel), turkishOman!.rawLabel], [BRAVOFLY, ETIHAD]));
    const result = await booker()(request, target);
    expect(result).toEqual({ status: "airline", seller: "Etihad", url: "https://www.etihad.com/booking?row=1" });
  });

  it("stops on Google's booking options when no airline sells the flight", async () => {
    await serveAll(site([etihad!.rawLabel], [BRAVOFLY]));
    expect(await booker()(request, target)).toEqual({ status: "options" });
  });

  it("reports a flight that is no longer listed", async () => {
    await serveAll(site([lufthansa!.rawLabel], [ETIHAD]));
    expect(await booker()(request, target)).toEqual({ status: "not-found" });
  });

  it("opens one booking at a time", async () => {
    await serveAll(site([etihad!.rawLabel], []));
    const book = booker();
    const first = book(request, target);
    await expect(book(request, target)).rejects.toBeInstanceOf(BookingBusyError);
    expect(await first).toEqual({ status: "options" });
  });

  it("stops on a block page", async () => {
    await serveAll(() => "<p>Our systems have detected unusual traffic from your computer network.</p>");
    await expect(booker()(request, target)).rejects.toBeInstanceOf(BlockedError);
  });
});
