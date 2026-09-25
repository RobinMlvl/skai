import type { StoredItinerary } from "@skai/core";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { airlineSeller, BookingBusyError, createBooker } from "../src/booking/booking";
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

const rows = (labels: readonly string[]) =>
  labels.map((l) => `<div role="link" tabindex="0" aria-label="${escapeAttr(l)}">flight</div>`).join("");

// Google's result tabs: the "Cheapest" list is in the page but hidden until its tab is selected.
const searchPage = (labels: readonly string[], cheapest: readonly string[]) => `<!doctype html><html><body>
  <input aria-label="Departure" value="Tue, Nov 10">
  <div role="tab" onclick="best.hidden = true; cheap.hidden = false">Cheapest from 452 euros</div>
  <div id="best">${rows(labels)}</div>
  <div id="cheap" hidden>${rows(cheapest)}</div>
  <script>
    document.querySelectorAll("[role=link]").forEach((row, i) =>
      row.addEventListener("click", () => { location.href = "https://www.google.com/travel/flights/booking?row=" + i; }));
  </script>
</body></html>`;

// "Continue" opens the airline in a new tab: directly, empty first then redirected, or not at all.
type Opens = "tab" | "blank-tab" | "nothing";
const bookingPage = (sellers: string[], hidden: string[], opens: Opens) => `<!doctype html><html><body>
  <h2>Booking options</h2>
  ${sellers.map((s) => `<button aria-label="${escapeAttr(s)}">Continue</button>`).join("")}
  ${hidden.map((s) => `<button hidden aria-label="${escapeAttr(s)}">Continue</button>`).join("")}
  <script>
    const url = "https://www.etihad.com/booking?row=" + new URLSearchParams(location.search).get("row");
    document.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        if ("${opens}" === "tab") window.open(url);
        if ("${opens}" !== "blank-tab") return;
        const tab = window.open("about:blank");
        setTimeout(() => { tab.location.href = url; }, 500);
      }));
  </script>
</body></html>`;

const ETIHAD = "Continue to book with Etihad airline for 516 euros (Equivalent to 485 Swiss francs on Etihad)";
const BRAVOFLY = "Continue to book with Bravofly for 510 euros";

function site(
  labels: readonly string[],
  sellers: string[],
  { hidden = [] as string[], cheapest = [] as string[], opens = "tab" as Opens } = {},
) {
  return (url: URL) => {
    if (url.hostname === "www.etihad.com") return "<h1>Etihad booking</h1>";
    if (url.pathname.startsWith("/travel/flights/booking")) return bookingPage(sellers, hidden, opens);
    return searchPage(labels, cheapest);
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

/** Rejections nobody handled while `run` ran and `graceMs` after it (a stray wait can reject late). */
async function unhandledDuring(run: () => Promise<void>, graceMs: number): Promise<unknown[]> {
  const reasons: unknown[] = [];
  const record = (reason: unknown) => reasons.push(reason);
  process.on("unhandledRejection", record);
  try {
    await run();
    await new Promise((resolve) => setTimeout(resolve, graceMs));
  } finally {
    process.off("unhandledRejection", record);
  }
  return reasons;
}

describe("booking a flight on the airline's site", () => {
  it("clicks the same flight even if its price changed, then opens the airline's site", async () => {
    await serveAll(site([lufthansa!.rawLabel, repriced(etihad!.rawLabel), turkishOman!.rawLabel], [BRAVOFLY, ETIHAD]));
    const result = await booker()(request, target);
    expect(result).toEqual({ status: "airline", seller: "Etihad", url: "https://www.etihad.com/booking?row=1" });
  });

  it("recognises an airline seller listed by fare class, without the word airline", async () => {
    const icelandair = { ...target, airlines: ["Icelandair"] };
    await serveAll(
      site(
        [etihad!.rawLabel],
        [
          "Continue to book with lastminute.com for 282 euros",
          "Continue to book with Icelandair, Economy Light for 283 euros",
          "Continue to book with Icelandair, Economy Standard for 323 euros",
        ],
      ),
    );
    expect(await booker()(request, icelandair)).toEqual({
      status: "airline",
      seller: "Icelandair",
      url: "https://www.etihad.com/booking?row=0",
    });
  });

  it("selects Google's Cheapest tab when the flight is listed only there", async () => {
    await serveAll(site([lufthansa!.rawLabel], [ETIHAD], { cheapest: [turkishOman!.rawLabel, etihad!.rawLabel] }));
    expect(await booker()(request, target)).toEqual({ status: "airline", seller: "Etihad", url: "https://www.etihad.com/booking?row=2" });
  });

  it("waits for the airline's page when the new tab opens empty first", async () => {
    await serveAll(site([etihad!.rawLabel], [ETIHAD], { opens: "blank-tab" }));
    expect(await booker()(request, target)).toEqual({ status: "airline", seller: "Etihad", url: "https://www.etihad.com/booking?row=0" });
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

  it("ignores a seller Google keeps hidden", async () => {
    await serveAll(site([etihad!.rawLabel], [BRAVOFLY], { hidden: [ETIHAD] }));
    const stray = await unhandledDuring(async () => {
      expect(await booker({ airlineTimeoutMs: 1_000 })(request, target)).toEqual({ status: "options" });
    }, 1_500);
    expect(stray).toEqual([]);
  });

  it("fails cleanly when the seller click fails, leaving no rejection unhandled", async () => {
    await serveAll(site([etihad!.rawLabel], [ETIHAD, ETIHAD])); // two identical sellers: the click is ambiguous
    const stray = await unhandledDuring(async () => {
      await expect(booker({ airlineTimeoutMs: 1_000 })(request, target)).rejects.toThrow(/strict mode violation/);
    }, 1_500);
    expect(stray).toEqual([]);
  });

  it("says so when Google does not open the airline's site", async () => {
    await serveAll(site([etihad!.rawLabel], [ETIHAD], { opens: "nothing" }));
    await expect(booker({ airlineTimeoutMs: 1_000 })(request, target)).rejects.toThrow("Google did not open the airline's site.");
  });

  it("stops on a block page", async () => {
    await serveAll(() => "<p>Our systems have detected unusual traffic from your computer network.</p>");
    await expect(booker()(request, target)).rejects.toBeInstanceOf(BlockedError);
  });

  it("reports a block page that appears late as a block, not a missing flight", async () => {
    const block = "<p>Our systems have detected unusual traffic from your computer network.</p>";
    await serveAll(() => `<script>setTimeout(() => { document.body.innerHTML = ${JSON.stringify(block)}; }, 300);</script>`);
    await expect(booker({ resultsTimeoutMs: 1_000 })(request, target)).rejects.toBeInstanceOf(BlockedError);
  });
});

describe("airlineSeller", () => {
  it("reads the airline behind Google's seller labels", () => {
    expect(airlineSeller("Continue to book with Etihad airline for 516 euros (Equivalent to 485 Swiss francs on Etihad)", [])).toBe("Etihad");
    expect(airlineSeller("Continue to book with Icelandair, Economy Light for 283 euros", ["Icelandair"])).toBe("Icelandair");
    expect(airlineSeller("Continue to book with Bravofly for 510 euros", ["Etihad"])).toBeNull();
    expect(airlineSeller("Continue to book with lastminute.com for 282 euros", ["Icelandair"])).toBeNull();
    expect(airlineSeller("Continue to book with SWISS for 1,204 euros", ["Swiss"])).toBe("SWISS");
  });
});

