import { expect, it } from "vitest";
import { expandedFromHash, expansionHash } from "@/lib/expansion";
it("round-trips expanded ids, preserves unrelated hash state and rejects stale ids", () => {
  const hash = expansionHash("#zoom=1", new Set(["api:server", "worker:main"]));
  expect(hash).toContain("zoom=1");
  expect(expandedFromHash(hash, new Set(["api:server"]))).toEqual(new Set(["api:server"]));
  expect(expansionHash(hash, new Set())).toBe("#zoom=1");
  expect(expandedFromHash("", new Set(["api:server"])).size).toBe(0);
});
