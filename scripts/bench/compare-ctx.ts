// review-ctx-v1 beside review-diff-v1 on the dev repos (decision 057), as Markdown tables of counts
// only: overall and per repo, per pull request TP/FP (golden index), context statistics, and each
// reviewer's own record. Reads score summaries and details and review files; never prints comment,
// golden or context text. Cal.com is not read.
//   node scripts/bench/compare-ctx.ts [--bench ~/Projects/tracehound-bench] [--model nemotron-3-super-120b-a12b]
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { addCounts, metrics, zeroCounts, type Counts } from "../../packages/analyzer/src/bench/score.ts";

const DEV_REPOS = ["sentry", "grafana", "keycloak", "discourse"];
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const bench = arg("--bench") ?? join(homedir(), "Projects/tracehound-bench");
const model = arg("--model") ?? "nemotron-3-super-120b-a12b";
const RUNS = [`review-diff-v1/${model}`, `review-ctx-v1/${model}`];

const pct = (x: number) => (Number.isFinite(x) ? `${(100 * x).toFixed(1)}%` : "n/a");
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : 0;
};
const label = (run: string, repo: string) => join(bench, "scores", `${run.replaceAll("/", "-")}-${repo}`);

interface Summary {
  counts: Counts;
  pulls: { scored: number; judgeFailed: number };
  usage: { calls: number; costUSD: number };
}
interface Detail {
  detail: { goldenIndex: number; status: string; counts: Counts }[];
}

const row = (name: string, c: Counts, jf: number) => {
  const m = metrics(c);
  return `| ${name} | ${c.comments} | ${c.tp} | ${c.fp} | ${c.duplicates} | ${c.lowMatched} | ${c.fn} | ${jf} | ${pct(m.precision)} (${c.tp}/${c.tp + c.fp}) | ${pct(m.recall)} (${c.tp}/${c.tp + c.fn}) | ${pct(m.f)} |`;
};

console.log("| run · repo | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |\n|---|---|---|---|---|---|---|---|---|---|---|");
const perPull = new Map<string, Map<string, Counts | null>>();
const judge: Record<string, { calls: number; cost: number }> = {};
for (const run of RUNS) {
  let all = zeroCounts();
  let jf = 0;
  judge[run] = { calls: 0, cost: 0 };
  const lines: string[] = [];
  for (const repo of DEV_REPOS) {
    const s = JSON.parse(readFileSync(`${label(run, repo)}.summary.json`, "utf8")) as Summary;
    const d = JSON.parse(readFileSync(`${label(run, repo)}.detail.json`, "utf8")) as Detail;
    all = addCounts(all, s.counts);
    jf += s.pulls.judgeFailed;
    judge[run]!.calls += s.usage.calls;
    judge[run]!.cost += s.usage.costUSD;
    lines.push(row(`${run.split("/")[0]} · ${repo}`, s.counts, s.pulls.judgeFailed));
    for (const p of d.detail) {
      const key = `${repo} ${p.goldenIndex}`;
      if (!perPull.has(key)) perPull.set(key, new Map());
      perPull.get(key)!.set(run, p.status === "JUDGE_FAILED" ? null : p.counts);
    }
  }
  console.log(row(`**${run.split("/")[0]} · overall**`, all, jf));
  for (const l of lines) console.log(l);
}

console.log("\n| repo | golden index | diff-v1 TP | diff-v1 FP | ctx-v1 TP | ctx-v1 FP |\n|---|---|---|---|---|---|");
const keys = [...perPull.keys()].sort((a, b) => {
  const [ra, ia] = a.split(" ");
  const [rb, ib] = b.split(" ");
  return DEV_REPOS.indexOf(ra!) - DEV_REPOS.indexOf(rb!) || Number(ia) - Number(ib);
});
for (const k of keys) {
  const m = perPull.get(k)!;
  const cell = (run: string) => {
    const c = m.get(run);
    return c === undefined ? "– | –" : c === null ? "JF | JF" : `${c.tp} | ${c.fp}`;
  };
  const [repo, g] = k.split(" ");
  console.log(`| ${repo} | ${g} | ${cell(RUNS[0]!)} | ${cell(RUNS[1]!)} |`);
}

// reviewers' own records
interface Rec {
  comments: unknown[];
  review: {
    chunks: unknown[];
    chunkFailed: number;
    findings: number;
    dropped: Record<string, number>;
    usage: { calls: number; cached: number; inputTokens: number; outputTokens: number; costUSD: number };
    wallMs: number;
    context?: { chars: number; names: string[]; references: { matches: number; selected: number; shown: number }; cut: { references: number; filesToWindows: number; filesDropped: number }; files: { status: string }[] }[];
  };
}
console.log("\n| run | pulls | chunks | calls (cached) | CHUNK_FAILED | findings | kept | dropped by reason | input tokens | output tokens | cost | wall per PR median / max |\n|---|---|---|---|---|---|---|---|---|---|---|---|");
let ctxRecs: Rec[] = [];
for (const run of RUNS) {
  const recs: Rec[] = DEV_REPOS.flatMap((repo) => {
    const dir = join(bench, "reviews", run, repo);
    return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Rec);
  });
  if (run === RUNS[1]) ctxRecs = recs;
  const sum = (f: (r: Rec) => number) => recs.reduce((a, r) => a + f(r), 0);
  const dropped: Record<string, number> = {};
  for (const r of recs) for (const [k, v] of Object.entries(r.review.dropped)) dropped[k] = (dropped[k] ?? 0) + v;
  const wall = recs.map((r) => r.review.wallMs);
  console.log(
    `| ${run.split("/")[0]} | ${recs.length} | ${sum((r) => r.review.chunks.length)} | ${sum((r) => r.review.usage.calls)} (${sum((r) => r.review.usage.cached)}) | ${sum((r) => r.review.chunkFailed)} | ` +
      `${sum((r) => r.review.findings)} | ${sum((r) => r.comments.length)} | ${Object.entries(dropped).map(([k, v]) => `${k} ${v}`).join(", ")} | ` +
      `${sum((r) => r.review.usage.inputTokens)} | ${sum((r) => r.review.usage.outputTokens)} | $${sum((r) => r.review.usage.costUSD).toFixed(4)} | ` +
      `${(median(wall) / 1000).toFixed(1)} s / ${(Math.max(...wall) / 1000).toFixed(1)} s |`,
  );
}
console.log("\n| judge on | calls | cost |\n|---|---|---|");
for (const run of RUNS) console.log(`| ${run.split("/")[0]} | ${judge[run]!.calls} | $${judge[run]!.cost.toFixed(4)} |`);

const chunks = ctxRecs.flatMap((r) => r.review.context ?? []);
const cutAny = chunks.filter((c) => c.cut.references + c.cut.filesToWindows + c.cut.filesDropped > 0);
const statuses: Record<string, number> = {};
for (const c of chunks) for (const f of c.files) statuses[f.status] = (statuses[f.status] ?? 0) + 1;
console.log("\n| context statistic (review-ctx-v1, per chunk) | median | max | total |\n|---|---|---|---|");
for (const [name, f] of [
  ["characters", (c: (typeof chunks)[number]) => c.chars],
  ["changed names", (c: (typeof chunks)[number]) => c.names.length],
  ["reference matches found", (c: (typeof chunks)[number]) => c.references.matches],
  ["references selected (caps 8 / 30)", (c: (typeof chunks)[number]) => c.references.selected],
  ["references shown after the budget", (c: (typeof chunks)[number]) => c.references.shown],
] as const) {
  const xs = chunks.map(f);
  console.log(`| ${name} | ${median(xs)} | ${Math.max(...xs)} | ${xs.reduce((a, b) => a + b, 0)} |`);
}
console.log(
  `\nchunks ${chunks.length} · budget cut something in ${cutAny.length} · references dropped in ${chunks.filter((c) => c.cut.references).length} · ` +
    `files cut to windows in ${chunks.filter((c) => c.cut.filesToWindows).length} · files dropped in ${chunks.filter((c) => c.cut.filesDropped).length} · ` +
    `chunks with at least one reference shown ${chunks.filter((c) => c.references.shown).length} · chunks with no changed name ${chunks.filter((c) => !c.names.length).length}`,
);
console.log(`changed-file entries by status: ${Object.entries(statuses).sort().map(([k, v]) => `${k} ${v}`).join(" · ")}`);
