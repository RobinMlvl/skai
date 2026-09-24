import type { ProgressEvent, SearchDetail, SearchRecord, SearchRequestInput } from "@skai/core";

const MUTATION_HEADERS = { "content-type": "application/json", "x-skai": "1" };
const STREAM_SILENCE_MS = 30_000;

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export const createSearch = (input: SearchRequestInput) =>
  fetch("/api/searches", { method: "POST", headers: MUTATION_HEADERS, body: JSON.stringify(input) }).then((r) =>
    readJson<{ id: string }>(r),
  );

export const getSearch = (id: string) => fetch(`/api/searches/${id}`).then((r) => readJson<SearchDetail>(r));

export const listSearches = () => fetch("/api/searches").then((r) => readJson<SearchRecord[]>(r));

export const cancelSearch = async (id: string) => {
  await fetch(`/api/searches/${id}/cancel`, { method: "POST", headers: { "x-skai": "1" } });
};

/**
 * Streams progress; closes itself after "finished" (otherwise EventSource would reconnect forever)
 * and on the first error, which it reports so the caller decides whether to subscribe again.
 */
export function subscribeProgress(
  id: string,
  onEvent: (event: ProgressEvent) => void,
  onError: () => void,
): () => void {
  const source = new EventSource(`/api/searches/${id}/events`);
  // The server writes at least a "ping" every 15 s. A proxy can keep a dead stream open without
  // ever raising "error" (seen live with Vite when the API restarts), so silence counts as an error.
  let lastMessageAt = Date.now();
  const stop = () => {
    clearInterval(watchdog);
    source.close();
  };
  const fail = () => {
    stop();
    onError();
  };
  const watchdog = setInterval(() => {
    if (Date.now() - lastMessageAt > STREAM_SILENCE_MS) fail();
  }, 5_000);
  source.addEventListener("ping", () => {
    lastMessageAt = Date.now();
  });
  source.addEventListener("progress", (message) => {
    lastMessageAt = Date.now();
    const event = JSON.parse((message as MessageEvent<string>).data) as ProgressEvent;
    onEvent(event);
    if (event.phase === "finished") stop();
  });
  source.addEventListener("error", fail);
  return stop;
}
