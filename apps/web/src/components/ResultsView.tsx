import { analyze, type SearchDetail, type Settings } from "@skai/core";
import { useEffect, useMemo, useState } from "react";
import { FlightCard } from "./FlightCard";
import { ResultsChart } from "./ResultsChart";
import { StatusBanner } from "./StatusBanner";
import { TrapRules } from "./TrapRules";

export function ResultsView({ detail }: { detail: SearchDetail }) {
  const [settings, setSettings] = useState<Settings>(detail.search.request.settings);
  const [showTrapped, setShowTrapped] = useState(false);
  useEffect(() => setSettings(detail.search.request.settings), [detail.search.id, detail.search.request.settings]);

  const rows = useMemo(() => analyze(detail.itineraries, settings), [detail.itineraries, settings]);
  const probabilities = useMemo(
    () => new Map(detail.judgments.map((j) => [j.itineraryId, j.probability])),
    [detail.judgments],
  );
  const frontier = rows.filter((row) => row.onFrontier);
  const others = rows.filter((row) => !row.onFrontier);
  const clean = others.filter((row) => row.traps.length === 0);
  const trapped = others.filter((row) => row.traps.length > 0);
  const visibleOthers = showTrapped ? others : clean;

  return (
    <section className="results">
      <StatusBanner detail={detail} />
      {rows.length === 0 ? (
        <p className="empty">No flights found for these dates.</p>
      ) : (
        <>
          <ResultsChart items={rows} />
          <TrapRules value={settings} onChange={setSettings} />
          <h2>Best trade-offs</h2>
          {frontier.map((row) => (
            <FlightCard key={row.item.id} row={row} probability={probabilities.get(row.item.id)} />
          ))}
          <div className="row">
            <h2>Other flights</h2>
            <label className="toggle">
              <input type="checkbox" checked={showTrapped} onChange={(e) => setShowTrapped(e.target.checked)} />
              Show trapped flights ({trapped.length})
            </label>
          </div>
          {visibleOthers.length === 0 && <p className="empty">Every other flight is trapped.</p>}
          {visibleOthers.map((row) => (
            <FlightCard key={row.item.id} row={row} probability={probabilities.get(row.item.id)} />
          ))}
        </>
      )}
    </section>
  );
}
