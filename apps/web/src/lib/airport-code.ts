import { airportByIata } from "../airports/search";

const IGNORED = new Set(["airport", "international"]);

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const words = (text: string) =>
  fold(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !IGNORED.has(word));

/**
 * The candidate IATA code whose OurAirports record best matches Google's airport `name`.
 * Score = words shared between `name` and the record's name + city (diacritics/case folded,
 * "airport"/"international" ignored). Null when no candidate shares a word.
 */
export function codeFor(name: string, candidates: readonly string[]): string | null {
  const nameWords = new Set(words(name));
  let best: { code: string; score: number } | null = null;
  for (const code of candidates) {
    const record = airportByIata(code);
    if (!record) continue;
    const recordWords = new Set([...words(record.name), ...words(record.city)]);
    let score = 0;
    for (const word of nameWords) if (recordWords.has(word)) score++;
    if (score > 0 && (!best || score > best.score)) best = { code, score };
  }
  return best?.code ?? null;
}
