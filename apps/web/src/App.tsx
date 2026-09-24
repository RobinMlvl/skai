import { useCallback, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { Globe } from "./components/Globe";
import { History } from "./components/History";
import { LivePanel } from "./components/LivePanel";
import { ResultsView } from "./components/ResultsView";
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
  const shown = session.detail?.search.request ?? selection;

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
          <History items={session.history} activeId={session.detail?.search.id ?? null} onOpen={session.open} />
        </section>
        <section className="right">
          <Globe origins={shown.origins} destinations={shown.destinations} active={session.running} />
          {session.events.length > 0 && (
            <LivePanel events={session.events} running={session.running} onCancel={session.cancel} />
          )}
          {session.detail && <ResultsView detail={session.detail} />}
        </section>
      </main>
    </div>
  );
}
