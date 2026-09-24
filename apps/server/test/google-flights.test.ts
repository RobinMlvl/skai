import { googleShortDate, type SearchRequest } from "@skai/core";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BlockedError } from "../src/browser/page-state";
import type { BrowserSession } from "../src/browser/session";
import type { ProgressUpdate } from "../src/sources/flight-source";
import { createGoogleFlightsSource } from "../src/sources/google-flights";
import { resultsPage, serve, testSession } from "./browser-helpers";
import { choiceAnswer, fakeJev } from "./fake-jev";
import { FIXTURE, sampleRequest } from "./helpers";

let session: BrowserSession;
let page: Page;
beforeAll(async () => {
  session = testSession();
  page = await session.page();
});
afterAll(() => session.close());

// Tests address pages as https://www.google.com/travel/flights/search?d=<date>
const urlFor = (input: { date: string }) => `https://www.google.com/travel/flights/search?d=${input.date}`;
const dateOf = (url: URL) => url.searchParams.get("d") ?? "";
const request: SearchRequest = sampleRequest({ dateFrom: "2026-11-10", dateTo: "2026-11-11" });

function run(options: Partial<Parameters<typeof createGoogleFlightsSource>[0]> = {}, signal = new AbortController().signal) {
  const updates: ProgressUpdate[] = [];
  const source = createGoogleFlightsSource({ session, jev: null, pauseMs: 0, resultsTimeoutMs: 800, urlFor, ...options });
  return { updates, result: source.run(request, (u) => updates.push(u), signal) };
}

describe("GoogleFlightsSource", () => {
  it("scans every date and parses the results", async () => {
    await serve(page, (url) => resultsPage(googleShortDate(dateOf(url)), FIXTURE.labels));
    const { updates, result } = run();
    const { dates } = await result;
    expect(dates.map((d) => [d.date, d.status, d.itineraries.length, d.unparsed.length])).toEqual([
      ["2026-11-10", "ok", 10, 0],
      ["2026-11-11", "ok", 10, 0],
    ]);
    expect(updates.map((u) => u.phase)).toEqual(["connecting", "sweeping", "sweeping"]);
    expect(updates[2]).toMatchObject({ dateIndex: 2, dateCount: 2 });
  });

  it("stops at once on a block page", async () => {
    await serve(page, "<p>Our systems have detected unusual traffic from your computer network.</p>");
    await expect(run().result).rejects.toBeInstanceOf(BlockedError);
  });

  it("marks a date missing when Google shows another date", async () => {
    await serve(page, (url) =>
      dateOf(url) === "2026-11-11" ? resultsPage("Mon, Jan 4", FIXTURE.labels) : resultsPage(googleShortDate(dateOf(url)), FIXTURE.labels),
    );
    const { dates } = await run().result;
    expect(dates.map((d) => d.status)).toEqual(["ok", "missing"]);
  });

  it("marks a date missing when results never appear and Jev is not configured", async () => {
    await serve(page, "<p>Loading…</p>");
    const { dates } = await run().result;
    expect(dates.every((d) => d.status === "missing")).toBe(true);
  });

  it("lets Jev dismiss an unexpected dialog", async () => {
    const dialog = (date: string) => `<!doctype html><html><body>
      <input aria-label="Departure" value="${googleShortDate(date)}">
      <div id="dialog"><button id="dismiss">No thanks</button></div>
      <ul id="results"></ul>
      <script>
        document.getElementById("dismiss").addEventListener("click", () => {
          document.getElementById("dialog").remove();
          for (const label of ${JSON.stringify(FIXTURE.labels)}) {
            const div = document.createElement("div");
            div.setAttribute("aria-label", label);
            document.getElementById("results").append(div);
          }
        });
      </script></body></html>`;
    await serve(page, (url) => dialog(dateOf(url)));
    const jev = fakeJev((state: { elements: { id: string; name: string }[] }) => {
      const dismiss = state.elements.find((e) => e.name === "No thanks");
      return dismiss
        ? { operation: choiceAnswer("CLICK"), target: choiceAnswer(dismiss.id) }
        : { operation: choiceAnswer("DONE"), target: choiceAnswer("none") };
    });
    const { updates, result } = run({ jev });
    const { dates } = await result;
    expect(dates.map((d) => [d.status, d.itineraries.length])).toEqual([
      ["ok", 10],
      ["ok", 10],
    ]);
    expect(updates.filter((u) => u.phase === "rescuing")).toHaveLength(2);
  });

  it("returns an empty date when Google has no flights", async () => {
    await serve(page, (url) => resultsPage(googleShortDate(dateOf(url)), [], "<p>No results returned.</p>"));
    const { dates } = await run().result;
    expect(dates.map((d) => [d.status, d.itineraries.length])).toEqual([
      ["ok", 0],
      ["ok", 0],
    ]);
  });

  it("stops when the search is cancelled", async () => {
    await serve(page, (url) => resultsPage(googleShortDate(dateOf(url)), FIXTURE.labels));
    const controller = new AbortController();
    controller.abort(new Error("Cancelled by the user"));
    await expect(run({}, controller.signal).result).rejects.toThrow("Cancelled by the user");
  });
});
