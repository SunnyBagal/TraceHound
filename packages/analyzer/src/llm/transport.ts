// The HTTP transport of TokenFactoryClient (decision 073a). Node's built-in fetch (undici) fails any response whose
// headers take more than 300 s ("fetch failed", its headersTimeout), whatever timeout the caller sets; Nemotron 3.5
// replies of ~32k reasoning tokens take longer, and the review CLIs set 600 s. longFetch sends the same request over
// node:http(s) with no limit of its own, so only the caller's signal (the client's AbortSignal.timeout) ends it.
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

export function longFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  return new Promise((resolvePromise, reject) => {
    const u = new URL(url instanceof Request ? url.url : String(url));
    const send = u.protocol === "https:" ? httpsRequest : httpRequest;
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    const req = send(u, { method: init?.method ?? "GET", headers, ...(init?.signal && { signal: init.signal }) }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("error", reject);
      res.on("end", () => {
        try {
          const h = new Headers();
          for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) h.set(k, Array.isArray(v) ? v.join(", ") : v);
          const status = res.statusCode ?? 502;
          // 204, 205 and 304 must have a null body; any construction error rejects, so the client accounts for it
          resolvePromise(new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), { status, headers: h }));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    if (typeof init?.body === "string") req.write(init.body);
    req.end();
  });
}

let current: typeof fetch = longFetch as typeof fetch;

/** The client's default fetch: longFetch, unless a test setup has swapped it (setDefaultFetch). Read at call time. */
export const defaultFetch = ((url: string | URL | Request, init?: RequestInit) => current(url, init)) as typeof fetch;

/** Test setups point the default at their no-network guard; `null` restores longFetch. */
export function setDefaultFetch(f: typeof fetch | null): void {
  current = f ?? (longFetch as typeof fetch);
}
