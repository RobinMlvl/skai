import { addDays, daysBetween } from "@skai/core";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const toUtc = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** e.g. "Sun 15 Nov" (UTC, English short names). */
export function formatDay(iso: string): string {
  const date = toUtc(iso);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()]}`;
}

/** iso ± days, with `from` clamped so it never lands before `today`. */
export function aroundDate(iso: string, days: number, today: string): { from: string; to: string } {
  const from = addDays(iso, -days);
  return { from: from < today ? today : from, to: addDays(iso, days) };
}

/** The next Friday strictly after `today`, through that Friday's Sunday. */
export function nextWeekend(today: string): { from: string; to: string } {
  const dayOfWeek = toUtc(today).getUTCDay(); // 0 = Sun, ... 5 = Fri, 6 = Sat
  const daysUntilFriday = ((5 - dayOfWeek + 7) % 7) || 7; // strictly after today, never 0
  const from = addDays(today, daysUntilFriday);
  return { from, to: addDays(from, 2) };
}

/** Tomorrow through today + 14. */
export function nextTwoWeeks(today: string): { from: string; to: string } {
  return { from: addDays(today, 1), to: addDays(today, 14) };
}

/** Number of dates in the inclusive range, 0 when `to` is before `from`. */
export function rangeLength(from: string, to: string): number {
  const span = daysBetween(from, to);
  return span < 0 ? 0 : span + 1;
}
