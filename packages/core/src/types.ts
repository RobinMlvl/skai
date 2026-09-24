import type { SearchRequest } from "./schemas";

export interface Layover {
  durationMin: number;
  /** Where the layover happens; "A → B" when Google says to transfer between two airports. */
  airport: string;
  city: string;
  overnight: boolean;
}

export interface Itinerary {
  date: string;
  priceEur: number;
  airlines: string[];
  operatedBy: string | null;
  departure: { airport: string; time: string };
  arrival: { airport: string; time: string; dayOffset: number };
  durationMin: number;
  stops: number;
  layovers: Layover[];
  flags: { bagNotIncluded: boolean; selfTransfer: boolean; airportChange: boolean };
  rawLabel: string;
}

export interface StoredItinerary extends Itinerary {
  id: string;
}

export type SearchStatus = "queued" | "running" | "done" | "partial" | "failed" | "blocked" | "cancelled";
export const TERMINAL_STATUSES: readonly SearchStatus[] = ["done", "partial", "failed", "blocked", "cancelled"];
export const isTerminal = (status: SearchStatus) => TERMINAL_STATUSES.includes(status);

export type Phase = "queued" | "connecting" | "sweeping" | "rescuing" | "analyzing" | "judging" | "finished";

export interface ProgressEvent {
  phase: Phase;
  message: string;
  dateIndex?: number;
  dateCount?: number;
  jevCalls: number;
  at: string;
}

export interface DateOutcome {
  date: string;
  status: "ok" | "missing";
  itineraries: Itinerary[];
  unparsed: string[];
}

export interface SearchStats {
  datesOk: number;
  datesMissing: string[];
  labelsRead: number;
  labelsUnparsed: number;
  jevCalls: number;
  durationMs: number;
  warnings: string[];
}

export const emptyStats = (): SearchStats => ({
  datesOk: 0,
  datesMissing: [],
  labelsRead: 0,
  labelsUnparsed: 0,
  jevCalls: 0,
  durationMs: 0,
  warnings: [],
});

export interface SearchRecord {
  id: string;
  createdAt: string;
  request: SearchRequest;
  status: SearchStatus;
  phase: Phase;
  progress: ProgressEvent | null;
  stats: SearchStats | null;
  error: string | null;
}

export interface Judgment {
  itineraryId: string;
  preference: string;
  probability: number;
}

export interface SearchDetail {
  search: SearchRecord;
  itineraries: StoredItinerary[];
  judgments: Judgment[];
}
