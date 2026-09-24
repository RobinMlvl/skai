import data from "./airports.json";

export interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
}

export const AIRPORTS = data as Airport[];
const BY_IATA = new Map(AIRPORTS.map((airport) => [airport.iata, airport]));

export const airportByIata = (code: string) => BY_IATA.get(code);

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function searchAirports(query: string, limit = 8): Airport[] {
  const q = fold(query.trim());
  if (!q) return [];
  const scored: [number, Airport][] = [];
  for (const airport of AIRPORTS) {
    const code = airport.iata.toLowerCase();
    const city = fold(airport.city);
    const name = fold(airport.name);
    const score =
      code === q ? 0 : code.startsWith(q) ? 1 : city.startsWith(q) ? 2 : name.startsWith(q) ? 3 : city.includes(q) || name.includes(q) ? 4 : -1;
    if (score >= 0) scored.push([score, airport]);
  }
  return scored
    .sort((a, b) => a[0] - b[0] || a[1].city.localeCompare(b[1].city))
    .slice(0, limit)
    .map(([, airport]) => airport);
}
