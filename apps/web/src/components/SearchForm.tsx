import {
  addDays,
  DEFAULT_SETTINGS,
  makeSearchRequestSchema,
  MAX_PREFERENCE_CHARS,
  todayIso,
  type SearchRequestInput,
  type Settings,
} from "@skai/core";
import { useEffect, useState, type FormEvent } from "react";
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

  useEffect(() => onSelectionChange(origins, destinations), [origins, destinations, onSelectionChange]);

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
      <AirportInput label="From" value={origins} onChange={setOrigins} disabled={disabled} />
      <AirportInput label="To" value={destinations} onChange={setDestinations} disabled={disabled} />
      <div className="field">
        <span className="field-label">Departure between</span>
        <div className="dates">
          <input className="input mono" type="date" aria-label="First departure date" min={today} value={dateFrom}
            disabled={disabled} onChange={(e) => setDateFrom(e.target.value)} />
          <input className="input mono" type="date" aria-label="Last departure date" min={dateFrom} value={dateTo}
            disabled={disabled} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>
      <label className="field">
        <span className="field-label">Preferences (checked by Jev)</span>
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
