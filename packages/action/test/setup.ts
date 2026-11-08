import { afterEach, beforeEach, vi } from "vitest";
import { setDefaultFetch } from "../../analyzer/src/llm/transport.ts";

beforeEach(() => {
  vi.stubGlobal("fetch", () => { throw new Error("Tests must inject a fake GitHub API; network is forbidden"); });
});
afterEach(() => vi.unstubAllGlobals());

// 073a: the client's default transport (node:http/https) must hit the same guard, so it delegates to globalThis.fetch.
setDefaultFetch((url, init) => globalThis.fetch(url, init));
