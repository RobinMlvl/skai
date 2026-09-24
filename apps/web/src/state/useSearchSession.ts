import { isTerminal, type Phase, type ProgressEvent, type SearchDetail, type SearchRecord, type SearchRequestInput } from "@skai/core";
import { useCallback, useEffect, useState } from "react";
import { cancelSearch, createSearch, getSearch, listSearches, subscribeProgress } from "../api/client";

export interface SearchSession {
  history: SearchRecord[];
  detail: SearchDetail | null;
  events: ProgressEvent[];
  running: boolean;
  phase: Phase | null;
  error: string | null;
  start(input: SearchRequestInput): Promise<void>;
  open(id: string): Promise<void>;
  cancel(): void;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function useSearchSession(): SearchSession {
  const [history, setHistory] = useState<SearchRecord[]>([]);
  const [detail, setDetail] = useState<SearchDetail | null>(null);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refreshHistory = useCallback(() => {
    listSearches().then(setHistory, (e: unknown) => setError(messageOf(e)));
  }, []);

  useEffect(refreshHistory, [refreshHistory]);

  useEffect(() => {
    if (!liveId) return;
    setEvents([]);
    return subscribeProgress(liveId, (event) => {
      setEvents((previous) => [...previous.slice(-49), event]);
      if (event.phase === "finished") {
        getSearch(liveId).then(setDetail, (e: unknown) => setError(messageOf(e)));
        refreshHistory();
      }
    });
  }, [liveId, refreshHistory]);

  const start = useCallback(
    async (input: SearchRequestInput) => {
      setError(null);
      setDetail(null);
      try {
        const { id } = await createSearch(input);
        setLiveId(id);
        refreshHistory();
      } catch (e) {
        setError(messageOf(e));
      }
    },
    [refreshHistory],
  );

  const open = useCallback(async (id: string) => {
    setError(null);
    try {
      const found = await getSearch(id);
      if (isTerminal(found.search.status)) {
        setLiveId(null);
        setEvents([]);
        setDetail(found);
      } else {
        setDetail(null);
        setLiveId(id);
      }
    } catch (e) {
      setError(messageOf(e));
    }
  }, []);

  const last = events.at(-1);
  const running = liveId !== null && last?.phase !== "finished";
  const cancel = useCallback(() => {
    if (liveId) void cancelSearch(liveId);
  }, [liveId]);

  return { history, detail, events, running, phase: last?.phase ?? null, error, start, open, cancel };
}
