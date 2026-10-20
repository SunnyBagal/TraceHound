import { newSideLines, parseDiff } from "../../analyzer/src/review/diff.ts";
import type { FindingSource, PipelineCounts, PipelineOutput } from "./pipeline.ts";
import type { Fix, FixOutput } from "./fix.ts";
import { filterFeedback, readFeedback, type SuppressedFinding } from "./learn.ts";
import { contractsSection, placeContracts, settleContracts, type ContractDelivery, type ContractsResult, type ContractsSummary } from "./contracts.ts";

export type Reviewer = "pool-verify-v1" | "review-diff-v1";

export interface PullEvent {
  repository: { full_name: string };
  pull_request: {
    title: string;
    body: string | null;
    number: number;
    base?: { sha: string };
    head: { sha: string; repo: { full_name: string } | null };
  };
}

export interface ReviewerInput {
  title: string;
  body: string;
  number: number;
  diff: string;
}

export interface Finding {
  path: string;
  line: number | null;
  body: string;
}

export interface ReviewPayload {
  commit_id: string;
  event: "COMMENT";
  body: string;
  comments: (Finding & { line: number; side: "RIGHT"; start_line?: number; start_side?: "RIGHT" })[];
}

export interface Options {
  token: string;
  apiUrl: string;
  model: string;
  maxComments: number;
  dryRun: boolean;
  reviewer?: Reviewer;
  repoDir?: string;
  fixes?: "on" | "off";
  learn?: "on" | "off";
  contracts?: "on" | "off";
  serverUrl?: string;
}

export interface Dependencies {
  onReview?: (body: string) => Promise<void>;
  fetch: typeof fetch;
  runReviewer: (input: ReviewerInput, model: string) => Promise<unknown>;
  runPipeline: (input: ReviewerInput, model: string, repo: string, head: string) => Promise<PipelineOutput | null>;
  checkRepoHead: (repo: string, head: string) => Promise<void>;
  runFixes: (findings: Finding[], diff: string, repo: string, head: string) => Promise<FixOutput>;
  runContracts?: (repo: string, base: string, head: string) => Promise<ContractsResult>;
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
export interface ReviewData { fixes: FixOutput; sources: FindingSource[]; suppressed?: SuppressedFinding[] }

function fixBody(finding: Finding, fix: Fix | null | undefined, plain: boolean): string {
  if (!fix) return finding.body;
  if (plain && /`{3,}/.test(fix.original)) return `${finding.body}\n\nfix withheld: unsafe to render`;
  const text = plain
    ? `\`\`\`diff\n@@ -${fix.startLine},${fix.endLine - fix.startLine + 1} +${fix.startLine},${fix.replacement.split("\n").length} @@\n`
      + fix.original.split("\n").map(line => `-${line}`).join("\n") + "\n"
      + fix.replacement.split("\n").map(line => `+${line}`).join("\n") + "\n```"
    : `\`\`\`suggestion\n${fix.replacement}\n\`\`\``;
  return `${finding.body}\n\nSuggested fix (model-generated, not tested):\n${text}`;
}

function reviewFooter(findings: Finding[], commit: string, pipeline: PipelineCounts | undefined, data: ReviewData,
  reviewer: Reviewer, contracts?: ContractsSummary): string {
  const record: Record<string, unknown> = {
    version: 1, pipeline: reviewer, headSha: commit,
    ...pipeline, posted: findings.length, fixes: data.fixes.counts,
    ...(data.suppressed?.length && { suppressed: data.suppressed }),
    ...(contracts && { contracts }),
    findings: findings.map((finding, i) => ({
      path: finding.path, line: finding.line,
      ...(data.fixes.suggestions[i] && { startLine: data.fixes.suggestions[i]!.startLine }),
      source: data.sources[i]!, hasSuggestion: !!data.fixes.suggestions[i],
    })),
  };
  // Keep the HTML comment on one line even for unusual repository paths.
  const encode = () => JSON.stringify(record).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  if (encode().length + "<!-- tracehound:v1  -->".length >= 8_000) {
    delete record.findings;
    record.findingsTruncated = true;
  }
  return `<!-- tracehound:v1 ${encode()} -->`;
}

export function buildReview(
  findings: Finding[],
  diff: string,
  commit: string,
  model: string,
  maxComments: number,
  bodyOnly = false,
  reviewer: Reviewer = "review-diff-v1",
  pipeline?: PipelineCounts,
  data?: ReviewData,
  contracts?: ContractDelivery,
): ReviewPayload {
  const lines = new Map(parseDiff(diff).filter((file) => file.newPath !== null)
    .map((file) => [file.newPath!, newSideLines(file)]));
  const comments: ReviewPayload["comments"] = [];
  const body = [`TraceHound · ${reviewer} · ${model.replace(/\s+/g, " ")} · ${findings.length} findings`
    + (pipeline ? ` (pool ${pipeline.pool}, kept ${pipeline.kept})` : "")];
  const posted = findings.slice(0, maxComments);
  for (const [index, finding] of posted.entries()) {
    const fix = data?.fixes.suggestions[index];
    const line = fix?.endLine ?? finding.line;
    if (!bodyOnly && finding.body.trim() && line !== null && Number.isSafeInteger(line)
      && lines.get(finding.path)?.has(line)) {
      comments.push({ ...finding, body: fixBody(finding, fix, false), line, side: "RIGHT",
        ...(fix && fix.startLine !== fix.endLine && { start_line: fix.startLine, start_side: "RIGHT" as const }) });
    } else {
      body.push(location({ ...finding, body: fixBody(finding, fix, true) }));
    }
  }
  if (findings.length > maxComments) body.push(`${findings.length - maxComments} findings omitted by max-comments.`);
  if (data?.suppressed?.length) body.push(`${data.suppressed.length} findings suppressed by maintainer feedback (details in footer).`);
  let contractSummary: ContractsSummary | undefined;
  if (contracts) {
    const placed = placeContracts(contracts.result.findings, diff, bodyOnly);
    comments.push(...placed.inline);
    const section = contractsSection(placed.body, placed.more, contracts, commit);
    if (section) body.push(section);
    contractSummary = { status: contracts.result.status, inline: placed.inline.length, body: placed.body.length, ms: contracts.result.ms,
      ...(contracts.result.typed && { typed: contracts.result.typed }) };
  }
  body.push(footer);
  if (data && (pipeline || contracts)) body.push(reviewFooter(posted, commit, pipeline, data, reviewer, contractSummary));
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
    return typeof f.path === "string" && (typeof f.line === "number" || f.line === null)
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
  // The composite passes this env input directly; cli.ts and the frozen pipeline stay unchanged.
  const learn = options.learn ?? process.env.TRACEHOUND_LEARN ?? "off";
  if (learn !== "on" && learn !== "off") throw new Error("Invalid learn input");
  const contractsMode = options.contracts ?? "on";
  if (contractsMode !== "on" && contractsMode !== "off") throw new Error("Invalid contracts input");
  const reviewer = options.reviewer ?? "pool-verify-v1";
  if (reviewer !== "pool-verify-v1" && reviewer !== "review-diff-v1") {
    throw new Error("Invalid reviewer");
  }
  if (options.fixes !== undefined && options.fixes !== "on" && options.fixes !== "off") throw new Error("Invalid fixes input");
  if (event.repository.full_name.toLowerCase() === "calcom/cal.com") {
    deps.log("TraceHound: benchmark test-set repository refused; nothing posted.");
    return;
  }
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
  if (reviewer === "pool-verify-v1") await deps.checkRepoHead(options.repoDir ?? "", event.pull_request.head.sha);
  const repo = event.repository.full_name.split("/").map(encodeURIComponent).join("/");
  const endpoint = `/repos/${repo}/pulls/${event.pull_request.number}`;
  // Bind the fetched diff to the triggering head, even if another push arrived before this job.
  const diff = await (await github(endpoint, options, deps)).text();
  const current = await github(endpoint, options, deps, { accept: "application/vnd.github+json" });
  const metadata = await current.json() as { head?: { sha?: string }; base?: { sha?: string } };
  if (metadata.head?.sha !== event.pull_request.head.sha) {
    deps.log("TraceHound: pull request head changed; stale event skipped.");
    return;
  }
  let output: ReturnType<typeof readOutput>;
  let pipeline: PipelineCounts | undefined;
  let sources: FindingSource[] = [];
  const contractsTask = contractsMode === "on"
    ? settleContracts(deps.runContracts && (() => deps.runContracts!(options.repoDir ?? "",
      event.pull_request.base?.sha ?? metadata.base?.sha ?? "", event.pull_request.head.sha)), deps.log)
    : Promise.resolve<ContractsResult>({ status: "off", findings: [], ms: 0 });
  try {
    if (reviewer === "pool-verify-v1") {
      const result = await deps.runPipeline(buildInput(event, diff), options.model, options.repoDir ?? "", event.pull_request.head.sha);
      if (!result) { await contractsTask; return; }
      pipeline = result.pipeline;
      sources = result.sources;
      output = readOutput(result);
    } else {
      output = readOutput(await deps.runReviewer(buildInput(event, diff), options.model));
      sources = output.comments.map(() => "diff");
    }
  } catch {
    await contractsTask;
    deps.log("TraceHound: reviewer failed or returned invalid output; nothing posted.");
    return;
  }
  const contractsResult = await contractsTask;
  const contracts: ContractDelivery | undefined = contractsMode === "on" ? { result: contractsResult,
    repo: event.repository.full_name, serverUrl: options.serverUrl ?? "https://github.com" } : undefined;
  if (output.failed) {
    deps.log("TraceHound: reviewer reported failed chunks; nothing posted.");
    return;
  }
  // Only model findings are deduplicated, capped, learned from, and sent to fix generation.
  if (contractsResult.findings.length) {
    const retained = output.comments.map((finding, index) => ({ finding, index })).filter(({ finding }) =>
      !contractsResult.findings.some(contract => contract.path === finding.path && contract.line !== null && finding.line !== null
        && Math.abs(contract.line - finding.line) <= 3));
    output.comments = retained.map(({ finding }) => finding);
    sources = retained.map(({ index }) => sources[index]!);
  }
  let suppressed: SuppressedFinding[] | undefined;
  if (learn === "on" && reviewer === "pool-verify-v1" && output.comments.length) {
    const filtered = filterFeedback(output.comments, await readFeedback(event.repository.full_name, options, deps));
    output.comments = filtered.kept;
    sources = filtered.indexes.map(index => sources[index]!);
    suppressed = filtered.suppressed;
  }
  if (!output.comments.length && !suppressed?.length && !contractsResult.findings.length) {
    deps.log("TraceHound: reviewer returned no findings; nothing posted.");
    return;
  }
  const model = output.model || options.model || "reviewer default";
  let data: ReviewData | undefined;
  if (reviewer === "pool-verify-v1" && options.fixes !== "off") {
    const posted = output.comments.slice(0, options.maxComments);
    try {
      data = { fixes: await deps.runFixes(posted, diff, options.repoDir ?? "", event.pull_request.head.sha), sources };
    } catch {
      deps.log("TraceHound: fix stage failed; posting findings without suggestions.");
      data = { sources, fixes: { suggestions: posted.map(() => null),
        counts: { attempted: posted.length, valid: 0, rejected: posted.length } } };
    }
  }
  if (suppressed?.length) {
    data ??= { sources, fixes: { suggestions: output.comments.slice(0, options.maxComments).map(() => null),
      counts: { attempted: 0, valid: 0, rejected: 0 } } };
    data.suppressed = suppressed;
  }
  if (contracts) data ??= { sources, fixes: { suggestions: output.comments.slice(0, options.maxComments).map(() => null),
    counts: { attempted: 0, valid: 0, rejected: 0 } } };
  let payload = buildReview(output.comments, diff, event.pull_request.head.sha, model, options.maxComments, false, reviewer, pipeline, data, contracts);
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
    const fallback = buildReview(output.comments, diff, event.pull_request.head.sha, model, options.maxComments, true, reviewer, pipeline, data, contracts);
    if (!await canPost()) return;
    await github(`${endpoint}/reviews`, options, deps, { payload: fallback });
    payload = fallback;
  }
  if (deps.onReview) {
    try { await deps.onReview(payload.body); }
    catch { deps.log("TraceHound: review metadata could not be saved."); }
  }
  deps.log(`TraceHound: posted review with ${Math.min(output.comments.length, options.maxComments)} findings.`);
}
