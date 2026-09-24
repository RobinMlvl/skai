import type { ProgressEvent } from "@skai/core";
import { ThinkingOrb } from "thinking-orbs";
import { orbState } from "../lib/orb-state";

interface Props {
  events: ProgressEvent[];
  running: boolean;
  onCancel(): void;
}

export function LivePanel({ events, running, onCancel }: Props) {
  const last = events.at(-1);
  const percent = last?.dateCount ? Math.round(((last.dateIndex ?? 0) / last.dateCount) * 100) : null;
  return (
    <section className="panel live" aria-live="polite">
      <div className="live-head">
        <ThinkingOrb state={orbState(last?.phase ?? null)} size={64} theme="dark" />
        <div>
          <div className="live-phase">{last?.phase ?? "queued"}</div>
          <div>{last?.message ?? "Waiting to start…"}</div>
        </div>
        {running && (
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {percent !== null && running && (
        <div className="bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${percent}%` }} />
        </div>
      )}
      <ol className="log">
        {events.slice(-8).map((event, index) => (
          <li key={`${event.at}-${index}`}>
            <span className="muted">{event.at.slice(11, 19)}</span> {event.message}
          </li>
        ))}
      </ol>
      <div className="muted small mono">Jev calls: {last?.jevCalls ?? 0}</div>
    </section>
  );
}
