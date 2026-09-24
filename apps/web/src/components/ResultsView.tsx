import { analyze, type SearchDetail, type Settings } from "@skai/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useBooking } from "../state/useBooking";
import { FlightRow } from "./FlightRow";
import { ResultsChart } from "./ResultsChart";
import { StatusBanner } from "./StatusBanner";
import { Summary } from "./Summary";
import { TrapRules } from "./TrapRules";

const OTHERS_PAGE = 20;
const HIGHLIGHT_MS = 1_200;

interface Props {
  detail: SearchDetail;
  /** The radar band's status slot; the summary portals there when a search is loaded (not running). */
  summaryHost: HTMLElement | null;
}

/** Keyed by search id in App, so a new search starts from its own settings. */
export function ResultsView({ detail, summaryHost }: Props) {
  const [settings, setSettings] = useState<Settings>(detail.search.request.settings);
  const [showTrapped, setShowTrapped] = useState(false);
  const [otherLimit, setOtherLimit] = useState(OTHERS_PAGE);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const booking = useBooking();

  const rows = useMemo(() => analyze(detail.itineraries, settings), [detail.itineraries, settings]);
  const probabilities = useMemo(
    () => new Map(detail.judgments.map((j) => [j.itineraryId, j.probability])),
    [detail.judgments],
  );
  const frontier = rows.filter((row) => row.onFrontier);
  const others = rows.filter((row) => !row.onFrontier);
  const clean = others.filter((row) => row.traps.length === 0);
  const trapped = others.filter((row) => row.traps.length > 0);
  const otherPool = showTrapped ? others : clean;
  const visibleOthers = otherPool.slice(0, otherLimit);
  const hasPreference = Boolean(detail.search.request.preference);
  const { origins, destinations } = detail.search.request;

  const highlight = useCallback(
    (itineraryId: string) => {
      const row = rows.find((r) => r.item.id === itineraryId);
      if (!row) return;
      if (row.traps.length > 0) setShowTrapped(true);
      if (!row.onFrontier) setOtherLimit((limit) => Math.max(limit, others.length));
      setHighlightId(itineraryId);
    },
    [rows, others.length],
  );

  useEffect(() => {
    if (!highlightId) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(`flight-${highlightId}`)?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
    const timer = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlightId]);

  return (
    <section className="results">
      <StatusBanner detail={detail} />
      {rows.length === 0 ? (
        <p className="empty">No flights found for these dates.</p>
      ) : (
        <>
          {summaryHost &&
            createPortal(
              <Summary rows={rows} trapsHidden={showTrapped ? 0 : trapped.length} onHighlight={highlight} />,
              summaryHost,
            )}
          <details className="rules">
            <summary>Price vs travel time</summary>
            <ResultsChart items={rows} />
          </details>
          <TrapRules value={settings} onChange={setSettings} />
          <h2>Best trade-offs</h2>
          {frontier.map((row) => (
            <FlightRow
              key={row.item.id}
              row={row}
              probability={probabilities.get(row.item.id)}
              hasPreference={hasPreference}
              origins={origins}
              destinations={destinations}
              highlighted={highlightId === row.item.id}
              booking={booking}
            />
          ))}
          <div className="row">
            <h2>Other flights</h2>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showTrapped}
                onChange={(e) => {
                  setShowTrapped(e.target.checked);
                  setOtherLimit(OTHERS_PAGE);
                }}
              />
              Show trapped flights ({trapped.length})
            </label>
          </div>
          {visibleOthers.length === 0 && trapped.length > 0 && <p className="empty">Every other flight is trapped.</p>}
          {visibleOthers.map((row) => (
            <FlightRow
              key={row.item.id}
              row={row}
              probability={probabilities.get(row.item.id)}
              hasPreference={hasPreference}
              origins={origins}
              destinations={destinations}
              highlighted={highlightId === row.item.id}
              booking={booking}
            />
          ))}
          {otherPool.length > otherLimit && (
            <button type="button" className="ghost show-more" onClick={() => setOtherLimit((limit) => limit + OTHERS_PAGE)}>
              Show {Math.min(OTHERS_PAGE, otherPool.length - otherLimit)} more
            </button>
          )}
        </>
      )}
    </section>
  );
}
