import {
  addDays,
  DEFAULT_SETTINGS,
  makeSearchRequestSchema,
  MAX_PREFERENCE_CHARS,
  MAX_RANGE_DAYS,
  todayIso,
  type SearchRequest,
  type SearchRequestInput,
  type Settings,
} from "@skai/core";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { aroundDate, formatDay, nextTwoWeeks, nextWeekend, rangeLength } from "../lib/dates";
import { AirportInput } from "./AirportInput";
import { TrapRules } from "./TrapRules";

interface Props {
  disabled: boolean;
  /** The opened scan's request, if any: pre-fills the form. Pair with a `key` on the opened id so it re-initialises. */
  initial?: SearchRequest;
  onSubmit(input: SearchRequestInput): void;
  onSelectionChange(origins: string[], destinations: string[]): void;
}

export function SearchForm({ disabled, initial, onSubmit, onSelectionChange }: Props) {
  const today = todayIso();
  // Reuse the opened search's dates only when they still make sense (first date not in the past).
  const initialDates =
    initial && initial.dateFrom >= today
      ? { from: initial.dateFrom, to: initial.dateTo }
      : { from: addDays(today, 14), to: addDays(today, 20) };
  const [origins, setOrigins] = useState<string[]>(initial?.origins ?? []);
  const [destinations, setDestinations] = useState<string[]>(initial?.destinations ?? []);
  const [dateFrom, setDateFrom] = useState(initialDates.from);
  const [dateTo, setDateTo] = useState(initialDates.to);
  const [preference, setPreference] = useState(initial?.preference ?? "");
  const [settings, setSettings] = useState<Settings>(initial?.settings ?? DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const dateFromInput = useRef<HTMLInputElement>(null);
  const dateToInput = useRef<HTMLInputElement>(null);

  useEffect(() => onSelectionChange(origins, destinations), [origins, destinations, onSelectionChange]);

  const swapAirports = () => {
    setOrigins(destinations);
    setDestinations(origins);
  };

  const changeDateFrom = (value: string) => {
    setDateFrom(value);
    if (value > dateTo) setDateTo(value);
  };

  const applyRange = (range: { from: string; to: string }) => {
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const dayCount = rangeLength(dateFrom, dateTo);
  const overMax = dayCount > MAX_RANGE_DAYS;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const input: SearchRequestInput = { origins, destinations, dateFrom, dateTo, settings, preference };
    const parsed = makeSearchRequestSchema(today).safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the search");
      return;
    }
    setError(null);
    onSubmit(input);
  };

  return (
    <form className="panel" onSubmit={submit} noValidate>
      <div className="airport-pair">
        <AirportInput label="From" value={origins} onChange={setOrigins} disabled={disabled} />
        <button
          type="button"
          className="swap-btn"
          disabled={disabled}
          aria-label="Swap departure and arrival"
          onClick={swapAirports}
        >
          <span aria-hidden="true">⇅</span>
        </button>
        <AirportInput label="To" value={destinations} onChange={setDestinations} disabled={disabled} />
      </div>
      <div className="field">
        <span className="field-label">Departure dates</span>
        <div className="dates">
          <button
            type="button"
            className="input mono date-btn"
            disabled={disabled}
            aria-label={`First departure date, ${formatDay(dateFrom)}`}
            onClick={() => dateFromInput.current?.showPicker()}
          >
            {formatDay(dateFrom)}
          </button>
          <button
            type="button"
            className="input mono date-btn"
            disabled={disabled}
            aria-label={`Last departure date, ${formatDay(dateTo)}`}
            onClick={() => dateToInput.current?.showPicker()}
          >
            {formatDay(dateTo)}
          </button>
        </div>
        <input
          ref={dateFromInput}
          className="hidden-date"
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          min={today}
          value={dateFrom}
          disabled={disabled}
          onChange={(e) => changeDateFrom(e.target.value)}
        />
        <input
          ref={dateToInput}
          className="hidden-date"
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          min={dateFrom}
          value={dateTo}
          disabled={disabled}
          onChange={(e) => setDateTo(e.target.value)}
        />
        <p className={overMax ? "field-note mono small warn" : "field-note mono small"}>
          {dayCount} date{dayCount === 1 ? "" : "s"}
          {overMax ? " · max 31" : ""}
        </p>
        <div className="date-shortcuts">
          <button
            type="button"
            className="ghost small"
            disabled={disabled}
            onClick={() => applyRange(aroundDate(dateFrom, 3, today))}
          >
            ±3 days
          </button>
          <button
            type="button"
            className="ghost small"
            disabled={disabled}
            onClick={() => applyRange(nextWeekend(today))}
          >
            Next weekend
          </button>
          <button
            type="button"
            className="ghost small"
            disabled={disabled}
            onClick={() => applyRange(nextTwoWeeks(today))}
          >
            Next 2 weeks
          </button>
        </div>
      </div>
      <label className="field">
        <span className="field-heading">
          <span className="field-label">Preferences</span>
          <span className="muted small">Checked by Jev</span>
        </span>
        <textarea
          value={preference}
          maxLength={MAX_PREFERENCE_CHARS}
          disabled={disabled}
          placeholder="e.g. no arrival after 10pm, avoid Istanbul, one stop max"
          onChange={(e) => setPreference(e.target.value)}
        />
      </label>
      <TrapRules value={settings} onChange={setSettings} disabled={disabled} />
      <button className="primary" type="submit" disabled={disabled}>
        {disabled ? "Scanning…" : "Scan flights"}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
