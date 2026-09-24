// Regenerate with: npm run airports -w @skai/web
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const TYPE_RANK: Record<string, number> = { large_airport: 0, medium_airport: 1 };

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`Download failed: ${response.status}`);
const [header, ...rows] = parseCsv(await response.text());
const col = (name: string) => {
  const index = header!.indexOf(name);
  if (index < 0) throw new Error(`Missing column ${name}`);
  return index;
};
const [type, name, lat, lon, country, city, scheduled, iata] = [
  "type", "name", "latitude_deg", "longitude_deg", "iso_country", "municipality", "scheduled_service", "iata_code",
].map(col) as [number, number, number, number, number, number, number, number];

const best = new Map<string, { rank: number; airport: object }>();
for (const r of rows) {
  const rank = TYPE_RANK[r[type] ?? ""];
  const code = r[iata] ?? "";
  if (rank === undefined || r[scheduled] !== "yes" || !/^[A-Z]{3}$/.test(code)) continue;
  const previous = best.get(code);
  if (previous && previous.rank <= rank) continue;
  best.set(code, {
    rank,
    airport: {
      iata: code,
      name: r[name] ?? "",
      city: r[city] || (r[name] ?? ""),
      country: r[country] ?? "",
      lat: Math.round(Number(r[lat]) * 10_000) / 10_000,
      lon: Math.round(Number(r[lon]) * 10_000) / 10_000,
    },
  });
}

const airports = [...best.keys()].sort().map((code) => best.get(code)!.airport);
writeFileSync(join(import.meta.dirname, "..", "src", "airports", "airports.json"), JSON.stringify(airports));
console.log(`${airports.length} airports written`);
