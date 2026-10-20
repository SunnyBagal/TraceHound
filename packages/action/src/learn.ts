import { fingerprint } from "../../analyzer/src/learn/fingerprint.ts";
import { FeedbackSuppression, type RejectedFingerprint } from "../../analyzer/src/learn/suppress.ts";

export interface LearnOptions { token: string; apiUrl: string }
export interface LearnDependencies { fetch: typeof fetch; now?: () => Date }
interface User { login: string }
interface Comment {
  id: number; node_id: string; body: string; user: User | null; html_url: string;
  created_at: string; updated_at?: string; submitted_at?: string;
  pull_request_review_id?: number; in_reply_to_id?: number;
  path?: string; line?: number | null; original_line?: number | null;
  commit_id?: string; original_commit_id?: string;
}
interface Thread {
  isResolved: boolean; resolvedBy: User | null;
  comments: { nodes: { fullDatabaseId: string | number }[] };
}
interface Commit { sha: string }
interface CommitFile { filename: string; previous_filename?: string; status: string; patch?: string }
interface Signal { at: string; id: string; reason?: string }

const REJECT_PHRASES = ["false positive", "not a bug", "won't fix", "wontfix", "nit", "ignore", "not an issue", "by design"];
const ACCEPT_PHRASES = ["fixed", "good catch"];
const BOT = "github-actions[bot]";
const FILE = "feedback/rejected.json";
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export function assertFeedbackRepo(repo: string): void {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || repo.toLowerCase() === "calcom/cal.com") {
    throw new Error("Feedback repository refused");
  }
}

function hasFooter(body: string): boolean {
  const match = /^<!-- tracehound:v1 (\{.*\}) -->$/.exec(body.trimEnd().split("\n").at(-1) ?? "");
  try { return !!match && JSON.parse(match[1]!).version === 1; } catch { return false; }
}

function phrase(body: string, phrases: string[]): string | undefined {
  return phrases.find(text => new RegExp(`(?:^|[^\\p{L}\\p{N}_])${text}(?=$|[^\\p{L}\\p{N}_])`, "iu").test(body));
}

function acceptance(body: string): string | undefined {
  const unnegated = body.replace(/(?:^|[^\p{L}\p{N}_])(?:not|isn['’]t)\s+fixed(?=$|[^\p{L}\p{N}_])/giu, " ");
  return phrase(unnegated, ACCEPT_PHRASES);
}

function refersToReview(body: string, url: string): boolean {
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}(?=$|[\\s\\]\\)>"'.,!?])`).test(body);
}

/** Only location blocks emitted by buildReview are findings; summary prose is never learned. */
export function bodyFindings(body: string): { path: string; body: string }[] {
  const content = body.split("\n\nThese comments are model-generated and unverified.")[0]!;
  const locations = [...content.matchAll(/^([^\r\n]+):(\d+|null)\r?\n/gm)];
  return locations.map((match, i) => ({ path: match[1]!, body: content.slice(match.index! + match[0].length,
    locations[i + 1]?.index ?? content.length).split("\n\nSuggested fix (model-generated, not tested):")[0]!.trim() }))
    .filter(item => item.body.length > 0);
}

class GitHub {
  readonly options: LearnOptions;
  readonly deps: LearnDependencies;
  readonly base: string;
  constructor(options: LearnOptions, deps: LearnDependencies) {
    this.options = options; this.deps = deps; this.base = options.apiUrl.replace(/\/$/, "");
  }
  async response(endpoint: string, payload?: unknown): Promise<Response> {
    return this.deps.fetch(`${this.base}${endpoint}`, {
      method: payload ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(60_000),
      headers: { Authorization: `Bearer ${this.options.token}`, Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28", ...(payload ? { "Content-Type": "application/json" } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
  }
  async get<T>(endpoint: string): Promise<T> {
    const response = await this.response(endpoint);
    if (!response.ok) throw new Error("Feedback GitHub request failed");
    return await response.json() as T;
  }
  async all<T>(endpoint: string, field?: string): Promise<T[]> {
    const items: T[] = [];
    for (let page = 1; ; page++) {
      const result = await this.get<T[] | Record<string, T[]>>(`${endpoint}${endpoint.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
      const batch = field ? (result as Record<string, T[]>)[field] : result as T[];
      if (!Array.isArray(batch)) throw new Error("Invalid feedback page");
      items.push(...batch);
      if (batch.length < 100) return items;
      // GitHub caps commit files at 3,000; never infer 'unchanged' from truncated data.
      if (field === "files" && items.length >= 3000) throw new Error("Commit files truncated");
    }
  }
  async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    // GitHub Enterprise REST ends in /api/v3; its GraphQL endpoint is /api/graphql.
    const endpoint = this.base.endsWith("/api/v3") ? "/api/graphql" : "/graphql";
    const root = this.base.endsWith("/api/v3") ? this.base.slice(0, -7) : this.base;
    const client = new GitHub({ ...this.options, apiUrl: root }, this.deps);
    const response = await client.response(endpoint, { query, variables });
    if (!response.ok) throw new Error("Feedback GraphQL request failed");
    const result = await response.json() as { data?: T; errors?: unknown[] };
    if (!result.data || result.errors?.length) throw new Error("Feedback GraphQL response failed");
    return result.data;
  }
}

const PAGE = "pageInfo { hasNextPage endCursor }";
interface Connection<T> { nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }
async function threads(api: GitHub, repo: string, pr: number): Promise<Thread[]> {
  const [owner, name] = repo.split("/");
  const items: Thread[] = [];
  let after: string | null = null;
  do {
    const result: { repository: { pullRequest: { reviewThreads: Connection<Thread> } } } = await api.graphql(
      `query FeedbackThreads($owner:String!,$name:String!,$pr:Int!,$after:String) {
        repository(owner:$owner,name:$name) { pullRequest(number:$pr) { reviewThreads(first:100,after:$after) {
          nodes { isResolved resolvedBy { login } comments(first:1) { nodes { fullDatabaseId } } } ${PAGE}
        } } }
      }`, { owner, name, pr, after });
    const connection = result.repository.pullRequest.reviewThreads;
    items.push(...connection.nodes);
    after = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
    if (connection.pageInfo.hasNextPage && !after) throw new Error("Invalid thread cursor");
  } while (after);
  return items;
}

/** Compare changed lines on the old side, translating the anchor past edits before it. */
export function patchTouches(patch: string, line: number): { touched: boolean; line: number } {
  let old = 0, shift = 0, hunks = 0;
  for (const row of patch.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/.exec(row);
    if (hunk) { old = Number(hunk[1]); hunks++; continue; }
    if (!hunks) continue;
    if (row.startsWith("+") || row.startsWith("-")) {
      if (Math.abs(old - line) <= 5) return { touched: true, line };
      if (old < line) shift += row[0] === "+" ? 1 : -1;
    }
    if (row.startsWith(" ") || row.startsWith("-")) old++;
  }
  return { touched: hunks === 0, line: line + shift };
}

export function orderFeedback(items: readonly RejectedFingerprint[]): RejectedFingerprint[] {
  return [...items].sort((a, b) => compare(a.repo, b.repo) || a.pr - b.pr || a.commentId - b.commentId
    || compare(a.path, b.path) || compare(a.reason, b.reason));
}
export function serializeFeedback(items: readonly RejectedFingerprint[]): string {
  return JSON.stringify(orderFeedback(items), null, 2) + "\n";
}

/** Recompute a complete repo-local list, without models, git, or persisted wall-clock timestamps. */
export async function collectFeedback(repo: string, options: LearnOptions, deps: LearnDependencies): Promise<RejectedFingerprint[]> {
  assertFeedbackRepo(repo);
  const api = new GitHub(options, deps), base = `/repos/${repo.split("/").map(encodeURIComponent).join("/")}`;
  const cutoff = (deps.now?.() ?? new Date()).getTime() - 60 * 24 * 60 * 60 * 1000;
  const pulls = await api.get<{ number: number; updated_at: string }[]>(`${base}/pulls?state=all&sort=updated&direction=desc&per_page=30`);
  const permission = new Map<string, boolean>();
  const maintainer = async (user: User | null): Promise<boolean> => {
    if (!user?.login) return false;
    const key = user.login.toLowerCase();
    if (!permission.has(key)) {
      const response = await api.response(`${base}/collaborators/${encodeURIComponent(user.login)}/permission`);
      if (response.status === 403 || response.status === 404) permission.set(key, false);
      else {
        if (!response.ok) throw new Error("Feedback permission request failed");
        const result = await response.json() as { permission: string };
        permission.set(key, ["write", "maintain", "admin"].includes(result.permission));
      }
    }
    return permission.get(key)!;
  };
  const rejected: RejectedFingerprint[] = [];
  for (const pr of pulls.slice(0, 30).filter(pr => Date.parse(pr.updated_at) >= cutoff)) {
    const endpoint = `${base}/pulls/${pr.number}`;
    const reviews = await api.all<Comment>(`${endpoint}/reviews`);
    const owned = reviews.filter(review => review.user?.login === BOT && hasFooter(review.body));
    const reviewIds = new Set(owned.map(review => review.id));
    const comments = await api.all<Comment>(`${endpoint}/comments`);
    const own = comments.filter(comment => !comment.in_reply_to_id && comment.user?.login === BOT
      && (hasFooter(comment.body) || reviewIds.has(comment.pull_request_review_id!)));
    if (!own.length && !owned.length) continue;
    const resolved = own.length ? await threads(api, repo, pr.number) : [];
    const issueReplies = owned.some(review => bodyFindings(review.body).length)
      ? await api.all<Comment>(`${base}/issues/${pr.number}/comments`) : [];
    let commits: Commit[] | undefined;
    const commitFiles = new Map<string, CommitFile[]>();
    const unchanged = async (comment: Comment): Promise<boolean> => {
      let line = comment.original_line ?? comment.line;
      if (!line || !comment.path) return false;
      commits ??= await api.all<Commit>(`${endpoint}/commits`);
      if (commits.length >= 250) return false; // REST PR commits are capped.
      const index = commits.findIndex(commit => commit.sha === (comment.original_commit_id ?? comment.commit_id));
      if (index < 0) return false;
      for (const commit of commits.slice(index + 1)) {
        if (!commitFiles.has(commit.sha)) commitFiles.set(commit.sha, await api.all<CommitFile>(`${base}/commits/${commit.sha}`, "files"));
        for (const file of commitFiles.get(commit.sha)!) {
          if (file.filename !== comment.path && file.previous_filename !== comment.path) continue;
          if (!file.patch || file.status !== "modified") return false;
          const change = patchTouches(file.patch, line);
          if (change.touched) return false;
          line = change.line;
        }
      }
      return true;
    };
    for (const comment of [...own, ...owned.filter(review => bodyFindings(review.body).length)]) {
      const signals: Signal[] = [];
      const thread = resolved.find(thread => String(thread.comments.nodes[0]?.fullDatabaseId) === String(comment.id));
      if (thread?.isResolved && await maintainer(thread.resolvedBy) && await unchanged(comment)) {
        // GraphQL has no resolvedAt. Treat resolution as an inferred baseline; explicit later
        // signals take precedence, rather than pretending collection time is resolution time.
        signals.push({ at: comment.created_at, id: "resolution", reason: "resolved-unchanged" });
      }
      if (own.includes(comment)) {
        const reactions = await api.all<{ id: number; content: string; created_at: string; user: User | null }>(`${base}/pulls/comments/${comment.id}/reactions`);
        for (const reaction of reactions) {
          if (!["-1", "+1"].includes(reaction.content) || !await maintainer(reaction.user)) continue;
          signals.push({ at: reaction.created_at, id: `reaction:${reaction.id}`, ...(reaction.content === "-1" && { reason: "reaction" }) });
        }
      } else {
        let after: string | null = null;
        do {
          const result: { node: { reactions: Connection<{ id: string; content: string; createdAt: string; user: User | null }> } } = await api.graphql(
            `query FeedbackReactions($id:ID!,$after:String) { node(id:$id) { ... on PullRequestReview {
              reactions(first:100,after:$after) { nodes { id content createdAt user { login } } ${PAGE} }
            } } }`, { id: comment.node_id, after });
          for (const reaction of result.node.reactions.nodes) {
            if (!["THUMBS_DOWN", "THUMBS_UP"].includes(reaction.content) || !await maintainer(reaction.user)) continue;
            signals.push({ at: reaction.createdAt, id: `reaction:${reaction.id}`, ...(reaction.content === "THUMBS_DOWN" && { reason: "reaction" }) });
          }
          const page = result.node.reactions.pageInfo;
          after = page.hasNextPage ? page.endCursor : null;
          if (page.hasNextPage && !after) throw new Error("Invalid reaction cursor");
        } while (after);
      }
      const replies = own.includes(comment) ? comments.filter(reply => reply.in_reply_to_id === comment.id)
        : issueReplies.filter(reply => refersToReview(reply.body, comment.html_url));
      for (const reply of replies) {
        const reason = phrase(reply.body, REJECT_PHRASES), accepted = acceptance(reply.body);
        if ((!reason && !accepted) || !await maintainer(reply.user)) continue;
        // An edited reply is ordered by its edit time. Positive wording wins within one reply.
        signals.push({ at: reply.updated_at ?? reply.created_at, id: `reply:${reply.id}`,
          ...(!accepted && reason && { reason: `reply:${reason}` }) });
      }
      const latest = signals.filter(signal => Number.isFinite(Date.parse(signal.at)))
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || Number(!!b.reason) - Number(!!a.reason) || compare(a.id, b.id)).at(-1);
      if (!latest?.reason) continue;
      const findings = own.includes(comment) ? [{ path: comment.path!, body: comment.body
        .split("\n\nSuggested fix (model-generated, not tested):")[0]!.replace(/<!-- tracehound:v1 .* -->\s*$/, "") }]
        : bodyFindings(comment.body);
      for (const finding of findings) {
        if (!finding.path) continue;
        rejected.push({ ...fingerprint(finding), repo, pr: pr.number, commentId: comment.id, reason: latest.reason, url: comment.html_url });
      }
    }
  }
  return orderFeedback(rejected);
}

/** Read only the contents API; absent branch/file means no feedback. Never fetch or push git. */
export async function readFeedback(repo: string, options: LearnOptions, deps: LearnDependencies): Promise<RejectedFingerprint[]> {
  assertFeedbackRepo(repo);
  const api = new GitHub(options, deps);
  const response = await api.response(`/repos/${repo.split("/").map(encodeURIComponent).join("/")}/contents/${FILE}?ref=tracehound-data`);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error("Feedback read failed");
  const file = await response.json() as { encoding?: string; content?: string };
  if (file.encoding !== "base64" || typeof file.content !== "string") throw new Error("Invalid feedback file");
  const items: unknown = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
  if (!Array.isArray(items)) throw new Error("Invalid feedback list");
  return items.filter((item): item is RejectedFingerprint => item && item.repo === repo && typeof item.path === "string"
    && typeof item.ext === "string" && Array.isArray(item.tokens) && item.tokens.every((word: unknown) => typeof word === "string")
    && (item.ids === undefined || (Array.isArray(item.ids) && item.ids.every((id: unknown) => typeof id === "string")))
    && Number.isSafeInteger(item.pr) && item.pr > 0 && Number.isSafeInteger(item.commentId) && item.commentId > 0
    && typeof item.reason === "string" && typeof item.url === "string")
    .map(item => ({ ...item, ids: item.ids ?? [] }));
}

export interface SuppressedFinding { path: string; line: number | null; matchedComment: string; reason: string }
export function filterFeedback<T extends { path: string; line: number | null; body: string }>(findings: T[], feedback: RejectedFingerprint[]) {
  const suppression = new FeedbackSuppression(feedback), suppressed: SuppressedFinding[] = [], indexes: number[] = [];
  const kept = findings.filter((finding, i) => {
    const match = suppression.explain(finding);
    if (!match) { indexes.push(i); return true; }
    suppressed.push({ path: finding.path, line: finding.line, matchedComment: match.url, reason: match.reason });
    return false;
  });
  return { kept, suppressed, indexes };
}
