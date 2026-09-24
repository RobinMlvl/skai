import type { ProgressEvent, SearchDetail, SearchRecord, SearchRequestInput } from "@skai/core";

const MUTATION_HEADERS = { "content-type": "application/json", "x-skai": "1" };

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

/** Streams progress; closes itself after "finished" (otherwise EventSource would reconnect forever). */
export function subscribeProgress(id: string, onEvent: (event: ProgressEvent) => void): () => void {
  const source = new EventSource(`/api/searches/${id}/events`);
  source.addEventListener("progress", (message) => {
    const event = JSON.parse((message as MessageEvent<string>).data) as ProgressEvent;
    onEvent(event);
    if (event.phase === "finished") source.close();
  });
  return () => source.close();
}
