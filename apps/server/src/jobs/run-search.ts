import { analyze, emptyStats, type DateOutcome, type ProgressEvent, type SearchStats, type SearchStatus } from "@skai/core";
import { BlockedError } from "../browser/page-state";
import type { Jev } from "../jev";
import { judgePreference, pickForJudging } from "../judge/judge";
import { ScanInterruptedError, type FlightSource, type ProgressSink } from "../sources/flight-source";
import type { SearchStore } from "../store/search-store";
import type { JobRunner } from "./job-queue";
import type { ProgressBus } from "./progress-bus";

export interface RunnerDeps {
  store: SearchStore;
  bus: ProgressBus;
  source: FlightSource;
  jev: Jev | null;
  now: () => string;
}

export const FINISH_MESSAGES: Record<SearchStatus, string> = {
  queued: "Queued",
  running: "Running",
  done: "Scan complete",
  partial: "Scan complete, some dates are missing",
  failed: "Scan failed",
  blocked: "Blocked by Google",
  cancelled: "Scan cancelled",
};
const MIN_PARSE_COVERAGE = 0.8;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createSearchRunner(deps: RunnerDeps): JobRunner {
  return async (searchId, signal) => {
    const detail = deps.store.get(searchId);
    if (!detail) return;
    const request = detail.search.request;
    const startedAt = Date.now();
    const baseCalls = deps.jev?.calls ?? 0;
    const jevCalls = () => (deps.jev?.calls ?? 0) - baseCalls;

    const emit: ProgressSink = (update) => {
      const event: ProgressEvent = { ...update, jevCalls: jevCalls(), at: deps.now() };
      deps.store.setProgress(searchId, event);
      deps.bus.publish(searchId, event);
    };
    deps.store.setStatus(searchId, "running");

    // Whatever stops the scan, the dates already read are kept (Robin, 2026-09-25).
    let dates: DateOutcome[] = [];
    let interruption: unknown = null;
    try {
      dates = (await deps.source.run(request, emit, signal)).dates;
      if (signal.aborted) interruption = signal.reason; // a cancel that landed during the last date
    } catch (error) {
      if (error instanceof ScanInterruptedError) {
        dates = error.dates;
        interruption = error.reason;
      } else {
        interruption = error;
      }
    }
    const cancelled = signal.aborted;
    const blocked = interruption instanceof BlockedError;

    const found = dates.flatMap((date) => date.itineraries);
    const unparsed = dates.reduce((sum, date) => sum + date.unparsed.length, 0);
    const labelsRead = found.length + unparsed;
    const datesMissing = dates.filter((date) => date.status === "missing").map((date) => date.date);
    const warnings: string[] = [];
    let saved = false;
    let status: SearchStatus;
    let error: string | null = null;
    // Whatever fails after the scan (store, analysis), the search still ends and "finished" is sent last.
    try {
      const stored = deps.store.saveItineraries(searchId, found);
      saved = true;
      if (stored.length > 0) {
        emit({ phase: "analyzing", message: `Analyzing ${stored.length} flights` });
        if (request.preference && !cancelled) {
          if (!deps.jev) {
            warnings.push("TYPESAFE_API_KEY is not set, so your preferences were not checked.");
          } else {
            emit({ phase: "judging", message: "Jev is checking your preferences" });
            try {
              const analyzed = analyze(stored, request.settings);
              const judgments = await judgePreference(deps.jev, request.preference, pickForJudging(analyzed), { signal });
              deps.store.saveJudgments(judgments, deps.now());
            } catch {
              if (!signal.aborted) warnings.push("Jev could not check your preferences.");
            }
          }
        }
      }

      if (labelsRead > 0 && found.length / labelsRead < MIN_PARSE_COVERAGE) {
        warnings.push("Google may have changed its format: some flights could not be read.");
      }
      if (blocked) {
        status = "blocked";
        error = "Google showed a block page. SkAI stopped without retrying; try again later.";
      } else if (signal.aborted) {
        status = "cancelled";
      } else if (interruption) {
        status = "failed";
        error = messageOf(interruption);
      } else {
        status = datesMissing.length === dates.length ? "failed" : datesMissing.length > 0 ? "partial" : "done";
        if (status === "failed") error = "No date could be read.";
      }
    } catch (unexpected) {
      status = "failed";
      error = messageOf(unexpected);
    }

    // The dates count as kept only once their flights are saved.
    const kept = saved
      ? { datesOk: dates.length - datesMissing.length, datesMissing, labelsRead, labelsUnparsed: unparsed }
      : emptyStats();
    const stats: SearchStats = { ...kept, jevCalls: jevCalls(), durationMs: Date.now() - startedAt, warnings };
    deps.store.finish(searchId, status, stats, error);
    emit({ phase: "finished", message: FINISH_MESSAGES[status] });
  };
}
