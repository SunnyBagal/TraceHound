// Identity test for pool-verify-v1: both reviewers, the pool, verify-ctx-v1 and the Action's
// comment/cap step, run end to end through runPipeline and runAction. The analyzer CLIs are
// replaced by in-process calls with a scripted ChatClient, over an invented mini-repo. No model,
// no network. The snapshot pins today's default behaviour; default-off options must not change it.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, expect, it, vi } from "vitest";
import type { ChatClient } from "../../analyzer/src/agent/decider.ts";
import { PullReview } from "../../analyzer/src/bench/types.ts";
import { cleanGitEnv } from "../../analyzer/src/git-env.ts";
import type { ChatRequest, ChatResult } from "../../analyzer/src/llm/client.ts";
import { gitSource } from "../../analyzer/src/review/context.ts";
import { REVIEW_CTX_SYSTEM_PROMPT } from "../../analyzer/src/review/prompt-ctx.ts";
import { reviewPullWithContext } from "../../analyzer/src/review/review-ctx.ts";
import { reviewPull, type PullInput } from "../../analyzer/src/review/review.ts";
import { VERIFY_CTX_SYSTEM_PROMPT } from "../../analyzer/src/review/verify-ctx-prompt.ts";
import { keptReview, verifyReviewWithContext } from "../../analyzer/src/review/verify-ctx.ts";
import { runAction, type Finding, type Options, type PullEvent, type ReviewPayload } from "../src/action.ts";
import { checkRepoHead, runPipeline, type Execute } from "../src/pipeline.ts";

const repos: string[] = [];
afterAll(() => repos.forEach((r) => rmSync(r, { recursive: true, force: true })));

const FILES = ["a", "b", "c", "d", "e"];
/** Five files whose diffs are each over half the 60,000-character chunk limit: one chunk per file. */
function miniRepo(): { dir: string; head: string; diff: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "tracehound-identity-"));
  repos.push(dir);
  const env = { ...cleanGitEnv(), GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z" };
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", env });
  mkdirSync(path.join(dir, "src"));
  const write = (head: boolean) => {
    for (const f of FILES) {
      const filler = Array.from({ length: 1200 }, (_, i) => `// filler line ${String(i + 1).padStart(4, "0")} of ${f}`);
      writeFileSync(path.join(dir, "src", `${f}.ts`), ["export const base = 0;", ...(head ? filler : [])].join("\n") + "\n");
    }
  };
  git("init", "-q", "-b", "main");
  write(false);
  git("add", "-A");
  git("commit", "-qm", "base");
  write(true);
  git("add", "-A");
  git("commit", "-qm", "head");
  return { dir, head: git("rev-parse", "HEAD").trim(), diff: git("diff", "--no-color", "HEAD~1", "HEAD") };
}

const json = (findings: { path: string; line: number | null; body: string }[]) => JSON.stringify({ findings });
const reply = (content: string, finishReason = "stop"): ChatResult => ({
  content, finishReason, cached: false, latencyMs: 0, inputTokens: 100, outputTokens: 50, reasoningTokens: 10, costUSD: 0,
});

/** Scripted model: the reply depends only on the chunk's file, the reviewer and the finding body. */
const stub: ChatClient = {
  async chat(request: ChatRequest): Promise<ChatResult> {
    const user = String(request.messages[1]!.content);
    const system = request.messages[0]!.content;
    if (system === VERIFY_CTX_SYSTEM_PROMPT) {
      if (user.includes("verifier drops")) return reply(JSON.stringify({ verdict: "drop", reason: "stub drop" }));
      if (user.includes("verifier reply invalid")) return reply("not json");
      return reply(JSON.stringify({ verdict: "keep", reason: "stub keep" }));
    }
    const ctx = system === REVIEW_CTX_SYSTEM_PROMPT;
    const file = /diff --git a\/src\/(\w)\.ts/.exec(user)![1]!;
    const thinking = (request.chat_template_kwargs as { enable_thinking?: boolean } | undefined)?.enable_thinking;
    switch (file) {
      case "a":
        return reply(json([
          ...(ctx ? [] : [{ path: "src/a.ts", line: 2, body: "A2 diff finding" }]),
          { path: "src/a.ts", line: null, body: "A file-level finding" },
        ]));
      case "b":
        return reply('Here is my review:\n```json\n' + json([{ path: "src/b.ts", line: 4, body: "B4 fenced finding" }]) + "\n```\nThanks.");
      case "c":
        if (thinking === false) return reply(json([{ path: "src/c.ts", line: 5, body: "C5 after a fresh retry" }]));
        return reply('{"findings":[{"path":"src/c.ts","line":5,"body":"C5 cut', "length");
      case "d":
        return reply("");
      default:
        return reply(json(ctx
          ? [{ path: "src/e.ts", line: 41, body: "E41 both reviewers (ctx)" }, { path: "src/e.ts", line: 100, body: "E100 ctx only" }]
          : [
              { path: "src/e.ts", line: 10, body: "E10 verifier drops this" },
              { path: "src/e.ts", line: 20, body: "E20 verifier reply invalid" },
              { path: "src/e.ts", line: 30, body: "E30 kept" },
              { path: "src/e.ts", line: 40, body: "E40 both reviewers" },
            ]));
    }
  },
};

/** The analyzer CLIs (review, review-ctx, verify-ctx) in process, writing what they write. */
function inProcess(outputs: Record<string, unknown>): Execute {
  return async (file, args) => {
    if (file === "git") return execFileSync("git", args, { env: cleanGitEnv() });
    const command = args[1]!;
    const value = (flag: string) => args[args.indexOf(flag) + 1]!;
    const pr = JSON.parse(readFileSync(value("--pr"), "utf8"));
    const input: PullInput = { title: pr.title, description: pr.body ?? "", diff: pr.diff, number: pr.number };
    const opts = { model: value("--model"), reasoning: "on" as const };
    const write = (name: string, file: string, data: unknown) => {
      outputs[name] = data;
      writeFileSync(file, JSON.stringify(data, null, 1) + "\n");
    };
    if (command === "review") write("review", value("--out"), await reviewPull(stub, input, opts));
    else {
      const repo = { source: gitSource(value("--repo"), value("--head")), head: value("--head") };
      if (command === "review-ctx") write("review-ctx", value("--out"), await reviewPullWithContext(stub, input, repo, opts));
      else {
        const review = PullReview.parse(JSON.parse(readFileSync(value("--review"), "utf8")));
        const v = await verifyReviewWithContext(stub, input, review, repo, { ...opts, concurrency: 4 });
        write("verify-ctx", value("--out"), v);
        write("kept", value("--kept"), keptReview(v));
      }
    }
    return {};
  };
}

it("pool-verify-v1 end to end: payload, footer, log and every stage record match the identity snapshot", async () => {
  const repo = miniRepo();
  const outputs: Record<string, unknown> = {};
  const posts: ReviewPayload[] = [];
  const log = vi.fn();
  const exec = inProcess(outputs);
  const event: PullEvent = { repository: { full_name: "example/widget" }, pull_request: {
    title: "Synthetic PR", body: "Synthetic description", number: 7, head: { sha: repo.head, repo: { full_name: "example/widget" } },
  } };
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    if (init?.method === "POST") {
      posts.push(JSON.parse(String(init.body)));
      return Response.json({});
    }
    return new Headers(init?.headers).get("Accept") === "application/vnd.github.diff"
      ? new Response(repo.diff) : Response.json({ head: { sha: repo.head } });
  });
  const options: Options = { token: "fake-unused", apiUrl: "https://api.example.invalid", model: "fake-model",
    contracts: "off", fixes: "on", repoDir: repo.dir, maxComments: 3, dryRun: false };
  await runAction(event, options, {
    fetch, log, runReviewer: vi.fn(),
    runFixes: async (findings: Finding[]) => ({ suggestions: findings.map(() => null),
      counts: { attempted: findings.length, valid: 0, rejected: findings.length } }),
    checkRepoHead: (dir: string, head: string) => checkRepoHead(dir, head, exec),
    runPipeline: (pr, model, dir, head) => runPipeline(pr, model, dir, head, log, exec),
  });
  const volatile = new Set(["wallMs", "latencyMs"]);
  const text = JSON.stringify({ log: log.mock.calls, posts, outputs },
    (key, v) => (volatile.has(key) ? 0 : v), 1).replaceAll(repo.head, "<head>").replaceAll(repo.dir, "<repo>");
  await expect(text + "\n").toMatchFileSnapshot("./__snapshots__/pool-verify-identity.json");
}, 60_000);
