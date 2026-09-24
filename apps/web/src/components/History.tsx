import type { SearchRecord } from "@skai/core";

export function History({ items, activeId, onOpen }: { items: SearchRecord[]; activeId: string | null; onOpen(id: string): void }) {
  if (items.length === 0) return null;
  return (
    <section className="panel history">
      <h2>Recent scans</h2>
      <ul>
        {items.map((search) => (
          <li key={search.id}>
            <button type="button" className={search.id === activeId ? "active" : ""} onClick={() => onOpen(search.id)}>
              <span className="mono">
                {search.request.origins.join(" ")} → {search.request.destinations.join(" ")}
              </span>
              <span className="muted small">
                {search.request.dateFrom} → {search.request.dateTo} · {search.status}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
