/** Entirely local GitHub fixtures: unexpected requests throw before any network access. */
export function feedbackFixture() {
  const footer = '<!-- tracehound:v1 {"version":1} -->';
  const root = { id: 10, node_id: "comment10", user: { login: "github-actions[bot]" },
    path: "src/profile.ts", line: 20, original_line: 20, original_commit_id: "base", commit_id: "base",
    body: "null dereference of user in getProfile", pull_request_review_id: 2,
    html_url: "https://github.com/example/widget/pull/3#discussion_r10", created_at: "2026-10-01T00:00:00Z" };
  const reaction = { id: 30, content: "-1", user: { login: "owner" }, created_at: "2026-10-02T00:00:00Z" };
  const reply = { ...root, id: 11, in_reply_to_id: 10, user: { login: "owner" },
    body: "false positive", created_at: "2026-10-03T00:00:00Z" };
  const review = { ...root, id: 2, node_id: "review2", body: `TraceHound\n\n${footer}`,
    html_url: "https://github.com/example/widget/pull/3#pullrequestreview-2" };
  const thread = { isResolved: false, resolvedBy: { login: "owner" }, comments: { nodes: [{ fullDatabaseId: "10" }] } };
  const entries: Record<string, unknown> = {
    "/repos/example/widget/pulls?state=all&sort=updated&direction=desc&per_page=30": [{ number: 3, updated_at: "2026-10-10T00:00:00Z" }],
    "/repos/example/widget/pulls/3/reviews?per_page=100&page=1": [review],
    "/repos/example/widget/pulls/3/comments?per_page=100&page=1": [root],
    "/repos/example/widget/pulls/comments/10/reactions?per_page=100&page=1": [reaction],
    "/repos/example/widget/collaborators/owner/permission": { permission: "admin" },
    "/repos/example/widget/pulls/3/commits?per_page=100&page=1": [{ sha: "base" }, { sha: "later" }],
    "/repos/example/widget/commits/later?per_page=100&page=1": { files: [{ filename: "other.ts", status: "modified", patch: "@@ -1 +1 @@\n-old\n+new" }] },
    "/repos/example/widget/issues/3/comments?per_page=100&page=1": [],
  };
  const calls: string[] = [];
  const threads = [thread];
  const reviewReactions: { id: string; content: string; createdAt: string; user: { login: string } }[] = [];
  const pageInfo = { hasNextPage: false, endCursor: null };
  const deps = { now: () => new Date("2026-10-19T00:00:00Z"), fetch: (async (url, init) => {
    const endpoint = String(url).replace("https://api.example.invalid", "");
    calls.push(endpoint);
    if (new Headers(init?.headers).get("Authorization") !== "Bearer fake-unused") throw new Error("Missing auth");
    if (init?.redirect !== "error") throw new Error("Redirects forbidden");
    if (endpoint === "/graphql") {
      const request = JSON.parse(String(init?.body));
      if (request.query.includes("FeedbackThreads")) return Response.json({ data: { repository: { pullRequest: {
        reviewThreads: { nodes: threads, pageInfo } } } } });
      if (request.query.includes("FeedbackReactions")) return Response.json({ data: { node: {
        reactions: { nodes: reviewReactions, pageInfo } } } });
      throw new Error("Unexpected query");
    }
    if (!(endpoint in entries)) throw new Error(`Unexpected fixture endpoint: ${endpoint}`);
    const value = entries[endpoint];
    return value instanceof Response ? value.clone() : Response.json(value);
  }) as typeof fetch };
  return { root, reaction, reply, review, thread, threads, reviewReactions, entries, calls, footer, deps,
    options: { token: "fake-unused", apiUrl: "https://api.example.invalid" } };
}
