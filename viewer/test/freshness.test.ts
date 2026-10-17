import { expect, it, vi, afterEach } from "vitest";
const repo = { name: "acme/app", url: "https://github.com/acme/app", commitSha: "a".repeat(40) };
afterEach(() => vi.restoreAllMocks());

it("compares the pinned commit to main once and shares the cached promise", async () => {
  vi.resetModules();
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ ahead_by: 4, behind_by: 0 }) } as Response);
  const { commitsBehindMain } = await import("@/lib/freshness");
  expect(await commitsBehindMain(repo)).toBe(4);
  expect(await commitsBehindMain(repo)).toBe(4);
  expect(await commitsBehindMain({ ...repo, commitSha: "b".repeat(40) })).toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]![0]).toContain(`${repo.commitSha}...main`);
});

it("silently caches a failed request without retrying", async () => {
  vi.resetModules();
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  const { commitsBehindMain } = await import("@/lib/freshness");
  expect(await commitsBehindMain(repo)).toBeUndefined();
  expect(await commitsBehindMain(repo)).toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
