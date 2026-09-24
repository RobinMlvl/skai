import type { DateOutcome, ProgressEvent, SearchRequest } from "@skai/core";

export type ProgressUpdate = Omit<ProgressEvent, "jevCalls" | "at">;
export type ProgressSink = (update: ProgressUpdate) => void;

export interface SourceResult {
  dates: DateOutcome[];
}

/** Where flights come from. Google Flights today; an API such as Duffel if SkAI is ever hosted. */
export interface FlightSource {
  run(request: SearchRequest, progress: ProgressSink, signal: AbortSignal): Promise<SourceResult>;
}
