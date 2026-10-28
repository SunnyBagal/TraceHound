import { ReactFlowProvider } from "@xyflow/react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Viewer } from "@/components/Viewer";
import { createPullsClient, findingTitle, prOverlay, reviewStatus, sessionCachedFetch, type StaticReviews } from "@/lib/pulls";
import { prLaneRepo } from "@/lib/repos";
import { repoSnapshot } from "./repo-snapshot";

const snapshot = repoSnapshot("tracehound-demo");
const inGraph = snapshot.components.find((c) => c.files.length > 0)!;
const file = inGraph.files[0]!;
const footer = (findings: { path: string; line: number }[]) => `<!-- tracehound:v1 ${JSON.stringify({ version: 1, pipeline: "pool-verify-v1", headSha: "a".repeat(40), pool: findings.length, kept: findings.length, posted: findings.length, fixes: { attempted: 0, valid: 0, rejected: 0 }, findings: findings.map((f) => ({ ...f, source: "diff", hasSuggestion: false })) })} -->`;
const pull = (number: number, title: string) => ({ number, title, state: "open", merged_at: null, head: { sha: "a".repeat(40) }, updated_at: "2026-10-20T00:00:00Z" });
const comment = (id: number, path: string, line: number, body: string) => ({ id, pull_request_review_id: 11, user: { login: "github-actions[bot]" }, path, body, line, original_line: line, start_line: null, original_start_line: null, diff_hunk: "@@ -1,1 +1,1 @@\n+x", commit_id: "a".repeat(40) });

/** A fake GitHub for tracehound-demo: #2 reviewed with two findings (one outside the graph), #1 not reviewed. */
function github(overrides: Record<string, () => Response> = {}) {
  const routes: Record<string, unknown> = {
    "/pulls?state=open": [pull(2, "Change search"), pull(1, "Older change")],
    "/pulls?state=closed": [],
    "/pulls/2/reviews": [{ id: 11, user: { login: "github-actions[bot]" }, submitted_at: "x", body: footer([{ path: file, line: 3 }, { path: "scripts/outside.ts", line: 9 }]) }],
    "/pulls/1/reviews": [],
    "/pulls/2/files": [{ filename: file, status: "modified", additions: 1, deletions: 1 }, { filename: "scripts/outside.ts", status: "modified", additions: 2, deletions: 0 }],
    "/pulls/2/comments": [comment(101, file, 3, "The parser now drops the last field. This can cause search to miss every description."), comment(102, "scripts/outside.ts", 9, "Outside finding text.")],
    "/pulls/2?": pull(2, "Change search"),
  };
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [k, f] of Object.entries(overrides)) if (url.includes(k)) return f();
    const key = Object.keys(routes).find((k) => url.replace(/\/pulls\/2$/, "/pulls/2?").includes(k));
    if (!key) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  });
}

beforeEach(() => { window.sessionStorage.clear(); window.history.replaceState(null, "", "/graph?repo=tracehound-demo"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.resetModules(); });

it("maps only configured repos, and recall-seeded stays off", () => {
  expect(prLaneRepo("tracehound-demo")).toBe("SunnyBagal/tracehound-demo");
  expect(prLaneRepo("recall")).toBeUndefined();
  expect(prLaneRepo("recall", { recallSeeded: true })).toBe("SunnyBagal/recall-seeded");
  expect(prLaneRepo("cex-v2-boilercode")).toBeUndefined();
});

it("review status: reviewed / no findings / not reviewed / unknown", () => {
  const review = (n: number) => ({ id: 1, footer: { version: 1 as const, pipeline: "p", headSha: "a".repeat(40), pool: n, kept: n, posted: n, fixes: { attempted: 0, valid: 0, rejected: 0 } } });
  expect(reviewStatus(review(2))).toEqual({ status: "reviewed", findingCount: 2 });
  expect(reviewStatus(review(0))).toEqual({ status: "no-findings", findingCount: 0 });
  expect(reviewStatus(undefined)).toEqual({ status: "not-reviewed", findingCount: 0 });
  expect(reviewStatus(undefined, true)).toEqual({ status: "unknown", findingCount: null });
});

it("lists PRs newest first and overlays files and findings on components, keeping what the graph can't place", async () => {
  const client = createPullsClient(github() as unknown as typeof fetch);
  const list = await client.list("SunnyBagal/tracehound-demo");
  expect(list.pulls.map((p) => [p.number, p.status, p.findingCount])).toEqual([[2, "reviewed", 2], [1, "not-reviewed", 0]]);
  const data = await client.overlay("SunnyBagal/tracehound-demo", 2);
  const model = prOverlay(snapshot, 2, data.files, data.findings);
  expect([...model.touched]).toEqual([[inGraph.id, [file]]]);
  expect(model.outsideFiles).toEqual(["scripts/outside.ts"]);
  expect(model.findings.get(inGraph.id)!.map((f) => f.commentId)).toEqual([101]);
  expect(model.outsideFindings.map((f) => f.commentId)).toEqual([102]);
});

it("caches every response in sessionStorage", async () => {
  const fetcher = github();
  await createPullsClient(fetcher as unknown as typeof fetch).list("SunnyBagal/tracehound-demo");
  const calls = fetcher.mock.calls.length;
  await createPullsClient(fetcher as unknown as typeof fetch).list("SunnyBagal/tracehound-demo");
  expect(fetcher.mock.calls.length).toBe(calls);
  const cached = sessionCachedFetch(vi.fn(async () => new Response("[]", { status: 200 })) as unknown as typeof fetch, () => window.sessionStorage);
  await cached("https://api.github.com/x");
  expect(window.sessionStorage.getItem("tracehound:gh:https://api.github.com/x")).toBe("[]");
});

it("on a rate limit falls back to the static review snapshot, with a calm notice", async () => {
  const saved: StaticReviews = { version: 1, repo: "SunnyBagal/tracehound-demo", generatedAt: "2026-10-27T10:00:00Z", pulls: [{ pull: pull(7, "Saved PR") as never, files: [{ filename: file, status: "modified", additions: 1, deletions: 0 }], comments: [] }] };
  const fetcher = github({
    "api.github.com": () => new Response(JSON.stringify({ message: "API rate limit exceeded" }), { status: 403, headers: { "x-ratelimit-remaining": "0" } }),
    "/reviews/SunnyBagal__tracehound-demo.json": () => new Response(JSON.stringify(saved), { status: 200 }),
  });
  const client = createPullsClient(fetcher as unknown as typeof fetch);
  const list = await client.list("SunnyBagal/tracehound-demo");
  expect(list.source).toBe("static");
  expect(list.notice).toMatch(/limit.*saved 2026-10-27/);
  expect(list.pulls.map((p) => [p.number, p.status])).toEqual([[7, "not-reviewed"]]);
  const data = await client.overlay("SunnyBagal/tracehound-demo", 7);
  expect(data.files.map((f) => f.filename)).toEqual([file]);
});

it("finding titles are effect-first, verbatim sentences", () => {
  expect(findingTitle("The parser now drops the last field. This can cause search to miss every description.")).toBe("This can cause search to miss every description.");
  expect(findingTitle("**Null check** missing on `user`. Rest.")).toBe("Null check missing on user.");
});

it("selecting a PR lights its components, dims the rest, lists files outside the graph; selecting none restores", async () => {
  vi.stubGlobal("fetch", github());
  render(<Viewer snapshot={snapshot} repoId="tracehound-demo" />);
  const lane = await screen.findByTestId("pr-lane");
  const chips = await within(lane).findAllByTestId("pr-chip");
  expect(chips.map((c) => c.textContent)).toEqual([expect.stringContaining("#2"), expect.stringContaining("#1")]);
  expect(within(chips[0]!).getByTestId("pr-status").textContent).toBe("2 findings");
  expect(within(chips[1]!).getByTestId("pr-status").textContent).toBe("not reviewed");
  await screen.findAllByTestId("component-node");
  fireEvent.click(chips[0]!);
  expect(window.location.search).toContain("pr=2");
  await waitFor(() => expect(screen.getAllByTestId("component-node").find((n) => n.dataset.componentId === inGraph.id)!.dataset.pr).toBe("touched"));
  const others = screen.getAllByTestId("component-node").filter((n) => n.dataset.componentId !== inGraph.id);
  expect(others.every((n) => n.dataset.pr === "untouched" && n.className.includes("opacity-35"))).toBe(true);
  expect(within(await screen.findByTestId("outside-graph")).getByText("scripts/outside.ts")).toBeTruthy();
  fireEvent.click(screen.getByTestId("pr-clear"));
  await waitFor(() => expect(screen.getAllByTestId("component-node").every((n) => n.dataset.pr === undefined && !n.className.includes("opacity-35"))).toBe(true));
  expect(window.location.search).not.toContain("pr=");
});

it("the PR panel toggles from its top-left button, and stays closed across visits", async () => {
  vi.stubGlobal("fetch", github());
  window.localStorage.removeItem("tracehound:pr-panel");
  const first = render(<Viewer snapshot={snapshot} repoId="tracehound-demo" />);
  await within(await screen.findByTestId("pr-lane")).findAllByTestId("pr-chip");
  fireEvent.click(screen.getByTestId("pr-toggle"));
  expect(screen.queryByTestId("pr-lane")).toBeNull();
  const button = screen.getByTestId("pr-toggle");
  expect(button.getAttribute("aria-expanded")).toBe("false");
  expect(button.textContent).toContain("Pull requests");
  first.unmount();
  render(<Viewer snapshot={snapshot} repoId="tracehound-demo" />);
  await waitFor(() => expect(screen.getByTestId("pr-toggle").getAttribute("aria-expanded")).toBe("false"));
  fireEvent.click(screen.getByTestId("pr-toggle"));
  expect(await screen.findByTestId("pr-lane")).toBeTruthy();
  window.localStorage.removeItem("tracehound:pr-panel");
});

it("shows no lane for a repo without a mapping", async () => {
  const cex = repoSnapshot("cex-v2-boilercode");
  vi.stubGlobal("fetch", github());
  render(<ReactFlowProvider><Viewer snapshot={cex} repoId="cex-v2-boilercode" /></ReactFlowProvider>);
  await screen.findAllByTestId("component-node");
  expect(screen.queryByTestId("pr-lane")).toBeNull();
});

it("pins findings: a badge and callout on the component, its card outlined (no PR node or edges on the graph), findings in the inspector", async () => {
  vi.stubGlobal("fetch", github());
  window.history.replaceState(null, "", "/graph?repo=tracehound-demo&pr=2");
  render(<Viewer snapshot={snapshot} repoId="tracehound-demo" />);
  const badge = await screen.findByTestId("findings-badge", {}, { timeout: 3000 });
  const card = badge.closest<HTMLElement>('[data-testid="component-node"]')!;
  expect(card.dataset.componentId).toBe(inGraph.id);
  expect(badge.textContent).toBe("1");
  const callout = within(card).getByTestId("finding-callout");
  expect(callout.textContent).toContain("This can cause search to miss every description.");
  expect(callout.textContent).toContain(`${file}:3`);
  expect(callout.textContent).toContain("model-generated, not tested");
  // the PR is a panel row, not a graph node: only its card is outlined, nothing is drawn for the PR
  expect(card.dataset.pr).toBe("touched");
  expect(within(screen.getByTestId("pr-lane")).getByTestId("pr-summary")).toBeTruthy();
  expect(document.querySelectorAll('[data-id^="pr:"]')).toHaveLength(0);
  expect(screen.queryByTestId("pr-node")).toBeNull();
  // the finding outside the graph is listed, not dropped
  expect(within(screen.getByTestId("outside-graph")).getByText("scripts/outside.ts:9")).toBeTruthy();
  fireEvent.click(badge);
  const panel = await screen.findByTestId("inspector-findings");
  const finding = within(panel).getByTestId("review-finding");
  expect(within(finding).getAllByRole("link").some((a) => a.getAttribute("href")!.endsWith("/pull/2#discussion_r101"))).toBe(true);
});
