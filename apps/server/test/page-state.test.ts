import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BrowserSession } from "../src/browser/session";
import {
  assertNotBlocked,
  BlockedError,
  expandMoreFlights,
  handleConsent,
  readDepartureValue,
  readResultLabels,
  waitForResults,
  waitForStableResults,
} from "../src/browser/page-state";
import { resultsPage, serve, testSession } from "./browser-helpers";
import { FIXTURE } from "./helpers";

let session: BrowserSession;
let page: Page;
beforeAll(async () => {
  session = testSession();
  page = await session.page();
});
afterAll(() => session.close());

describe("consent", () => {
  it("rejects all and lands back on Google Flights", async () => {
    await serve(page, (url) =>
      url.hostname === "consent.google.com"
        ? `<button onclick="location.href='https://www.google.com/travel/flights/search?ok=1'">Accept all</button>
           <button onclick="location.href='https://www.google.com/travel/flights/search?ok=1'">Reject all</button>`
        : resultsPage("Tue, Nov 10", []),
    );
    await page.goto("https://consent.google.com/m?continue=x");
    await handleConsent(page);
    expect(new URL(page.url()).hostname).toBe("www.google.com");
  });

  it("survives Google's redirect chain after Reject all (an aborted intermediate navigation)", async () => {
    await serve(page, (url) => {
      if (url.hostname === "consent.google.com" && url.pathname === "/save") {
        return `<script>location.replace("https://www.google.com/travel/flights/search?ok=2")</script>`;
      }
      if (url.hostname === "consent.google.com") {
        return `<button id="reject">Reject all</button>
          <script>
            document.getElementById("reject").addEventListener("click", () => {
              location.href = "https://consent.google.com/save?step=1";
              location.href = "https://consent.google.com/save?step=2";
            });
          </script>`;
      }
      return resultsPage("Tue, Nov 10", FIXTURE.labels);
    });
    await page.goto("https://consent.google.com/m?continue=y");
    await handleConsent(page);
    expect(new URL(page.url()).hostname).toBe("www.google.com");
    expect(await waitForResults(page, 5_000)).toBe("results");
  });

  it("does nothing outside the consent screen", async () => {
    await serve(page, resultsPage("Tue, Nov 10", []));
    await page.goto("https://www.google.com/travel/flights/search?x=1");
    await expect(handleConsent(page)).resolves.toBeUndefined();
  });
});

describe("block detection", () => {
  it("detects the /sorry/ page and the unusual-traffic message", async () => {
    await serve(page, "<p>blocked</p>");
    await page.goto("https://www.google.com/sorry/index?continue=x");
    await expect(assertNotBlocked(page)).rejects.toBeInstanceOf(BlockedError);

    await serve(page, "<p>Our systems have detected unusual traffic from your computer network.</p>");
    await page.goto("https://www.google.com/travel/flights/search?x=2");
    await expect(assertNotBlocked(page)).rejects.toBeInstanceOf(BlockedError);
  });

  it("accepts a normal results page", async () => {
    await serve(page, resultsPage("Tue, Nov 10", FIXTURE.labels));
    await page.goto("https://www.google.com/travel/flights/search?x=3");
    await expect(assertNotBlocked(page)).resolves.toBeUndefined();
  });
});

describe("results", () => {
  it("waits for results and reads labels and the departure date", async () => {
    await serve(page, resultsPage("Tue, Nov 10", FIXTURE.labels));
    await page.goto("https://www.google.com/travel/flights/search?x=4");
    expect(await waitForResults(page, 5_000)).toBe("results");
    expect(await readResultLabels(page)).toHaveLength(FIXTURE.labels.length);
    expect(await readDepartureValue(page)).toBe("Tue, Nov 10");
  });

  it("recognises an empty result and a timeout", async () => {
    await serve(page, "<p>No results returned.</p>");
    await page.goto("https://www.google.com/travel/flights/search?x=5");
    expect(await waitForResults(page, 5_000)).toBe("empty");

    await serve(page, "<p>Loading…</p>");
    await page.goto("https://www.google.com/travel/flights/search?x=6");
    expect(await waitForResults(page, 600)).toBe("timeout");
  });

  it("waits until Google stops adding flights to the list", async () => {
    const progressive = `<script>
      const labels = ${JSON.stringify(FIXTURE.labels)};
      let i = 1;
      const timer = setInterval(() => {
        if (i >= labels.length) return clearInterval(timer);
        const div = document.createElement("div");
        div.setAttribute("aria-label", labels[i++]);
        document.getElementById("results").append(div);
      }, 300);
    </script>`;
    await serve(page, resultsPage("Tue, Nov 10", [FIXTURE.labels[0]!], progressive));
    await page.goto("https://www.google.com/travel/flights/search?x=9");
    expect(await waitForResults(page, 5_000)).toBe("results");
    expect(await waitForStableResults(page)).toBe(FIXTURE.labels.length);
    expect(await readResultLabels(page)).toHaveLength(FIXTURE.labels.length);
  });

  it("expands more flights when the button exists", async () => {
    const [first, second] = FIXTURE.labels;
    const more = `<button id="more">View more flights</button>
      <script>
        document.getElementById("more").addEventListener("click", () => {
          const div = document.createElement("div");
          div.setAttribute("aria-label", ${JSON.stringify(second)});
          const li = document.createElement("li");
          li.append(div);
          document.getElementById("results").append(li);
        });
      </script>`;
    await serve(page, resultsPage("Tue, Nov 10", [first!], more));
    await page.goto("https://www.google.com/travel/flights/search?x=7");
    expect(await expandMoreFlights(page)).toBe(true);
    expect(await readResultLabels(page)).toHaveLength(2);

    await serve(page, resultsPage("Tue, Nov 10", [first!]));
    await page.goto("https://www.google.com/travel/flights/search?x=8");
    expect(await expandMoreFlights(page)).toBe(false);
  });
});
