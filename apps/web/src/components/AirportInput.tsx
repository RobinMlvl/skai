import { MAX_AIRPORTS } from "@skai/core";
import { useId, useMemo, useState } from "react";
import { airportByIata, searchAirports, shortCity } from "../airports/search";

interface Props {
  label: string;
  value: string[];
  onChange(codes: string[]): void;
  disabled?: boolean;
}

export function AirportInput({ label, value, onChange, disabled }: Props) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const suggestions = useMemo(
    () => searchAirports(query).filter((airport) => !value.includes(airport.iata)),
    [query, value],
  );
  const full = value.length >= MAX_AIRPORTS;

  const add = (code: string) => {
    if (!full && !value.includes(code)) onChange([...value, code]);
    setQuery("");
    setActive(0);
  };

  return (
    <div className="field">
      <span className="field-label" id={`${id}-label`}>
        {label}
      </span>
      <div className="chips">
        {value.map((code) => (
          <button
            key={code}
            type="button"
            className="chip"
            disabled={disabled}
            aria-label={`Remove ${code}`}
            onClick={() => onChange(value.filter((c) => c !== code))}
          >
            <span className="mono">{code}</span> {shortCity(airportByIata(code)?.city ?? code)} <span aria-hidden="true">×</span>
          </button>
        ))}
        <input
          aria-labelledby={`${id}-label`}
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={`${id}-list`}
          value={query}
          disabled={disabled || full}
          placeholder={full ? `Max ${MAX_AIRPORTS}` : value.length ? "Add another" : "City or code"}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((i) => Math.min(i + 1, suggestions.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (event.key === "Enter" && suggestions[active]) {
              event.preventDefault();
              add(suggestions[active].iata);
            } else if (event.key === "Backspace" && !query && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
        />
      </div>
      {open && query && suggestions.length > 0 && (
        <ul className="suggestions" role="listbox" id={`${id}-list`}>
          {suggestions.map((airport, index) => (
            <li
              key={airport.iata}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                add(airport.iata);
              }}
            >
              <span className="mono">{airport.iata}</span> {airport.city}{" "}
              <span className="muted small">
                {airport.name} · {airport.country}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
