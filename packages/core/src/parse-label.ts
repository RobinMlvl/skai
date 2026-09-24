import { daysBetween, MONTHS_LONG } from "./dates";
import type { Itinerary, Layover } from "./types";

/** Regex source matching a Google Flights result aria-label (use with the "s" flag). */
export const RESULT_LABEL_SOURCE = "^From .*Select flight\\s*$";

const MAIN = new RegExp(
  "^From (?<price>[\\d,]+) euros\\. " +
    "(?<bag>This price does not include overhead bin access\\. )?" +
    "(?<stops>Nonstop|\\d+ stops?) flight with (?<airlines>.+?)\\. " +
    "(?:Operated by (?<operated>.+?)\\. )?" +
    "Leaves (?<dep>.+?) at (?<depTime>\\d{1,2}:\\d{2} [AP]M) on (?<depDay>\\w+, \\w+ \\d{1,2}) " +
    "and arrives at (?<arr>.+?) at (?<arrTime>\\d{1,2}:\\d{2} [AP]M) on (?<arrDay>\\w+, \\w+ \\d{1,2})\\. " +
    "Total duration (?<duration>[^.]+)\\.(?<rest>.*?) ?Select flight$",
);
// "… layover at <airport> in <city>." or, when changing airports, "… layover in <city>. Transfer here from <a> to <b>."
const LAYOVER = /^Layover \(\d+ of \d+\) is a (.+?) (overnight )?layover (?:at (.+?) in (.+)|in (.+))$/;
const TRANSFER = /Transfer here from (.+?) to (.+)$/;
// Real wording captured on 2026-09-24.
const AIRPORT_CHANGE = /Transfer here from /;
// Assumed wording: no separate-ticket label captured yet.
const SELF_TRANSFER = /self[- ]transfer|separate tickets/i;
const ABBREVIATION = /\b(?:St|Ste|Mt|Ft)\.$/;

const normalize = (label: string) =>
  label.replace(/\s+/g, " ").replace(/(euros)\.(?=\S)/, "$1. ").trim();

function parseDuration(text: string): number | null {
  const match = /^(?:(\d+) hr)?(?: ?(\d+) min)?$/.exec(text.trim());
  if (!match || (match[1] === undefined && match[2] === undefined)) return null;
  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
}

function to24h(time: string): string {
  const match = /^(\d{1,2}):(\d{2}) ([AP])M$/.exec(time);
  if (!match) return time;
  const hours = (Number(match[1]) % 12) + (match[3] === "P" ? 12 : 0);
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

/** "Wednesday, November 11" in `year` → "YYYY-11-11", or null. */
function isoFor(dayText: string, year: number): string | null {
  const match = /^\w+, (\w+) (\d{1,2})$/.exec(dayText);
  if (!match) return null;
  const month = MONTHS_LONG.indexOf(match[1] as (typeof MONTHS_LONG)[number]);
  if (month < 0) return null;
  return `${year}-${String(month + 1).padStart(2, "0")}-${match[2]!.padStart(2, "0")}`;
}

/** "Paris." → "Paris"; "St. Louis." → "St. Louis"; "Paris. Change of airport." → "Paris". */
function firstSentence(text: string): string {
  let from = 0;
  for (;;) {
    const dot = text.indexOf(".", from);
    if (dot === -1) return text.trim();
    if (!ABBREVIATION.test(text.slice(0, dot + 1))) return text.slice(0, dot).trim();
    from = dot + 1;
  }
}

function parseLayovers(rest: string): Layover[] | null {
  const layovers: Layover[] = [];
  const chunks = rest
    .split(/(?=Layover \(\d+ of \d+\))/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith("Layover ("));
  for (const chunk of chunks) {
    const match = LAYOVER.exec(chunk);
    if (!match) return null;
    const durationMin = parseDuration(match[1]!);
    if (durationMin === null) return null;
    const city = firstSentence(match[4] ?? match[5]!);
    const transfer = TRANSFER.exec(chunk);
    const airport = transfer ? `${transfer[1]} → ${firstSentence(transfer[2]!)}` : (match[3] ?? city);
    layovers.push({ durationMin, airport, city, overnight: Boolean(match[2]) });
  }
  return layovers;
}

export function parseLabel(label: string, date: string): Itinerary | null {
  const text = normalize(label);
  const g = MAIN.exec(text)?.groups;
  if (!g) return null;

  const durationMin = parseDuration(g.duration!);
  const layovers = parseLayovers(g.rest ?? "");
  const stops = g.stops === "Nonstop" ? 0 : Number.parseInt(g.stops!, 10);
  if (durationMin === null || layovers === null || layovers.length !== stops) return null;

  // Google's departure day is the searched date; only the arrival can fall in another year.
  const year = Number(date.slice(0, 4));
  const departureIso = isoFor(g.depDay!, year);
  let arrivalIso = isoFor(g.arrDay!, year);
  if (!departureIso || !arrivalIso) return null;
  // Dec 31 → Jan 1 lands next year; Jan 1 → Dec 31 (date line, eastbound) lands the previous year.
  const offset = daysBetween(departureIso, arrivalIso);
  if (offset < -300) arrivalIso = isoFor(g.arrDay!, year + 1)!;
  else if (offset > 300) arrivalIso = isoFor(g.arrDay!, year - 1)!;

  return {
    date,
    priceEur: Number(g.price!.replace(/,/g, "")),
    airlines: g.airlines!.split(/, and |, | and /),
    operatedBy: g.operated ?? null,
    departure: { airport: g.dep!, time: to24h(g.depTime!) },
    arrival: { airport: g.arr!, time: to24h(g.arrTime!), dayOffset: daysBetween(departureIso, arrivalIso) },
    durationMin,
    stops,
    layovers,
    flags: {
      bagNotIncluded: Boolean(g.bag),
      selfTransfer: SELF_TRANSFER.test(text),
      airportChange: AIRPORT_CHANGE.test(text),
    },
    rawLabel: text,
  };
}

export function parseLabels(labels: readonly string[], date: string): { itineraries: Itinerary[]; unparsed: string[] } {
  const itineraries: Itinerary[] = [];
  const unparsed: string[] = [];
  for (const label of new Set(labels.map(normalize))) {
    const itinerary = parseLabel(label, date);
    if (itinerary) itineraries.push(itinerary);
    else unparsed.push(label);
  }
  return { itineraries, unparsed };
}
