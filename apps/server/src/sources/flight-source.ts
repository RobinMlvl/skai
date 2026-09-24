import type { DateOutcome, ProgressEvent, SearchRequest } from "@skai/core";

export type ProgressUpdate = Omit<ProgressEvent, "jevCalls" | "at">;
export type ProgressSink = (update: ProgressUpdate) => void;

export interface SourceResult {
  dates: DateOutcome[];
}

/** A scan stopped early (block page, cancel, unexpected error): carries the dates read so far. */
export class ScanInterruptedError extends Error {
  constructor(
    readonly reason: unknown,
    readonly dates: DateOutcome[],
  ) {
    super(reason instanceof Error ? reason.message : String(reason));
    this.name = "ScanInterruptedError";
  }
}

/** Where flights come from. Google Flights today; an API such as Duffel if SkAI is ever hosted. */
export interface FlightSource {
  run(request: SearchRequest, progress: ProgressSink, signal: AbortSignal): Promise<SourceResult>;
}
