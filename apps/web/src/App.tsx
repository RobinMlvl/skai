import { useCallback, useEffect, useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { Globe } from "./components/Globe";
import { History } from "./components/History";
import { LivePanel } from "./components/LivePanel";
import { ResultsView } from "./components/ResultsView";
import { SearchForm } from "./components/SearchForm";
import { orbState } from "./lib/orb-state";
import { useSearchSession } from "./state/useSearchSession";

const DESKTOP_QUERY = "(min-width: 960px)";

export function App() {
  const session = useSearchSession();
  const [selection, setSelection] = useState({ origins: [] as string[], destinations: [] as string[] });
  const onSelectionChange = useCallback(
    (origins: string[], destinations: string[]) => setSelection({ origins, destinations }),
    [],
  );
  const shown = session.detail?.search.request ?? selection;

  const [globeSize, setGlobeSize] = useState(200);
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const update = () => setGlobeSize(query.matches ? 260 : 200);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // The radar band's status slot: LivePanel while a scan runs, otherwise ResultsView portals its
  // Summary in here (a callback ref so the DOM node is ready before ResultsView tries to use it).
  const [statusHost, setStatusHost] = useState<HTMLDivElement | null>(null);

  const radarRef = useRef<HTMLDivElement>(null);
  const wasRunning = useRef(false);
  useEffect(() => {
    if (session.running && !wasRunning.current && !window.matchMedia(DESKTOP_QUERY).matches) {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      radarRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    }
    wasRunning.current = session.running;
  }, [session.running]);

  return (
    <div className="app">
      <header className="topbar">
        <ThinkingOrb state={orbState(session.phase)} size={32} theme="dark" />
        <h1>
          Sk<em>AI</em>
        </h1>
        <span className="tag">Finds the flights worth taking</span>
      </header>
      <main className="layout">
        <section className="left">
          <SearchForm disabled={session.running} onSubmit={session.start} onSelectionChange={onSelectionChange} />
          {session.error && <p className="error" role="alert">{session.error}</p>}
          <History items={session.history} activeId={session.detail?.search.id ?? null} onOpen={session.open} />
        </section>
        <section className="right">
          <div className="radar-band" ref={radarRef}>
            <div className="radar-globe">
              <Globe origins={shown.origins} destinations={shown.destinations} active={session.running} size={globeSize} />
            </div>
            <div className="radar-status" ref={setStatusHost}>
              {session.running && session.events.length > 0 && (
                <LivePanel events={session.events} running={session.running} onCancel={session.cancel} />
              )}
            </div>
          </div>
          {session.detail && <ResultsView key={session.detail.search.id} detail={session.detail} summaryHost={statusHost} />}
        </section>
      </main>
    </div>
  );
}
