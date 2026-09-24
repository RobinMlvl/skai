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
const RESUBSCRIBE_MS = 2_000;

/** The stored finished event, or one made up for a search that ended without it. */
const finishedEvent = ({ search }: SearchDetail): ProgressEvent =>
  search.progress?.phase === "finished"
    ? search.progress
    : {
        phase: "finished",
        message: search.error ?? `Search ${search.status}`,
        jevCalls: search.progress?.jevCalls ?? 0,
        at: new Date().toISOString(),
      };

export function useSearchSession(): SearchSession {
  const [history, setHistory] = useState<SearchRecord[]>([]);
  const [detail, setDetail] = useState<SearchDetail | null>(null);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const refreshHistory = useCallback(() => {
    listSearches().then(setHistory, (e: unknown) => setError(messageOf(e)));
  }, []);

  useEffect(refreshHistory, [refreshHistory]);

  useEffect(() => {
    if (!liveId) return;
    setEvents([]);
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe = () => {};
    const push = (event: ProgressEvent) => setEvents((previous) => [...previous.slice(-49), event]);
    const resubscribeLater = () => {
      if (!stopped) retry = setTimeout(subscribe, RESUBSCRIBE_MS);
    };
    // The stream broke (server restart, proxy error): a search that ended meanwhile ends here too.
    const recover = () => {
      getSearch(liveId).then((found) => {
        if (stopped) return;
        if (!isTerminal(found.search.status)) return resubscribeLater();
        setDetail(found);
        push(finishedEvent(found));
        refreshHistory();
      }, (e: unknown) => {
        if (stopped) return;
        // The search no longer exists: stop instead of retrying forever.
        if (messageOf(e) === "Search not found") {
          setError("This search no longer exists.");
          push({ phase: "finished", message: "Search not found", jevCalls: 0, at: new Date().toISOString() });
          return;
        }
        resubscribeLater();
      });
    };
    const subscribe = () => {
      unsubscribe = subscribeProgress(
        liveId,
        (event) => {
          push(event);
          if (event.phase === "finished") {
            getSearch(liveId).then(setDetail, (e: unknown) => setError(messageOf(e)));
            refreshHistory();
          }
        },
        recover,
      );
    };
    subscribe();
    return () => {
      stopped = true;
      clearTimeout(retry);
      unsubscribe();
    };
  }, [liveId, refreshHistory]);

  const start = useCallback(
    async (input: SearchRequestInput) => {
      setError(null);
      setDetail(null);
      setEvents([]);
      setStarting(true); // keeps the form disabled until the search exists (no double submit)
      try {
        const { id } = await createSearch(input);
        setLiveId(id);
        refreshHistory();
      } catch (e) {
        setError(messageOf(e));
      } finally {
        setStarting(false);
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
  const running = starting || (liveId !== null && last?.phase !== "finished");
  const cancel = useCallback(() => {
    if (liveId) void cancelSearch(liveId);
  }, [liveId]);

  return { history, detail, events, running, phase: last?.phase ?? null, error, start, open, cancel };
}
