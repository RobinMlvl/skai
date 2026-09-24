import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rescue } from "../src/agent/rescue";
import { FORBIDDEN_TARGET, takeSnapshot } from "../src/agent/snapshot";
import { readResultLabels } from "../src/browser/page-state";
import type { BrowserSession } from "../src/browser/session";
import { escapeAttr, serve, testSession } from "./browser-helpers";
import { choiceAnswer, fakeJev } from "./fake-jev";
import { FIXTURE } from "./helpers";

type RescueState = { elements: { id: string; name: string }[] };
const idOf = (state: RescueState, name: string) => state.elements.find((e) => e.name === name)?.id ?? "none";
const decide = (operation: string, target = "none") => ({
  operation: choiceAnswer(operation),
  target: choiceAnswer(target),
});

// A dialog hides the results; "No thanks" removes it and inserts one real result label.
const dialogPage = `<!doctype html><html><body>
  <input aria-label="Departure" value="Tue, Nov 10">
  <div role="dialog" id="dialog">
    <p>Stay in the loop?</p>
    <button id="dismiss">No thanks</button>
    <button>Sign in</button>
    <button>Accept all</button>
    <button>Select flight</button>
  </div>
  <ul id="results"></ul>
  <script>
    window.clicks = 0;
    document.getElementById("dismiss").addEventListener("click", () => {
      window.clicks += 1;
      document.getElementById("dialog").remove();
      const div = document.createElement("div");
      div.setAttribute("aria-label", ${JSON.stringify(FIXTURE.labels[0])});
      document.getElementById("results").append(div);
    });
  </script>
</body></html>`;

// A real result row: Google renders it as a link whose label ends with "Select flight", far past 120 chars.
const flightRowPage = `<!doctype html><html><body>
  <button id="dismiss">No thanks</button>
  <div role="link" id="row" aria-label="${escapeAttr(FIXTURE.labels[0]!)}">flight</div>
  <script>
    window.picked = 0;
    document.getElementById("row").addEventListener("click", () => { window.picked += 1; });
  </script>
</body></html>`;

let session: BrowserSession;
let page: Page;
beforeAll(async () => {
  session = testSession();
  page = await session.page();
});
afterAll(() => session.close());

async function openDialogPage() {
  await serve(page, dialogPage);
  await page.goto("https://www.google.com/travel/flights/search?rescue=1");
}

describe("takeSnapshot", () => {
  it("lists visible, enabled, named elements with stable ids", async () => {
    await serve(
      page,
      `<button>Hello</button><button style="display:none">Hidden</button><button disabled>Nope</button>
       <a href="/docs">Docs</a><input aria-label="Where from?" value="GVA">`,
    );
    await page.goto("https://www.google.com/travel/flights?snap=1");
    const first = await takeSnapshot(page);
    expect(first.elements).toEqual([
      { id: "e1", role: "button", name: "Hello", value: null },
      { id: "e2", role: "a", name: "Docs", value: null },
      { id: "e3", role: "input", name: "Where from?", value: "GVA" },
    ]);
    expect((await takeSnapshot(page)).fingerprint).toBe(first.fingerprint);
    await page.evaluate(() => document.body.insertAdjacentHTML("beforeend", "<button>New</button>"));
    expect((await takeSnapshot(page)).fingerprint).not.toBe(first.fingerprint);
  });

  it("skips an element whose full name is forbidden, even past the displayed 120 chars", async () => {
    await serve(page, flightRowPage);
    await page.goto("https://www.google.com/travel/flights?snap=2");
    const snapshot = await takeSnapshot(page);
    expect(snapshot.elements).toEqual([{ id: "e1", role: "button", name: "No thanks", value: null }]);
    expect(await page.locator("#row[data-skai-id]").count()).toBe(0);
  });

  it("forbids consent variants that accept tracking, but not Reject all", () => {
    for (const name of ["Accept all", "Accept", "I agree", "Allow all cookies"]) expect(FORBIDDEN_TARGET.test(name)).toBe(true);
    expect(FORBIDDEN_TARGET.test("Reject all")).toBe(false);
  });
});

describe("rescue", () => {
  it("dismisses the dialog, then reports done, without ever offering forbidden elements", async () => {
    await openDialogPage();
    const offered: string[] = [];
    const jev = fakeJev((state: RescueState) => {
      offered.push(...state.elements.map((e) => e.name));
      const dismiss = idOf(state, "No thanks");
      return dismiss === "none" ? decide("DONE") : decide("CLICK", dismiss);
    });
    const result = await rescue(page, jev, { goal: "Show the results" });
    expect(result.outcome).toBe("done");
    expect(result.steps.map((s) => [s.operation, s.targetName])).toEqual([
      ["CLICK", "No thanks"],
      ["DONE", null],
    ]);
    expect(await readResultLabels(page)).toHaveLength(1);
    expect(offered.filter((name) => FORBIDDEN_TARGET.test(name))).toEqual([]);
    expect(offered).toContain("No thanks");
  });

  it("never offers or clicks a flight row whose label is longer than the displayed name", async () => {
    await serve(page, flightRowPage);
    await page.goto("https://www.google.com/travel/flights/search?rescue=2");
    const offered: string[] = [];
    // A careless Jev: it clicks anything that looks like a flight.
    const jev = fakeJev((state: RescueState) => {
      offered.push(...state.elements.map((e) => e.name));
      const flight = state.elements.find((e) => e.name.startsWith("From "));
      return flight ? decide("CLICK", flight.id) : decide("DONE");
    });
    await rescue(page, jev, { goal: "Show the results", maxSteps: 2 });
    expect(await page.evaluate(() => (window as unknown as { picked: number }).picked)).toBe(0);
    expect(jev.calls).toBeGreaterThan(0);
    expect(offered).toEqual(["No thanks"]);
  });

  it("stops after maxSteps when Jev keeps waiting", async () => {
    await openDialogPage();
    const jev = fakeJev(() => decide("WAIT"));
    const result = await rescue(page, jev, { goal: "Show the results", maxSteps: 2 });
    expect(result.outcome).toBe("exhausted");
    expect(jev.calls).toBe(2);
  });

  it("returns blocked when Jev sees no safe way forward", async () => {
    await openDialogPage();
    const result = await rescue(page, fakeJev(() => decide("BLOCKED")), { goal: "Show the results" });
    expect(result.outcome).toBe("blocked");
  });

  it("stops as blocked once a click leaves www.google.com", async () => {
    await serve(page, (url) =>
      url.hostname === "www.google.com"
        ? `<a href="https://partner.example.test/deal">Cheap deals</a>`
        : `<button>Show flights</button>`,
    );
    await page.goto("https://www.google.com/travel/flights/search?rescue=3");
    // Jev clicks whatever it is offered first.
    const jev = fakeJev((state: RescueState) => decide("CLICK", state.elements[0]?.id ?? "none"));
    const result = await rescue(page, jev, { goal: "Show the results" });
    expect(new URL(page.url()).hostname).toBe("partner.example.test");
    expect(result.outcome).toBe("blocked");
    expect(jev.calls).toBe(1);
  });

  it("does not click when the page changed while Jev was deciding", async () => {
    await openDialogPage();
    const jev = fakeJev(async (state: RescueState, _questions, call) => {
      if (call > 1) return decide("DONE");
      await page.evaluate(() => document.body.insertAdjacentHTML("beforeend", "<button>Surprise</button>"));
      return decide("CLICK", idOf(state, "No thanks"));
    });
    const result = await rescue(page, jev, { goal: "Show the results" });
    expect(result.outcome).toBe("done");
    expect(await page.evaluate(() => (window as unknown as { clicks: number }).clicks)).toBe(0);
  });
});
