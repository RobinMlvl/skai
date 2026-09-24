import { formatDuration, formatPrice, verdictFor, type AnalyzedItinerary, type Verdict } from "@skai/core";

const VERDICT_LABEL: Record<Verdict, string> = {
  fits: "Fits your preferences",
  "no-fit": "Doesn't fit",
  unsure: "Jev is unsure",
};

export function FlightCard({ row, probability }: { row: AnalyzedItinerary; probability: number | undefined }) {
  const it = row.item;
  const verdict = probability === undefined ? null : verdictFor(probability);
  const stops = it.stops === 0 ? "Nonstop" : `${it.stops} stop${it.stops > 1 ? "s" : ""}`;
  return (
    <article className={["card", row.traps.length ? "trapped" : "", row.excluded ? "excluded" : ""].join(" ").trim()}>
      <div>
        <div className="price">{formatPrice(it.priceEur)}</div>
        <div className="route">
          <span className="mono">{it.departure.time}</span> {it.departure.airport} →{" "}
          <span className="mono">
            {it.arrival.time}
            {it.arrival.dayOffset > 0 && <sup>+{it.arrival.dayOffset}</sup>}
          </span>{" "}
          {it.arrival.airport}
        </div>
        <div className="meta muted">
          {it.date} · {formatDuration(it.durationMin)} · {stops} · {it.airlines.join(", ")}
        </div>
        {it.layovers.length > 0 && (
          <div className="muted small">
            {it.layovers.map((l) => `${formatDuration(l.durationMin)} in ${l.city}${l.overnight ? " (overnight)" : ""}`).join(" · ")}
          </div>
        )}
      </div>
      <div className="badges">
        {row.frontierStep && (
          <span className="badge step">
            +{formatPrice(row.frontierStep.extraEur)} saves {formatDuration(row.frontierStep.savedMin)}
          </span>
        )}
        {row.traps.map((trap) => (
          <span key={trap.kind} className="badge trap">
            {trap.label}
          </span>
        ))}
        {verdict && probability !== undefined && (
          <span className={`badge verdict ${verdict}`} title={`Jev probability ${probability.toFixed(2)}`}>
            {VERDICT_LABEL[verdict]}
          </span>
        )}
      </div>
    </article>
  );
}
