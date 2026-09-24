import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { dateRange, googleShortDate, parseLabels, searchUrl, type DateOutcome, type SearchRequest, type TfsInput } from "@skai/core";
import type { Page } from "playwright";
import { rescue } from "../agent/rescue";
import {
  assertNotBlocked,
  BlockedError,
  expandMoreFlights,
  handleConsent,
  readDepartureValue,
  readResultLabels,
  waitForResults,
} from "../browser/page-state";
import type { BrowserSession } from "../browser/session";
import type { Jev } from "../jev";
import type { FlightSource, ProgressSink, SourceResult } from "./flight-source";

export interface GoogleFlightsOptions {
  session: BrowserSession;
  jev: Jev | null;
  pauseMs?: number;
  resultsTimeoutMs?: number;
  debugDir?: string | null;
  urlFor?: (input: TfsInput) => string;
}

class DateFailedError extends Error {}

type Position = { dateIndex: number; dateCount: number };

export function createGoogleFlightsSource(options: GoogleFlightsOptions): FlightSource {
  const pauseMs = options.pauseMs ?? 2_000;
  const resultsTimeoutMs = options.resultsTimeoutMs ?? 20_000;
  const urlFor = options.urlFor ?? searchUrl;

  async function readDate(
    page: Page,
    request: SearchRequest,
    date: string,
    position: Position,
    progress: ProgressSink,
    signal: AbortSignal,
  ): Promise<DateOutcome> {
    await page.goto(urlFor({ date, origins: request.origins, destinations: request.destinations }), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await handleConsent(page);
    await assertNotBlocked(page);

    let state = await waitForResults(page, resultsTimeoutMs);
    if (state === "timeout") {
      await assertNotBlocked(page);
      if (!options.jev) throw new DateFailedError("Results did not appear");
      progress({ phase: "rescuing", message: `Jev is looking for the ${date} results`, ...position });
      const { outcome } = await rescue(page, options.jev, {
        goal: `Show the list of one-way flight results for ${googleShortDate(date)}. Close any dialog or banner that hides it.`,
        signal,
      });
      await assertNotBlocked(page);
      if (outcome === "blocked") throw new DateFailedError("Jev could not reach the results");
      state = await waitForResults(page, 10_000);
      if (state === "timeout") throw new DateFailedError("Results did not appear after the rescue");
    }

    const shown = await readDepartureValue(page);
    if (shown !== googleShortDate(date)) {
      throw new DateFailedError(`Google shows ${shown ?? "no date"} instead of ${googleShortDate(date)}`);
    }
    if (state === "empty") return { date, status: "ok", itineraries: [], unparsed: [] };

    await expandMoreFlights(page);
    const { itineraries, unparsed } = parseLabels(await readResultLabels(page), date);
    return { date, status: "ok", itineraries, unparsed };
  }

  async function saveDebug(page: Page, date: string) {
    if (!options.debugDir) return;
    mkdirSync(options.debugDir, { recursive: true });
    await page
      .screenshot({ path: join(options.debugDir, `${date}-${Date.now()}.png`), fullPage: true })
      .catch(() => undefined);
  }

  return {
    async run(request, progress, signal): Promise<SourceResult> {
      signal.throwIfAborted();
      const dates = dateRange(request.dateFrom, request.dateTo);
      progress({ phase: "connecting", message: "Opening Chrome" });
      const page = await options.session.page();
      const outcomes: DateOutcome[] = [];

      for (const [index, date] of dates.entries()) {
        signal.throwIfAborted();
        const position = { dateIndex: index + 1, dateCount: dates.length };
        progress({ phase: "sweeping", message: `Scanning ${date}`, ...position });

        let outcome: DateOutcome | null = null;
        for (let attempt = 1; attempt <= 2 && !outcome; attempt++) {
          try {
            outcome = await readDate(page, request, date, position, progress, signal);
          } catch (error) {
            if (error instanceof BlockedError || signal.aborted) throw error;
            if (attempt === 2) {
              console.warn(`[skai] ${date} missing: ${error instanceof Error ? error.message : String(error)}`);
              await saveDebug(page, date);
              outcome = { date, status: "missing", itineraries: [], unparsed: [] };
            }
          }
        }
        outcomes.push(outcome!);
        if (index < dates.length - 1 && pauseMs > 0) await sleep(pauseMs, undefined, { signal });
      }
      return { dates: outcomes };
    },
  };
}
