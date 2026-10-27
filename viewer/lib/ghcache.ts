/**
 * GitHub's anonymous API allows 60 requests an hour per viewer. Every successful GET is kept in
 * sessionStorage for the tab's life, so moving between /graph and /reviews costs nothing twice.
 * Storage can be missing or full; then it simply goes to the network.
 */
/** fetch that answers from sessionStorage when it can and stores every successful GET there. */
export function sessionCachedFetch(fetcher: typeof fetch, storage: () => Storage | undefined = () => globalThis.sessionStorage): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const key = `tracehound:gh:${url}`;
    try {
      const hit = storage()?.getItem(key);
      if (hit) return new Response(hit, { status: 200, headers: { "content-type": "application/json" } });
    } catch { /* storage blocked: go to the network */ }
    const response = await fetcher(input, init);
    if (response.ok) {
      const text = await response.clone().text();
      try { storage()?.setItem(key, text); } catch { /* full or blocked: fine */ }
    }
    return response;
  }) as typeof fetch;
}
