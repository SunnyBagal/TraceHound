import { newSideLines, parseDiff } from "../../analyzer/src/review/diff.ts";

export interface PullEvent {
  repository: { full_name: string };
  pull_request: {
    title: string;
    body: string | null;
    number: number;
    head: { sha: string; repo: { full_name: string } | null };
  };
}

export interface ReviewerInput {
  title: string;
  body: string;
  number: number;
  diff: string;
}

interface Finding {
  path: string;
  line: number;
  body: string;
}

export interface ReviewPayload {
  commit_id: string;
  event: "COMMENT";
  body: string;
  comments: (Finding & { side: "RIGHT" })[];
}

export interface Options {
  token: string;
  apiUrl: string;
  model: string;
  maxComments: number;
  dryRun: boolean;
}

export interface Dependencies {
  fetch: typeof fetch;
  runReviewer: (input: ReviewerInput, model: string) => Promise<unknown>;
  log: (message: string) => void;
}

class GitHubError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`GitHub API returned HTTP ${status}`);
    this.status = status;
  }
}

async function github(
  endpoint: string,
  options: Options,
  deps: Dependencies,
  request: { payload?: ReviewPayload; accept?: string } = {},
): Promise<Response> {
  const { payload } = request;
  const response = await deps.fetch(`${options.apiUrl.replace(/\/$/, "")}${endpoint}`, {
    method: payload ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${options.token}`,
      Accept: request.accept ?? (payload ? "application/vnd.github+json" : "application/vnd.github.diff"),
      "X-GitHub-Api-Version": "2022-11-28",
      ...(payload && { "Content-Type": "application/json" }),
    },
    ...(payload && { body: JSON.stringify(payload) }),
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new GitHubError(response.status);
  return response;
}

export function buildInput(event: PullEvent, diff: string): ReviewerInput {
  const pr = event.pull_request;
  return { title: pr.title, body: pr.body ?? "", number: pr.number, diff };
}

const footer = "These comments are model-generated and unverified.";
const location = (finding: Finding) => `${finding.path}:${finding.line}\n${finding.body}`;

export function buildReview(
  findings: Finding[],
  diff: string,
  commit: string,
  model: string,
  maxComments: number,
  bodyOnly = false,
): ReviewPayload {
  const lines = new Map(parseDiff(diff).filter((file) => file.newPath !== null)
    .map((file) => [file.newPath!, newSideLines(file)]));
  const comments: ReviewPayload["comments"] = [];
  const body = [`TraceHound · ${model.replace(/\s+/g, " ")} · ${findings.length} findings`];
  for (const finding of findings.slice(0, maxComments)) {
    if (!bodyOnly && finding.body.trim() && Number.isSafeInteger(finding.line)
      && lines.get(finding.path)?.has(finding.line)) {
      comments.push({ ...finding, side: "RIGHT" });
    } else {
      body.push(location(finding));
    }
  }
  if (findings.length > maxComments) body.push(`${findings.length - maxComments} findings omitted by max-comments.`);
  body.push(footer);
  return { commit_id: commit, event: "COMMENT", body: body.join("\n\n"), comments };
}

function readOutput(output: unknown): { comments: Finding[]; model?: string; failed: boolean } {
  if (!output || typeof output !== "object" || !("comments" in output) || !Array.isArray(output.comments)) {
    throw new Error("Reviewer output has no comments array");
  }
  const record = output as { comments: unknown[]; review?: { model?: unknown; chunkFailed?: unknown } };
  const comments = record.comments.filter((item): item is Finding => {
    if (!item || typeof item !== "object") return false;
    const f = item as Partial<Finding>;
    return typeof f.path === "string" && typeof f.line === "number"
      && typeof f.body === "string" && !!f.body.trim();
  }).map(({ path, line, body }) => ({ path, line, body }));
  return {
    comments,
    model: typeof record.review?.model === "string" ? record.review.model : undefined,
    failed: typeof record.review?.chunkFailed === "number" && record.review.chunkFailed > 0,
  };
}

/** All effects are injected: tests never run the real reviewer or GitHub API. */
export async function runAction(event: PullEvent, options: Options, deps: Dependencies): Promise<void> {
  if (event.pull_request.head.repo?.full_name !== event.repository.full_name) {
    deps.log("TraceHound: fork pull request skipped.");
    return;
  }
  if (!Number.isSafeInteger(options.maxComments) || options.maxComments < 0) {
    throw new Error("max-comments must be a non-negative integer");
  }
  if (!options.maxComments) {
    deps.log("TraceHound: max-comments is 0; nothing to post.");
    return;
  }
  const repo = event.repository.full_name.split("/").map(encodeURIComponent).join("/");
  const endpoint = `/repos/${repo}/pulls/${event.pull_request.number}`;
  // Bind the fetched diff to the triggering head, even if another push arrived before this job.
  const diff = await (await github(endpoint, options, deps)).text();
  const current = await github(endpoint, options, deps, { accept: "application/vnd.github+json" });
  const metadata = await current.json() as { head?: { sha?: string } };
  if (metadata.head?.sha !== event.pull_request.head.sha) {
    deps.log("TraceHound: pull request head changed; stale event skipped.");
    return;
  }
  let output: ReturnType<typeof readOutput>;
  try {
    output = readOutput(await deps.runReviewer(buildInput(event, diff), options.model));
  } catch {
    deps.log("TraceHound: reviewer failed or returned invalid output; nothing posted.");
    return;
  }
  if (output.failed) {
    deps.log("TraceHound: reviewer reported failed chunks; nothing posted.");
    return;
  }
  if (!output.comments.length) {
    deps.log("TraceHound: reviewer returned no findings; nothing posted.");
    return;
  }
  const model = output.model || options.model || "reviewer default";
  const payload = buildReview(output.comments, diff, event.pull_request.head.sha, model, options.maxComments);
  if (options.dryRun) {
    deps.log(JSON.stringify(payload, null, 2));
    return;
  }
  const canPost = async (): Promise<boolean> => {
    const current = await github(endpoint, options, deps, { accept: "application/vnd.github+json" });
    const metadata = await current.json() as { head?: { sha?: string } };
    if (metadata.head?.sha === event.pull_request.head.sha) return true;
    deps.log("TraceHound: pull request head changed during review; nothing posted.");
    return false;
  };
  if (!await canPost()) return;
  try {
    await github(`${endpoint}/reviews`, options, deps, { payload });
  } catch (error) {
    if (!(error instanceof GitHubError) || error.status !== 422 || !payload.comments.length) throw error;
    deps.log("TraceHound: GitHub rejected inline comments; retrying as a body-only review.");
    const fallback = buildReview(output.comments, diff, event.pull_request.head.sha, model, options.maxComments, true);
    if (!await canPost()) return;
    await github(`${endpoint}/reviews`, options, deps, { payload: fallback });
  }
  deps.log(`TraceHound: posted review with ${Math.min(output.comments.length, options.maxComments)} findings.`);
}
