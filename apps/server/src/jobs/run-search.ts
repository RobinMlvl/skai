import { analyze, emptyStats, type ProgressEvent, type SearchStats, type SearchStatus } from "@skai/core";
import { BlockedError } from "../browser/page-state";
import type { Jev } from "../jev";
import { judgePreference, pickForJudging } from "../judge/judge";
import type { FlightSource, ProgressSink } from "../sources/flight-source";
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
    const finish = (status: SearchStatus, stats: SearchStats, error: string | null) => {
      deps.store.finish(searchId, status, stats, error);
      emit({ phase: "finished", message: FINISH_MESSAGES[status] });
    };

    deps.store.setStatus(searchId, "running");
    try {
      const result = await deps.source.run(request, emit, signal);
      signal.throwIfAborted(); // a cancel that landed during the last date still ends "cancelled"
      const found = result.dates.flatMap((date) => date.itineraries);
      const stored = deps.store.saveItineraries(searchId, found);
      emit({ phase: "analyzing", message: `Analyzing ${stored.length} flights` });
      const analyzed = analyze(stored, request.settings);

      const warnings: string[] = [];
      if (request.preference) {
        if (!deps.jev) {
          warnings.push("TYPESAFE_API_KEY is not set, so your preferences were not checked.");
        } else if (stored.length > 0) {
          emit({ phase: "judging", message: "Jev is checking your preferences" });
          try {
            const judgments = await judgePreference(deps.jev, request.preference, pickForJudging(analyzed), { signal });
            deps.store.saveJudgments(judgments, deps.now());
          } catch (error) {
            if (signal.aborted) throw error;
            warnings.push("Jev could not check your preferences.");
          }
        }
      }

      const unparsed = result.dates.reduce((sum, date) => sum + date.unparsed.length, 0);
      const labelsRead = found.length + unparsed;
      if (labelsRead > 0 && found.length / labelsRead < MIN_PARSE_COVERAGE) {
        warnings.push("Google may have changed its format: some flights could not be read.");
      }
      const datesMissing = result.dates.filter((date) => date.status === "missing").map((date) => date.date);
      const status: SearchStatus =
        datesMissing.length === result.dates.length ? "failed" : datesMissing.length > 0 ? "partial" : "done";
      finish(
        status,
        {
          datesOk: result.dates.length - datesMissing.length,
          datesMissing,
          labelsRead,
          labelsUnparsed: unparsed,
          jevCalls: jevCalls(),
          durationMs: Date.now() - startedAt,
          warnings,
        },
        status === "failed" ? "No date could be read." : null,
      );
    } catch (error) {
      const stats = { ...emptyStats(), jevCalls: jevCalls(), durationMs: Date.now() - startedAt };
      if (error instanceof BlockedError) {
        finish("blocked", stats, "Google showed a block page. SkAI stopped without retrying; try again later.");
      } else if (signal.aborted) {
        finish("cancelled", stats, null);
      } else {
        finish("failed", stats, error instanceof Error ? error.message : String(error));
      }
    }
  };
}
