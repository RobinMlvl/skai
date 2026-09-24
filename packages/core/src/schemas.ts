import { z } from "zod";
import { daysBetween, isValidIsoDate } from "./dates";

export const MAX_AIRPORTS = 7;
export const MAX_RANGE_DAYS = 31;
export const MAX_PREFERENCE_CHARS = 300;

const Iata = z.string().regex(/^[A-Z]{3}$/, "Use 3-letter airport codes (e.g. GVA)");
const IsoDate = z.string().refine(isValidIsoDate, "Use a valid date (YYYY-MM-DD)");
const isUnique = (codes: string[]) => new Set(codes).size === codes.length;

export const SettingsSchema = z.object({
  maxDurationRatio: z.number().min(1).max(10).default(2),
  maxLayoverMin: z.number().int().min(30).max(1440).default(360),
  minLayoverMin: z.number().int().min(0).max(240).default(45),
  excludeSelfTransfer: z.boolean().default(true),
  excludeAirportChange: z.boolean().default(true),
});
export type Settings = z.output<typeof SettingsSchema>;
export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

const airports = (side: "departure" | "arrival") =>
  z
    .array(Iata)
    .min(1, `Add at least one ${side} airport`)
    .max(MAX_AIRPORTS, `At most ${MAX_AIRPORTS} ${side} airports`)
    .refine(isUnique, `Duplicate ${side} airport`);

/** `today` is injected so validation is deterministic in tests. */
export function makeSearchRequestSchema(today: string) {
  return z
    .object({
      origins: airports("departure"),
      destinations: airports("arrival"),
      dateFrom: IsoDate,
      dateTo: IsoDate,
      settings: SettingsSchema.default(DEFAULT_SETTINGS),
      preference: z
        .string()
        .trim()
        .max(MAX_PREFERENCE_CHARS, `Preferences are limited to ${MAX_PREFERENCE_CHARS} characters`)
        .optional()
        .transform((value) => (value ? value : undefined)),
    })
    .superRefine((request, ctx) => {
      if (request.origins.some((code) => request.destinations.includes(code))) {
        ctx.addIssue({ code: "custom", path: ["destinations"], message: "An airport cannot be both departure and arrival" });
      }
      if (request.dateFrom < today) {
        ctx.addIssue({ code: "custom", path: ["dateFrom"], message: "Start date is in the past" });
      }
      const span = daysBetween(request.dateFrom, request.dateTo);
      if (span < 0) {
        ctx.addIssue({ code: "custom", path: ["dateTo"], message: "End date is before start date" });
      } else if (span + 1 > MAX_RANGE_DAYS) {
        ctx.addIssue({ code: "custom", path: ["dateTo"], message: `Range is limited to ${MAX_RANGE_DAYS} days` });
      }
    });
}

export type SearchRequest = z.output<ReturnType<typeof makeSearchRequestSchema>>;
export type SearchRequestInput = z.input<ReturnType<typeof makeSearchRequestSchema>>;
