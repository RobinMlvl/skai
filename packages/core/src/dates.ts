const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const toUtc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

export function isValidIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const time = toUtc(iso);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === iso;
}

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Inclusive list of ISO dates; empty when `to` is before `from`. */
export function dateRange(from: string, to: string): string[] {
  const span = daysBetween(from, to);
  return span < 0 ? [] : Array.from({ length: span + 1 }, (_, i) => addDays(from, i));
}

/** Today's date in the machine's local calendar. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The value Google shows in the Departure field, e.g. "Sun, Nov 15". */
export function googleShortDate(iso: string): string {
  const date = new Date(toUtc(iso));
  return `${WEEKDAYS[date.getUTCDay()]}, ${MONTHS_SHORT[date.getUTCMonth()]} ${date.getUTCDate()}`;
}
