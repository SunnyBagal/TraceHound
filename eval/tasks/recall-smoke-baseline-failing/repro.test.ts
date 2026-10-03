// Reproduction for the SEEDED bug of the recall-smoke-trending smoke task (seed.patch drops
// "trending" from detectGitHub's list of first path segments that aren't repositories).
// Copied into recall-backend/test/ only while the harness reproduces and verifies.
import { expect, test } from "bun:test";
import { detectLinkType } from "../services/linkDetector";

test("a GitHub trending page is a plain link, not a repository", () => {
  expect(detectLinkType("https://github.com/trending/typescript")).toEqual({ type: "link", embedData: {}, embedUrl: null });
});
