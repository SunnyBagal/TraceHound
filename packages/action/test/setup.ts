import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.stubGlobal("fetch", () => { throw new Error("Tests must inject a fake GitHub API; network is forbidden"); });
});
afterEach(() => vi.unstubAllGlobals());
