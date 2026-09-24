import {
  addDays,
  DEFAULT_SETTINGS,
  makeSearchRequestSchema,
  MAX_PREFERENCE_CHARS,
  MAX_RANGE_DAYS,
  todayIso,
  type SearchRequestInput,
  type Settings,
} from "@skai/core";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { aroundDate, formatDay, nextTwoWeeks, nextWeekend, rangeLength } from "../lib/dates";
import { AirportInput } from "./AirportInput";
import { TrapRules } from "./TrapRules";

interface Props {
  disabled: boolean;
  onSubmit(input: SearchRequestInput): void;
  onSelectionChange(origins: string[], destinations: string[]): void;
}

export function SearchForm({ disabled, onSubmit, onSelectionChange }: Props) {
  const today = todayIso();
  const [origins, setOrigins] = useState<string[]>([]);
  const [destinations, setDestinations] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState(addDays(today, 14));
  const [dateTo, setDateTo] = useState(addDays(today, 20));
  const [preference, setPreference] = useState("");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
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
        <AirportInput label="To" value={destinations} onChange={setDestinations} disabled={disabled} />
        <button
          type="button"
          className="swap-btn"
          disabled={disabled}
          aria-label="Swap departure and arrival"
          onClick={swapAirports}
        >
          <span aria-hidden="true">⇅</span>
        </button>
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
        <span className="row">
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
