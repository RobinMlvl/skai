import {
  isTerminal,
  type Phase,
  type ProgressEvent,
  type SearchDetail,
  type SearchRecord,
  type SearchRequest,
  type SearchRequestInput,
} from "@skai/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { cancelSearch, createSearch, getSearch, listSearches, subscribeProgress } from "../api/client";

/** The scan the user explicitly opened (click in History, or the on-load auto-open) — for pre-filling the form. */
export interface OpenedSearch {
  id: string;
  request: SearchRequest;
  /** New on every open, even of the same search: key the form on it so it re-fills. */
  nonce: number;
}

export interface SearchSession {
  history: SearchRecord[];
  detail: SearchDetail | null;
  opened: OpenedSearch | null;
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
  const [opened, setOpened] = useState<OpenedSearch | null>(null);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);
  // start() calls so far: an open() that resolves after a later start() must not replace that scan.
  const starts = useRef(0);
  const opens = useRef(0);

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
      starts.current += 1;
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
    const startsBefore = starts.current;
    try {
      const found = await getSearch(id);
      if (starts.current !== startsBefore) return; // the user started a scan meanwhile: it wins
      opens.current += 1;
      setOpened({ id, request: found.search.request, nonce: opens.current });
      if (isTerminal(found.search.status)) {
        setLiveId(null);
        setEvents([]);
        setDetail(found);
      } else {
        setDetail(null);
        setLiveId(id);
      }
    } catch (e) {
      if (starts.current === startsBefore) setError(messageOf(e));
    }
  }, []);

  // On first load, follow straight into the most recent search: only once, and only if the user
  // hasn't opened a search or started a scan (even one still starting) by the time history arrives.
  useEffect(() => {
    if (autoOpened || history.length === 0) return;
    setAutoOpened(true);
    if (detail || liveId || starts.current > 0) return;
    void open(history[0]!.id);
  }, [history, autoOpened, detail, liveId, open]);

  const last = events.at(-1);
  const running = starting || (liveId !== null && last?.phase !== "finished");
  const cancel = useCallback(() => {
    if (liveId) void cancelSearch(liveId);
  }, [liveId]);

  return { history, detail, opened, events, running, phase: last?.phase ?? null, error, start, open, cancel };
}
