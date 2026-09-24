import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type {
  Itinerary,
  Judgment,
  Phase,
  ProgressEvent,
  SearchDetail,
  SearchRecord,
  SearchRequest,
  SearchStats,
  SearchStatus,
  StoredItinerary,
} from "@skai/core";

export interface SearchStore {
  create(id: string, request: SearchRequest, createdAt: string): void;
  setStatus(id: string, status: SearchStatus): void;
  setProgress(id: string, event: ProgressEvent): void;
  saveItineraries(searchId: string, items: readonly Itinerary[]): StoredItinerary[];
  saveJudgments(judgments: readonly Judgment[], createdAt: string): void;
  finish(id: string, status: SearchStatus, stats: SearchStats, error: string | null): void;
  get(id: string): SearchDetail | null;
  list(limit: number): SearchRecord[];
  /** Marks queued and running searches failed, with a finished progress event dated `now`. */
  failInterrupted(now: string): number;
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS searches (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  request TEXT NOT NULL,
  status TEXT NOT NULL,
  phase TEXT NOT NULL,
  progress TEXT,
  stats TEXT,
  error TEXT
);
CREATE TABLE IF NOT EXISTS itineraries (
  id TEXT PRIMARY KEY,
  search_id TEXT NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS itineraries_by_search ON itineraries(search_id);
CREATE TABLE IF NOT EXISTS judgments (
  itinerary_id TEXT NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  preference TEXT NOT NULL,
  probability REAL NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (itinerary_id, preference)
);
`;

interface SearchRow {
  id: string;
  created_at: string;
  request: string;
  status: string;
  phase: string;
  progress: string | null;
  stats: string | null;
  error: string | null;
}

const toRecord = (row: SearchRow): SearchRecord => ({
  id: row.id,
  createdAt: row.created_at,
  request: JSON.parse(row.request) as SearchRequest,
  status: row.status as SearchStatus,
  phase: row.phase as Phase,
  progress: row.progress ? (JSON.parse(row.progress) as ProgressEvent) : null,
  stats: row.stats ? (JSON.parse(row.stats) as SearchStats) : null,
  error: row.error,
});

export function openSqliteStore(file: string): SearchStore {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  const insertSearch = db.prepare(
    "INSERT INTO searches (id, created_at, request, status, phase) VALUES (?, ?, ?, 'queued', 'queued')",
  );
  const updateStatus = db.prepare("UPDATE searches SET status = ? WHERE id = ?");
  const updateProgress = db.prepare("UPDATE searches SET phase = ?, progress = ? WHERE id = ?");
  const insertItinerary = db.prepare("INSERT INTO itineraries (id, search_id, date, data) VALUES (?, ?, ?, ?)");
  const upsertJudgment = db.prepare(
    "INSERT OR REPLACE INTO judgments (itinerary_id, preference, probability, created_at) VALUES (?, ?, ?, ?)",
  );
  const finishSearch = db.prepare("UPDATE searches SET status = ?, stats = ?, error = ? WHERE id = ?");
  const selectSearch = db.prepare("SELECT * FROM searches WHERE id = ?");
  const selectItineraries = db.prepare("SELECT data FROM itineraries WHERE search_id = ? ORDER BY rowid");
  const selectJudgments = db.prepare(
    `SELECT j.itinerary_id AS itineraryId, j.preference, j.probability
       FROM judgments j JOIN itineraries i ON i.id = j.itinerary_id
      WHERE i.search_id = ? ORDER BY i.rowid`,
  );
  const selectRecent = db.prepare("SELECT * FROM searches ORDER BY created_at DESC LIMIT ?");
  const failOpen = db.prepare(
    `UPDATE searches
        SET status = 'failed', error = @message, phase = 'finished',
            progress = json_object('phase', 'finished', 'message', @message,
                                   'jevCalls', coalesce(json_extract(progress, '$.jevCalls'), 0), 'at', @now)
      WHERE status IN ('queued', 'running')`,
  );

  const saveItineraries = db.transaction((searchId: string, items: readonly Itinerary[]) =>
    items.map((item) => {
      const stored: StoredItinerary = { ...item, id: randomUUID() };
      insertItinerary.run(stored.id, searchId, stored.date, JSON.stringify(stored));
      return stored;
    }),
  );
  const saveJudgments = db.transaction((judgments: readonly Judgment[], createdAt: string) => {
    for (const j of judgments) upsertJudgment.run(j.itineraryId, j.preference, j.probability, createdAt);
  });

  return {
    create: (id, request, createdAt) => void insertSearch.run(id, createdAt, JSON.stringify(request)),
    setStatus: (id, status) => void updateStatus.run(status, id),
    setProgress: (id, event) => void updateProgress.run(event.phase, JSON.stringify(event), id),
    saveItineraries: (searchId, items) => saveItineraries(searchId, items),
    saveJudgments: (judgments, createdAt) => saveJudgments(judgments, createdAt),
    finish: (id, status, stats, error) => void finishSearch.run(status, JSON.stringify(stats), error, id),
    get(id) {
      const row = selectSearch.get(id) as SearchRow | undefined;
      if (!row) return null;
      const itineraries = (selectItineraries.all(id) as { data: string }[]).map(
        (r) => JSON.parse(r.data) as StoredItinerary,
      );
      const judgments = selectJudgments.all(id) as Judgment[];
      return { search: toRecord(row), itineraries, judgments };
    },
    list: (limit) => (selectRecent.all(limit) as SearchRow[]).map(toRecord),
    failInterrupted: (now) => failOpen.run({ message: "Server restarted during the search", now }).changes,
    close: () => db.close(),
  };
}
