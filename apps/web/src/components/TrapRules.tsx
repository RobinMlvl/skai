import type { Settings } from "@skai/core";

interface Props {
  value: Settings;
  onChange(settings: Settings): void;
  disabled?: boolean;
}

export function TrapRules({ value, onChange, disabled }: Props) {
  const setNumber = (key: "maxDurationRatio" | "maxLayoverMin" | "minLayoverMin", raw: string) => {
    const parsed = Number(raw);
    if (raw !== "" && Number.isFinite(parsed)) onChange({ ...value, [key]: parsed });
  };
  return (
    <details className="rules">
      <summary>Trap rules</summary>
      <div className="rules-grid">
        <label>
          Flag trips over
          <input type="number" min={1} max={10} step={0.1} value={value.maxDurationRatio} disabled={disabled}
            onChange={(e) => setNumber("maxDurationRatio", e.target.value)} />
          × the fastest
        </label>
        <label>
          Flag layovers over
          <input type="number" min={30} max={1440} step={15} value={value.maxLayoverMin} disabled={disabled}
            onChange={(e) => setNumber("maxLayoverMin", e.target.value)} />
          min
        </label>
        <label>
          Flag connections under
          <input type="number" min={0} max={240} step={5} value={value.minLayoverMin} disabled={disabled}
            onChange={(e) => setNumber("minLayoverMin", e.target.value)} />
          min
        </label>
        <label className="check">
          <input type="checkbox" checked={value.excludeSelfTransfer} disabled={disabled}
            onChange={(e) => onChange({ ...value, excludeSelfTransfer: e.target.checked })} />
          Hide separate tickets
        </label>
        <label className="check">
          <input type="checkbox" checked={value.excludeAirportChange} disabled={disabled}
            onChange={(e) => onChange({ ...value, excludeAirportChange: e.target.checked })} />
          Hide airport changes
        </label>
      </div>
    </details>
  );
}
