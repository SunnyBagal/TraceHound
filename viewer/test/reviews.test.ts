import { describe, expect, it, vi } from "vitest";
import { createReviewsClient, latestTraceReview, originalLines, parseFooter, reviewFindings, reviewNumber, reviewRepo, suggestionBlock } from "@/lib/reviews";

const footer = { version: 1, pipeline: "pool-verify-v1", headSha: "a".repeat(40), pool: 2, kept: 1, posted: 1, fixes: { attempted: 1, valid: 1, rejected: 0 }, findings: [{ path: "src/check.ts", line: 8, startLine: 8, source: "both", hasSuggestion: true }] };
const review = (id = 10, login = "github-actions[bot]", data = footer) => ({ id, user: { login }, body: `Review\n<!-- tracehound:v1 ${JSON.stringify(data)} -->`, submitted_at: null });
const pull = (number: number, state = "open") => ({ number, state, title: `Change ${number}`, merged_at: null, head: { sha: "a".repeat(40) }, updated_at: "2026-10-18" });
const response = (data: unknown, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers });
const comment = { id: 42, pull_request_review_id: 10, user: { login: "github-actions[bot]" }, path: "src/check.ts", body: "Reject invalid input.\n\nSuggested fix (model-generated, not tested):\n```suggestion\nreturn check(value);\n```", line: 8, original_line: 8, start_line: null, original_start_line: null, diff_hunk: "@@ -6,3 +6,3 @@\n function run(value) {\n   // validate\n-return old(value);\n+return unsafe(value);", commit_id: "a".repeat(40) };

describe("review footer and repository boundaries", () => {
  it("accepts only a valid v1 footer and the newest Actions review", () => {
    expect(parseFooter(review().body)).toEqual(footer);
    expect(parseFooter("<!-- tracehound:v1 {broken} -->")).toBeUndefined();
    expect(parseFooter(review().body.replace('"version":1', '"version":2'))).toBeUndefined();
    expect(latestTraceReview([review(), review(11), review(20, "some-user")])?.id).toBe(11);
    expect(latestTraceReview([{ ...review(), body: "TraceHound, without a footer" }])).toBeUndefined();
  });
  it("validates the repo and PR number, refusing the benchmark repo before fetching", async () => {
    const fetcher = vi.fn();
    expect(reviewRepo(undefined)).toBe("SunnyBagal/recall-seeded");
    for (const repo of ["calcom/cal.com", "CALCOM/Cal.Com", "owner/../other", "https://github.com/a/b", "owner/repo?x=1"]) await expect(createReviewsClient(fetcher).list(repo)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    for (const n of [null, "0", "-1", "1.5", "1e2"]) expect(() => reviewNumber(n)).toThrow();
    expect(reviewNumber("3")).toBe(3);
  });
});

describe("finding and suggestion extraction", () => {
  it("uses only comments from the selected footer-bearing review and matches its source", () => {
    const findings = reviewFindings({ id: 10, footer: parseFooter(review().body)! }, [comment, { ...comment, id: 43, pull_request_review_id: 9 }, { ...comment, id: 44, user: { login: "human" } }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ source: "both", body: "Reject invalid input.", original: "return unsafe(value);", suggestion: "return check(value);" });
  });
  it("handles empty deletion suggestions, CRLF, missing context and outdated lines", () => {
    expect(suggestionBlock("Delete it\r\n```suggestion\r\n\r\n```")).toEqual({ body: "Delete it", suggestion: "" });
    expect(originalLines(comment.diff_hunk, 7, 8)).toBe("  // validate\nreturn unsafe(value);");
    expect(originalLines(comment.diff_hunk, 8, 9)).toBeUndefined();
    expect(reviewFindings({ id: 10, footer: parseFooter(review().body)! }, [{ ...comment, line: null }])[0]).toMatchObject({ line: 8, outdated: true });
  });
  it("does not guess source when footer finding details are truncated", () => {
    expect(reviewFindings({ id: 10, footer: { ...parseFooter(review().body)!, findings: undefined, findingsTruncated: true } }, [comment])[0]?.source).toBeUndefined();
  });
});

describe("offline GitHub fetch fixtures", () => {
  it("lists open plus 30 recent closed PRs, uses footer counts and shares cached requests", async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
      const s = String(url);
      if (s.includes("/reviews")) return response([review()]);
      return response([pull(s.includes("state=closed") ? 2 : 1)]);
    });
    const client = createReviewsClient(fetcher);
    const list = await client.list("acme/shop");
    expect(list.pulls.map((p) => p.pull.number)).toEqual([1, 2]);
    expect(list.pulls[0]?.review?.footer.fixes.valid).toBe(1);
    await client.list("acme/shop");
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("state=closed&sort=updated&direction=desc&per_page=30"))).toBe(true);
    expect(fetcher.mock.calls.every(([, init]) => !((init as RequestInit | undefined)?.headers as Record<string, string> | undefined)?.Authorization)).toBe(true);
  });
  it("loads a PR and its inline finding without mixing older review comments", async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => response(String(url).includes("/reviews") ? [review()] : String(url).includes("/comments") ? [comment, { ...comment, id: 41, pull_request_review_id: 9 }] : pull(3)));
    expect((await createReviewsClient(fetcher).detail("acme/shop", 3)).findings).toHaveLength(1);
  });
  it("paginates reviews and all open PRs", async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      const s = String(url);
      if (s.includes("/reviews")) return response(new URL(s).searchParams.get("page") === "1" ? Array.from({ length: 100 }, (_, i) => review(i, "human")) : [review(101)]);
      if (s.includes("state=closed")) return response([]);
      return response(new URL(s).searchParams.get("page") === "1" ? Array.from({ length: 100 }, () => pull(1)) : []);
    });
    expect((await createReviewsClient(fetcher).list("acme/shop")).pulls[0]?.review?.id).toBe(101);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it.each([403, 429])("keeps partial results and stops requests on rate-limit HTTP %s", async (status) => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).includes("/reviews") ? response({ message: "API rate limit exceeded" }, status, { "x-ratelimit-remaining": "0" }) : response(String(url).includes("state=closed") ? [] : [pull(1), pull(2)]));
    const client = createReviewsClient(fetcher);
    const list = await client.list("acme/shop");
    expect(list.rateLimited).toBe(true);
    expect(list.pulls.every((p) => p.unavailable)).toBe(true);
    await expect(client.detail("acme/shop", 3)).rejects.toThrow("GitHub rate limit, try later");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("reports inaccessible repos and unreadable responses without leaking bodies", async () => {
    await expect(createReviewsClient(vi.fn(async () => response({ message: "private" }, 404))).list("acme/shop")).rejects.toThrow("isn’t publicly available");
    await expect(createReviewsClient(vi.fn(async () => response({ unexpected: true }))).list("acme/shop")).rejects.toThrow("unreadable");
  });
});
