import { formatDuration, formatPrice, type AnalyzedItinerary } from "@skai/core";
import { niceTicks, paddedDomain } from "../lib/chart-scale";

const W = 640;
const H = 300;
const PAD = { left: 56, right: 16, top: 16, bottom: 40 };

export function ResultsChart({ items }: { items: AnalyzedItinerary[] }) {
  const shown = items.filter((row) => !row.excluded);
  if (shown.length === 0) return null;
  const hours = shown.map((row) => row.item.durationMin / 60);
  const prices = shown.map((row) => row.item.priceEur);
  const [x0, x1] = paddedDomain(Math.min(...hours), Math.max(...hours));
  const [y0, y1] = paddedDomain(Math.min(...prices), Math.max(...prices));
  const x = (h: number) => PAD.left + ((h - x0) / (x1 - x0 || 1)) * (W - PAD.left - PAD.right);
  const y = (p: number) => H - PAD.bottom - ((p - y0) / (y1 - y0 || 1)) * (H - PAD.top - PAD.bottom);
  const frontier = shown.filter((row) => row.onFrontier);
  const path = frontier
    .map((row, i) => `${i ? "L" : "M"}${x(row.item.durationMin / 60)},${y(row.item.priceEur)}`)
    .join(" ");

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Price versus travel time for every flight found">
        {niceTicks(x0, x1, 5).map((t) => (
          <g key={`x${t}`}>
            <line className="grid" x1={x(t)} x2={x(t)} y1={PAD.top} y2={H - PAD.bottom} />
            <text className="tick" x={x(t)} y={H - PAD.bottom + 16} textAnchor="middle">{`${t}h`}</text>
          </g>
        ))}
        {niceTicks(y0, y1, 4).map((t) => (
          <g key={`y${t}`}>
            <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="tick" x={PAD.left - 8} y={y(t) + 3} textAnchor="end">{`€${t}`}</text>
          </g>
        ))}
        <path className="frontier-line" d={path} />
        {shown.map((row) => (
          <circle
            key={row.item.id}
            className={row.onFrontier ? "pt frontier" : row.traps.length ? "pt trapped" : "pt"}
            cx={x(row.item.durationMin / 60)}
            cy={y(row.item.priceEur)}
            r={row.onFrontier ? 5 : 3.5}
          >
            <title>{`${formatPrice(row.item.priceEur)} · ${formatDuration(row.item.durationMin)} · ${row.item.airlines.join(", ")} · ${row.item.date}`}</title>
          </circle>
        ))}
        <text className="axis-label" x={W - PAD.right} y={H - 6} textAnchor="end">
          travel time
        </text>
      </svg>
      <figcaption className="muted small">
        Highlighted: the best trade-offs. No other flight is both cheaper and faster. Red rings are trapped flights.
      </figcaption>
    </figure>
  );
}
