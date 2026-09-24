import { useCallback, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { SearchForm } from "./components/SearchForm";
import { orbState } from "./lib/orb-state";
import { useSearchSession } from "./state/useSearchSession";

export function App() {
  const session = useSearchSession();
  const [selection, setSelection] = useState({ origins: [] as string[], destinations: [] as string[] });
  const onSelectionChange = useCallback(
    (origins: string[], destinations: string[]) => setSelection({ origins, destinations }),
    [],
  );

  return (
    <div className="app">
      <header className="topbar">
        <ThinkingOrb state={orbState(session.phase)} size={32} theme="dark" />
        <h1>
          Sk<em>AI</em>
        </h1>
        <span className="tag">flight intelligence</span>
      </header>
      <main className="layout">
        <section className="left">
          <SearchForm disabled={session.running} onSubmit={session.start} onSelectionChange={onSelectionChange} />
          {session.error && <p className="error" role="alert">{session.error}</p>}
        </section>
        <section className="right">
          <p className="muted mono small">
            {selection.origins.join(" ") || "—"} → {selection.destinations.join(" ") || "—"}
          </p>
        </section>
      </main>
    </div>
  );
}
