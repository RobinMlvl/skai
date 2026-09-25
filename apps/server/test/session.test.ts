import { afterAll, beforeAll, expect, it } from "vitest";
import type { BrowserSession } from "../src/browser/session";
import { testSession } from "./browser-helpers";

let session: BrowserSession;
beforeAll(() => {
  session = testSession();
});
afterAll(() => session.close());

it("scans in its own tab, never in a booking tab", async () => {
  const scan = await session.page();
  expect(await session.page()).toBe(scan);
  const booking = await session.newPage();
  expect(await session.page()).toBe(scan);

  await scan.close(); // the user closed the scan tab: the booking tab is now the first one
  const next = await session.page();
  expect(next).not.toBe(booking);
  expect(next.isClosed()).toBe(false);
  expect(await session.page()).toBe(next);
});
