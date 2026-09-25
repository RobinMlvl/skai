import { airportByIata } from "../airports/search";

const IGNORED = new Set(["airport", "international"]);

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const words = (text: string) =>
  fold(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !IGNORED.has(word));

/**
 * The candidate IATA code whose OurAirports record best matches Google's airport `name`.
 * Each word of `name` (diacritics/case folded, "airport"/"international" ignored) scores 2 when the
 * record's name has it, 1 when only its city has it, and -2 when neither does: a word the record
 * lacks ("Bergamo" against Malpensa) counts against it. Null unless a single candidate has the best
 * score and it is positive: the row then shows Google's name rather than a code that may be wrong.
 */
export function codeFor(name: string, candidates: readonly string[]): string | null {
  const nameWords = new Set(words(name));
  let best: string | null = null;
  let bestScore = 0;
  let tied = false;
  for (const code of candidates) {
    const record = airportByIata(code);
    if (!record) continue;
    const recordName = new Set(words(record.name));
    const recordCity = new Set(words(record.city));
    let score = 0;
    for (const word of nameWords) score += recordName.has(word) ? 2 : recordCity.has(word) ? 1 : -2;
    if (score > bestScore) {
      [best, bestScore, tied] = [code, score, false];
    } else if (score === bestScore && best) {
      tied = true;
    }
  }
  return tied ? null : best;
}
