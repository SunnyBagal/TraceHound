// Decision 071, before dev runs 10–11: one probe call and a 3-PR smoke of Nemotron 3 Ultra on the free
// NVIDIA API, through the client the runner builds (buildClients with the NVIDIA route) and the same
// pipeline function as run 10. No judge, so no Nebius spend. Prints counts only (status, finish
// reasons, token counts, failed chunks, finding counts), never reply, title or diff text; records go
// to a new directory in the bench folder, never over a file. Dev pull requests only.
//   node scripts/bench/ultra-smoke.ts probe
//   node scripts/bench/ultra-smoke.ts smoke [--prs sentry/0,grafana/0,keycloak/0] [--bench <dir>]
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ChatClient } from "../../packages/analyzer/src/agent/decider.ts";
import { NVIDIA_API_MODEL, nvidiaApiFromEnv, type ChatResult } from "../../packages/analyzer/src/llm/client.ts";
import { gitSource } from "../../packages/analyzer/src/review/context.ts";
import type { PullInput } from "../../packages/analyzer/src/review/review.ts";
import { buildClients, pipeline, writeNew } from "./run-test-set.ts";
import { DEV_REPOS, inputPaths, modelSlug } from "./test-set.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const arg = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const mode = process.argv[2];
const bench = arg("--bench") ?? join(homedir(), "Projects/tracehound-bench");
try {
  process.loadEnvFile(join(ROOT, ".env"));
} catch {}
const apiKey = process.env.NEBIUS_API_KEY;
if (!apiKey) throw new Error("NEBIUS_API_KEY is not set");
const nvidiaApi = nvidiaApiFromEnv({ ...process.env, TRACEHOUND_NVIDIA_API: "1" });
// allowance $0.01: nothing here should cost anything on Token Factory
const { reviewer } = buildClients({ apiKey, stateDir: join(ROOT, ".tracehound"), pricesFile: join(ROOT, "config/prices.json"), allowanceUSD: 0.01, env: process.env, nvidiaApi });

interface CallStat {
  purpose: string;
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  reasoningChars?: number;
  contentChars: number;
  latencyMs: number;
  maxTokens: number;
  error?: string;
}
const calls: CallStat[] = [];
const recording: ChatClient = {
  chat: async (request, meta) => {
    try {
      const r: ChatResult = await reviewer.chat(request, meta);
      calls.push({ purpose: meta.purpose, finishReason: r.finishReason, inputTokens: r.inputTokens, outputTokens: r.outputTokens, reasoningTokens: r.reasoningTokens, reasoningChars: r.reasoningChars, contentChars: r.content.length, latencyMs: r.latencyMs, maxTokens: request.max_tokens });
      return r;
    } catch (e) {
      calls.push({ purpose: meta.purpose, contentChars: 0, latencyMs: 0, maxTokens: request.max_tokens, error: `${(e as Error).name}: ${(e as Error).message.split("\n")[0]!.slice(0, 200)}` });
      throw e;
    }
  },
};

if (mode === "probe") {
  const started = new Date().toISOString();
  const request = { model: NVIDIA_API_MODEL, temperature: 0, max_tokens: 2000, messages: [{ role: "user" as const, content: "Reply with the single word OK." }], chat_template_kwargs: { enable_thinking: true } };
  try {
    const r = await recording.chat(request, { purpose: "ultra-probe-071" });
    console.log(`probe sent ${started} · status 200 · finish ${r.finishReason} · prompt ${r.inputTokens} · completion ${r.outputTokens} · reasoning tokens ${r.reasoningTokens ?? "not reported"} · reasoning chars ${r.reasoningChars ?? "none"} · content chars ${r.content.length} · $${r.costUSD.toFixed(4)} · ${(r.latencyMs / 1000).toFixed(1)} s · 429s ${reviewer.nvidiaApiStats.http429}`);
  } catch (e) {
    console.log(`probe sent ${started} · FAILED ${calls.at(-1)?.error}`);
    process.exitCode = 1;
  }
} else if (mode === "smoke") {
  const picks = (arg("--prs") ?? "sentry/0,grafana/0,keycloak/0").split(",");
  const dir = join(bench, "reviews/dev-repeat", `smoke-071-${modelSlug(NVIDIA_API_MODEL)}`);
  for (const pick of picks) {
    const [repo, n] = pick.split("/");
    if (!(DEV_REPOS as readonly string[]).includes(repo!)) throw new Error(`dev pull requests only: ${pick}`);
    const p = inputPaths(bench, "dev", repo!);
    const j = JSON.parse(readFileSync(join(p.prs, `${n}.json`), "utf8")) as { title: string; body?: string; description?: string; diff: string; number?: number };
    const input: PullInput = { title: j.title, description: j.description ?? j.body ?? "", diff: j.diff, ...(typeof j.number === "number" && { number: j.number }) };
    const head = (JSON.parse(readFileSync(p.heads, "utf8")) as Record<string, { head: string }>)[n!]!.head;
    const before = calls.length;
    const a = await pipeline(recording, input, { source: gitSource(p.gitDir, head), head }, NVIDIA_API_MODEL);
    writeNew(join(dir, repo!, `${n}.attempt-1.json`), a);
    const mine = calls.slice(before);
    const failedChunks = [...a.diff.review.chunks.map((c, i) => [`diff#${i}`, c.failure] as const), ...a.ctx.review.chunks.map((c, i) => [`ctx#${i}`, c.failure] as const)].filter(([, f]) => f);
    const verifyFailed = [...a.diffVerdicts.comments, ...a.ctxOnlyVerdicts.comments].filter((c) => c.failure).length;
    const trunc = mine.filter((c) => c.finishReason === "length").length;
    const sum = (k: "outputTokens" | "reasoningTokens" | "inputTokens") => mine.reduce((s, c) => s + (c[k] ?? 0), 0);
    console.log(
      `${pick}: calls ${mine.length} (errors ${mine.filter((c) => c.error).length}) · failed chunks ${failedChunks.length} [${failedChunks.map(([id, f]) => `${id}: ${f!.slice(0, 120)}`).join("; ")}] · VERIFY_FAILED ${verifyFailed} · findings diff ${a.diff.comments.length} ctx ${a.ctx.comments.length} ctx-only ${a.ctxOnly.length} kept ${a.kept.length} · finish_reason length ${trunc} · tokens in ${sum("inputTokens")} out ${sum("outputTokens")} reasoning ${sum("reasoningTokens")} · wall ${(a.wallMs / 1000).toFixed(0)} s · request failures ${a.requestFailures}`,
    );
    for (const c of mine.filter((x) => x.error)) console.log(`  error (${c.purpose}): ${c.error}`);
  }
  console.log(`NVIDIA API: requests ${reviewer.nvidiaApiStats.requests} · HTTP 429 ${reviewer.nvidiaApiStats.http429}`);
} else {
  console.error("usage: node scripts/bench/ultra-smoke.ts probe | smoke [--prs repo/n,...] [--bench <dir>]");
  process.exitCode = 1;
}
