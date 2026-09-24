import { ThinkingOrb } from "thinking-orbs";
import { orbState } from "./lib/orb-state";
import { useSearchSession } from "./state/useSearchSession";

export function App() {
  const session = useSearchSession();
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
        <section className="panel">
          <p className="muted">{session.history.length} recent scans</p>
          {session.error && <p className="error">{session.error}</p>}
        </section>
      </main>
    </div>
  );
}
