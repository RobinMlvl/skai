import { formatDuration, formatPrice, verdictFor, type AnalyzedItinerary, type Verdict } from "@skai/core";
import type { MouseEvent } from "react";
import { formatDay } from "../lib/dates";
import { codeFor } from "../lib/airport-code";
import type { BookingOutcome, BookingSession } from "../state/useBooking";

const VERDICT_LABEL: Record<Verdict, string> = {
  fits: "Fits your preferences",
  "no-fit": "Doesn't fit",
  unsure: "Jev is unsure",
};

interface Props {
  row: AnalyzedItinerary;
  probability: number | undefined;
  /** The search had a preference: a flight Jev did not judge shows "—". */
  hasPreference: boolean;
  origins: string[];
  destinations: string[];
  highlighted: boolean;
  booking: BookingSession;
}

export function FlightRow({ row, probability, hasPreference, origins, destinations, highlighted, booking }: Props) {
  const it = row.item;
  const verdict = probability === undefined ? null : verdictFor(probability);
  const stops = it.stops === 0 ? "Nonstop" : `${it.stops} stop${it.stops > 1 ? "s" : ""}`;
  const depCode = codeFor(it.departure.airport, origins) ?? it.departure.airport;
  const arrCode = codeFor(it.arrival.airport, destinations) ?? it.arrival.airport;
  const isOpening = booking.bookingId === it.id;
  const bookingDisabled = booking.bookingId !== null;
  const note = booking.note?.itineraryId === it.id ? booking.note.outcome : null;

  const activate = () => booking.book(it.id);
  // The whole row books, except its own controls, the booking note, and a drag that selected text.
  const handleRowClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("a, button, .booking-note")) return;
    if (window.getSelection()?.toString()) return;
    activate();
  };

  return (
    <article
      id={`flight-${it.id}`}
      className={["flight-row", row.traps.length ? "trapped" : "", row.excluded ? "excluded" : "", highlighted ? "highlight" : ""]
        .join(" ")
        .trim()}
      onClick={handleRowClick}
    >
      <div className="flight-main">
        <div className="flight-dep">
          <span className="mono time">{it.departure.time}</span>
          <span className="mono code">{depCode}</span>
          <span className="muted small">{formatDay(it.date)}</span>
        </div>
        <div className="flight-route">
          <div className="route-line" role="img" aria-label={stops}>
            {Array.from({ length: it.stops + 1 }).map((_, i) => (
              <span key={i} className="route-seg" aria-hidden="true" />
            ))}
          </div>
          {it.layovers.length > 0 && (
            <div className="muted small route-stops">
              {it.layovers.map((l) => `${l.city}${l.overnight ? " (overnight)" : ""}`).join(" · ")}
            </div>
          )}
        </div>
        <div className="flight-arr">
          <span className="mono time">
            {it.arrival.time}
            {it.arrival.dayOffset !== 0 && (
              <sup>
                {it.arrival.dayOffset > 0 ? "+" : "−"}
                {Math.abs(it.arrival.dayOffset)}
              </sup>
            )}
          </span>
          <span className="mono code">{arrCode}</span>
        </div>
        <div className="flight-info">
          <span className="mono">{formatDuration(it.durationMin)}</span>
          <span className="flight-airlines">{it.airlines.join(", ")}</span>
        </div>
        <div className="flight-price mono">{formatPrice(it.priceEur)}</div>
        <button
          type="button"
          className="ghost book-btn"
          disabled={bookingDisabled}
          aria-label={`Book ${it.airlines[0]} flight on ${formatDay(it.date)} at ${it.departure.time}, ${formatPrice(it.priceEur)}`}
          onClick={activate}
        >
          {isOpening ? "Opening…" : "Book"}
        </button>
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
        {!verdict && hasPreference && (
          <span className="badge verdict" title="Not checked by Jev">
            —
          </span>
        )}
      </div>
      {note && <BookingNote outcome={note} />}
    </article>
  );
}

function BookingNote({ outcome }: { outcome: BookingOutcome }) {
  if (outcome.kind === "result") {
    const { result } = outcome;
    if (result.status === "airline") {
      return (
        <p className="booking-note small">
          Opened {result.seller} in SkAI's Chrome window.{" "}
          <a href={result.url} target="_blank" rel="noopener noreferrer">
            Open in my browser
          </a>
        </p>
      );
    }
    if (result.status === "options") {
      return <p className="booking-note small">Google's booking options are open in SkAI's Chrome window. Pick a seller there.</p>;
    }
    return <p className="booking-note small">Google no longer lists this flight. Its results are open in SkAI's Chrome window.</p>;
  }
  const message = outcome.code === "busy" ? "Another booking is opening. Try again in a moment." : outcome.message;
  return (
    <p className="booking-note error small" role="alert">
      {message}
    </p>
  );
}
