import { makeSearchRequestSchema, parseLabel, type Itinerary, type SearchRequest, type SearchRequestInput } from "@skai/core";
import fixture from "../../../packages/core/fixtures/gva-bkk-2026-11-10.json";

export const FIXTURE = fixture as { capturedAt: string; date: string; labels: string[] };

export const sampleItineraries = (): Itinerary[] => FIXTURE.labels.map((label) => parseLabel(label, FIXTURE.date)!);

export const sampleRequest = (overrides: Partial<SearchRequestInput> = {}): SearchRequest =>
  makeSearchRequestSchema("2026-09-24").parse({
    origins: ["GVA"],
    destinations: ["BKK"],
    dateFrom: "2026-11-10",
    dateTo: "2026-11-11",
    ...overrides,
  });
