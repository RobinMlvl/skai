import type { BookingResult } from "@skai/core";
import { useCallback, useState } from "react";
import { bookFlight, BookingError } from "../api/client";

export type BookingOutcome = { kind: "result"; result: BookingResult } | { kind: "error"; message: string; code: string };

export interface BookingNote {
  itineraryId: string;
  outcome: BookingOutcome;
}

export interface BookingSession {
  /** The itinerary currently opening, or null when no booking is in flight. */
  bookingId: string | null;
  /** The most recent outcome; cleared as soon as another booking starts. */
  note: BookingNote | null;
  book(itineraryId: string): void;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
const codeOf = (error: unknown) => (error instanceof BookingError ? error.code : "unknown");

/** Only one booking at a time; a new call while one is in flight is a no-op. */
export function useBooking(): BookingSession {
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [note, setNote] = useState<BookingNote | null>(null);

  const book = useCallback(
    (itineraryId: string) => {
      if (bookingId) return;
      setNote(null);
      setBookingId(itineraryId);
      bookFlight(itineraryId).then(
        (result) => {
          setNote({ itineraryId, outcome: { kind: "result", result } });
          setBookingId(null);
        },
        (error: unknown) => {
          setNote({ itineraryId, outcome: { kind: "error", message: messageOf(error), code: codeOf(error) } });
          setBookingId(null);
        },
      );
    },
    [bookingId],
  );

  return { bookingId, note, book };
}
