import { formatDuration, formatPrice, type AnalyzedItinerary } from "@skai/core";

interface Props {
  rows: AnalyzedItinerary[];
  /** Rows hidden by the "Show trapped flights" toggle; the fact is left out when 0. */
  trapsHidden: number;
  onHighlight(itineraryId: string): void;
}

/** One line of facts above the results: best price, fastest trip, totals. */
export function Summary({ rows, trapsHidden, onHighlight }: Props) {
  const active = rows.filter((row) => !row.excluded);
  if (active.length === 0) return null;

  const best = rows.find((row) => row.onFrontier)!;
  const fastest = active.reduce((min, row) => (row.item.durationMin < min.item.durationMin ? row : min), active[0]!);
  const dateCount = new Set(rows.map((row) => row.item.date)).size;

  return (
    <div className="summary panel">
      <button type="button" className="summary-fact link" onClick={() => onHighlight(best.item.id)}>
        <span className="muted">Best</span>{" "}
        <span className="mono">
          {formatPrice(best.item.priceEur)} · {formatDuration(best.item.durationMin)}
        </span>
      </button>
      <button type="button" className="summary-fact link" onClick={() => onHighlight(fastest.item.id)}>
        <span className="muted">Fastest</span>{" "}
        <span className="mono">
          {formatPrice(fastest.item.priceEur)} · {formatDuration(fastest.item.durationMin)}
        </span>
        {fastest.item.stops === 0 && <span className="muted"> nonstop</span>}
      </button>
      <span className="summary-fact">
        <span className="mono">{rows.length}</span> <span className="muted">flights on</span>{" "}
        <span className="mono">{dateCount}</span> <span className="muted">dates</span>
      </span>
      {trapsHidden > 0 && (
        <span className="summary-fact">
          <span className="mono">{trapsHidden}</span> <span className="muted">traps hidden</span>
        </span>
      )}
    </div>
  );
}
