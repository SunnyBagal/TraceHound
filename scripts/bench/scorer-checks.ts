// Scorer checks (decision 060): bench-judge-x1 re-judging, the deduplicated bench-judge-v1 FP set,
// validity-v1 on Super and Qwen, and the tables. Dev repos only; Cal.com is not in DEV_REPOS and is
// never read. stdout gets counts only, never comment, golden or reason text, or titles.
//   judge:    per run and dev repo, `tracehound bench score` with bench-judge-x1 (Qwen, no reasoning
//             field; fresh requests) → <bench>/scores/judge-x1/<label>-<repo>.{detail,summary}.json
//             (an existing summary is skipped, so a stopped job resumes)
//   fps:      the deduplicated FP set from the bench-judge-v1 details → <bench>/scores/validity-v1/fps.json
//   validity: `tracehound bench validity` with Super (reasoning on) and Qwen (no reasoning field)
//             → <bench>/scores/validity-v1/{super,qwen}.json
//   tables:   Markdown tables (counts only)
//   node scripts/bench/scorer-checks.ts judge|fps|validity|tables [--bench ~/Projects/tracehound-bench]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { addCounts, metrics, zeroCounts, type CommentOutcome, type Counts, type PullDetail } from "../../packages/analyzer/src/bench/score.ts";
import type { ValidityFile } from "../../packages/analyzer/src/bench/validity-cli.ts";
import { VERDICTS, type FpItem, type Verdict } from "../../packages/analyzer/src/bench/validity.ts";
import { augmentedPrecision, cohenKappa, dedupFps, DEV_REPOS, fpKey, kendallTauB, type RunFps } from "./scorer-checks-lib.ts";

const arg = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const bench = arg("--bench") ?? join(homedir(), "Projects/tracehound-bench");
const bin = resolve(import.meta.dirname, "../../packages/analyzer/src/bin.ts");
const MODEL = "nemotron-3-super-120b-a12b";
export const QWEN = "Qwen/Qwen3-235B-A22B-Instruct-2507";
export const SUPER = "nvidia/nemotron-3-super-120b-a12b";

interface Run {
  name: string;
  kind: "tool" | "tracehound";
  /** score label prefix in scores/ (bench-judge-v1) and scores/judge-x1/ */
  label: string;
  reviews: (repo: string) => string;
}
const TOOLS = ["greptile", "coderabbit", "augment", "cursor", "copilot"];
export const RUNS: Run[] = [
  ...TOOLS.map((t): Run => ({ name: t, kind: "tool", label: t, reviews: (r) => join(bench, "reviews", t, r) })),
  { name: "review-diff-v1", kind: "tracehound", label: `review-diff-v1-${MODEL}`, reviews: (r) => join(bench, "reviews/review-diff-v1", MODEL, r) },
  { name: "review-ctx-v1", kind: "tracehound", label: `review-ctx-v1-${MODEL}`, reviews: (r) => join(bench, "reviews/review-ctx-v1", MODEL, r) },
  { name: "verify-ctx-v1", kind: "tracehound", label: "verify-ctx-v1-super", reviews: (r) => join(bench, "reviews/verify-ctx-v1/super", r, "kept") },
  { name: "agree-diff-ctx", kind: "tracehound", label: "agree-diff-ctx-super", reviews: (r) => join(bench, "reviews/agree-diff-ctx/super", r) },
  { name: "pool-raw", kind: "tracehound", label: "pool-raw-super", reviews: (r) => join(bench, "reviews/pool-raw/super", r) },
  { name: "pool-verify-v1", kind: "tracehound", label: "pool-verify-v1-super", reviews: (r) => join(bench, "reviews/pool-verify-v1/super", r) },
];

const v1Base = (run: Run, repo: string) => join(bench, "scores", `${run.label}-${repo}`);
const x1Base = (run: Run, repo: string) => join(bench, "scores/judge-x1", `${run.label}-${repo}`);
const validityDir = join(bench, "scores/validity-v1");
const readJson = <T>(f: string) => JSON.parse(readFileSync(f, "utf8")) as T;
interface Summary {
  counts: Counts;
  pulls: { scored: number; judgeFailed: number };
  usage: { calls: number; cached: number; inputTokens: number; outputTokens: number; costUSD: number };
}
const details = (base: string) => readJson<{ detail: PullDetail[] }>(`${base}.detail.json`).detail;

function judge() {
  mkdirSync(join(bench, "scores/judge-x1"), { recursive: true });
  for (const run of RUNS)
    for (const repo of DEV_REPOS) {
      const b = x1Base(run, repo);
      if (existsSync(`${b}.summary.json`)) {
        console.log(`[judge-x1] ${run.name}/${repo}: summary exists, skipped`);
        continue;
      }
      const out = execFileSync(
        process.execPath,
        [bin, "bench", "score", "--golden", join(bench, "golden/code_review_benchmarks", `${repo}.json`), "--reviews", run.reviews(repo), "--detail", `${b}.detail.json`, "--summary", `${b}.summary.json`, "--label", `x1:${run.name}/${repo}`, "--model", QWEN, "--reasoning", "off"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
      );
      process.stdout.write(out.split("\n").filter((l) => / JUDGE_FAILED | judge calls /.test(l)).join("\n") + "\n");
    }
}

/** Every v1-FP comment of every run, with its pull request. */
function v1FpComments(run: Run) {
  return DEV_REPOS.flatMap((repo) =>
    details(v1Base(run, repo))
      .filter((d) => d.status === "SCORED")
      .flatMap((d) => d.comments.filter((c) => c.outcome === "fp").map((c) => ({ repo, goldenIndex: d.goldenIndex, path: c.path, line: c.line, body: c.body }))),
  );
}

function fps() {
  const all = RUNS.flatMap((r) => v1FpComments(r));
  const items = dedupFps(all);
  mkdirSync(validityDir, { recursive: true });
  const f = join(validityDir, "fps.json");
  if (existsSync(f)) {
    const prev = readJson<{ items: FpItem[] }>(f).items;
    if (JSON.stringify(prev) !== JSON.stringify(items)) throw new Error(`${f} exists and differs; not overwriting`);
  } else writeFileSync(f, JSON.stringify({ items }, null, 1) + "\n");
  console.log(JSON.stringify({ v1FpComments: all.length, deduplicated: items.length, perRepo: Object.fromEntries(DEV_REPOS.map((r) => [r, items.filter((i) => i.repo === r).length])) }));
}

function validity() {
  for (const [name, model, reasoning] of [["super", SUPER, "on"], ["qwen", QWEN, "off"]] as const) {
    try {
      const out = execFileSync(process.execPath, [bin, "bench", "validity", "--fps", join(validityDir, "fps.json"), "--prs", join(bench, "prs"), "--model", model, "--reasoning", reasoning, "--out", join(validityDir, `${name}.json`)], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"],
      });
      process.stdout.write(out);
    } catch (err) {
      process.stdout.write(String((err as { stdout?: string }).stdout ?? ""));
      console.error(`[validity] ${name} stopped (exit ${(err as { status?: number }).status})`);
      return;
    }
  }
}

const pct = (x: number | null) => (x === null ? "n/a" : `${(100 * x).toFixed(1)}%`);
const num = (x: number | null, d = 3) => (x === null ? "n/a" : x.toFixed(d));
const sumCounts = (run: Run, base: (r: Run, repo: string) => string) => {
  let c = zeroCounts();
  let jf = 0;
  const usage = { calls: 0, cached: 0, inputTokens: 0, outputTokens: 0, costUSD: 0 };
  for (const repo of DEV_REPOS) {
    const s = readJson<Summary>(`${base(run, repo)}.summary.json`);
    c = addCounts(c, s.counts);
    jf += s.pulls.judgeFailed;
    for (const k of Object.keys(usage) as (keyof typeof usage)[]) usage[k] += s.usage[k];
  }
  return { c, jf, usage };
};
const row = (name: string, c: Counts, jf: number) => {
  const m = metrics(c);
  return `| ${name} | ${c.comments} | ${c.tp} | ${c.fp} | ${c.duplicates} | ${c.lowMatched} | ${c.fn} | ${jf} | ${pct(m.precision)} (${c.tp}/${c.tp + c.fp}) | ${pct(m.recall)} (${c.tp}/${c.tp + c.fn}) | ${pct(m.f)} |`;
};
const HEAD = "| run | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |\n|---|---|---|---|---|---|---|---|---|---|---|";

function tables() {
  const out: string[] = [];
  const v1 = new Map(RUNS.map((r) => [r.name, sumCounts(r, v1Base)]));
  const x1 = new Map(RUNS.map((r) => [r.name, sumCounts(r, x1Base)]));
  out.push("### Under bench-judge-v1 (Super, reasoning on; the scorer of record)", "", HEAD, ...RUNS.map((r) => row(r.name, v1.get(r.name)!.c, v1.get(r.name)!.jf)), "");
  out.push("### Under bench-judge-x1 (Qwen3-235B-A22B-Instruct-2507, no reasoning field)", "", HEAD, ...RUNS.map((r) => row(r.name, x1.get(r.name)!.c, x1.get(r.name)!.jf)), "");
  for (const repo of DEV_REPOS) {
    out.push(`#### ${repo}: F under v1 / x1`, "", "| run | v1 P (n) | v1 R (n) | v1 F | x1 P (n) | x1 R (n) | x1 F |", "|---|---|---|---|---|---|---|");
    for (const r of RUNS) {
      const a = readJson<Summary>(`${v1Base(r, repo)}.summary.json`).counts;
      const b = readJson<Summary>(`${x1Base(r, repo)}.summary.json`).counts;
      const ma = metrics(a);
      const mb = metrics(b);
      out.push(`| ${r.name} | ${pct(ma.precision)} (${a.tp}/${a.tp + a.fp}) | ${pct(ma.recall)} (${a.tp}/${a.tp + a.fn}) | ${pct(ma.f)} | ${pct(mb.precision)} (${b.tp}/${b.tp + b.fp}) | ${pct(mb.recall)} (${b.tp}/${b.tp + b.fn}) | ${pct(mb.f)} |`);
    }
    out.push("");
  }

  // agreement over comments in pull requests both judges scored
  const pairsLabel: [string, string][] = [];
  const pairsClass: [CommentOutcome, CommentOutcome][] = [];
  const perRun: string[] = [];
  let leftOut = 0;
  let mismatch = 0;
  for (const r of RUNS) {
    let same = 0;
    let n = 0;
    const cls: [CommentOutcome, CommentOutcome][] = [];
    for (const repo of DEV_REPOS) {
      const a = new Map(details(v1Base(r, repo)).map((d) => [d.goldenIndex, d]));
      for (const d2 of details(x1Base(r, repo))) {
        const d1 = a.get(d2.goldenIndex);
        if (!d1) throw new Error(`${r.name}/${repo}: golden ${d2.goldenIndex} scored by x1 only`);
        if (d1.reviewFile !== d2.reviewFile || d1.comments.length !== d2.comments.length) throw new Error(`${r.name}/${repo}: pull request ${d2.goldenIndex} differs between judges`);
        if (d1.status !== "SCORED" || d2.status !== "SCORED") {
          leftOut += d1.comments.length;
          continue;
        }
        d1.comments.forEach((c1, i) => {
          const c2 = d2.comments[i]!;
          if (c1.path !== c2.path || c1.line !== c2.line || c1.body !== c2.body) mismatch++;
          n++;
          if (c1.matched === c2.matched) same++;
          pairsLabel.push([String(c1.matched), String(c2.matched)]);
          cls.push([c1.outcome!, c2.outcome!]);
        });
      }
    }
    pairsClass.push(...cls);
    const k = cohenKappa(cls);
    perRun.push(`| ${r.name} | ${n} | ${same} | ${pct(n ? same / n : null)} | ${num(k.kappa)} |`);
  }
  if (mismatch) throw new Error(`${mismatch} comments differ between the two judges' details`);
  const sameAll = pairsLabel.filter(([a, b]) => a === b).length;
  const kAll = cohenKappa(pairsClass);
  out.push(
    "### Agreement, bench-judge-v1 against bench-judge-x1 (comments in pull requests both judges scored)",
    "",
    "| run | comments | same label | share | kappa (outcome class) |",
    "|---|---|---|---|---|",
    ...perRun,
    `| **all runs** | ${pairsLabel.length} | ${sameAll} | ${pct(sameAll / pairsLabel.length)} | ${num(kAll.kappa)} |`,
    "",
    `Comments left out (pull request JUDGE_FAILED under either judge): ${leftOut}. Kappa over all runs: observed ${num(kAll.observed)}, expected ${num(kAll.expected)}, n ${kAll.n}.`,
    "",
  );
  const classes: CommentOutcome[] = ["tp", "fp", "low", "duplicate"];
  out.push("Outcome class, v1 (rows) against x1 (columns), all runs:", "", `| v1 \\ x1 | ${classes.join(" | ")} |`, `|---|${classes.map(() => "---").join("|")}|`);
  for (const a of classes) out.push(`| ${a} | ${classes.map((b) => pairsClass.filter(([x, y]) => x === a && y === b).length).join(" | ")} |`);
  out.push("");

  const fV1 = RUNS.map((r) => metrics(v1.get(r.name)!.c).f ?? 0);
  const fX1 = RUNS.map((r) => metrics(x1.get(r.name)!.c).f ?? 0);
  const rank = (fs: number[]) => fs.map((f) => 1 + fs.filter((g) => g > f).length);
  const rV1 = rank(fV1);
  const rX1 = rank(fX1);
  out.push(
    `### Ranking by F (${RUNS.length} runs)`,
    "",
    "| run | v1 F | v1 rank | x1 F | x1 rank |",
    "|---|---|---|---|---|",
    ...RUNS.map((r, i) => `| ${r.name} | ${pct(fV1[i]!)} | ${rV1[i]} | ${pct(fX1[i]!)} | ${rX1[i]} |`),
    "",
    `Kendall's tau-b between the two F-rankings: ${num(kendallTauB(fV1, fX1))} (n = ${RUNS.length} runs).`,
    "",
  );

  // self-preference: precision gap v1 − x1
  const gaps = RUNS.map((r) => {
    const a = metrics(v1.get(r.name)!.c).precision;
    const b = metrics(x1.get(r.name)!.c).precision;
    return { r, gap: a !== null && b !== null ? a - b : null };
  });
  const mean = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const pts = (x: number | null) => (x === null ? "n/a" : `${(100 * x).toFixed(1)}`);
  out.push(
    "### Precision gap, v1 minus x1 (points)",
    "",
    "| run | kind | v1 precision | x1 precision | gap |",
    "|---|---|---|---|---|",
    ...gaps.map(({ r, gap }) => `| ${r.name} | ${r.kind} | ${pct(metrics(v1.get(r.name)!.c).precision)} | ${pct(metrics(x1.get(r.name)!.c).precision)} | ${pts(gap)} |`),
    "",
    `Mean gap, TraceHound runs (${gaps.filter((g) => g.r.kind === "tracehound").length}): ${pts(mean(gaps.filter((g) => g.r.kind === "tracehound").map((g) => g.gap)))} points. Mean gap, five tools: ${pts(mean(gaps.filter((g) => g.r.kind === "tool").map((g) => g.gap)))} points.`,
    "",
  );
  const pv = metrics(x1.get("pool-verify-v1")!.c).f;
  out.push(`pool-verify-v1 F under x1: ${pct(pv)}; ${pv !== null && pv >= 0.35 ? "at or above" : "below"} 35.0%.`, "");

  // judge-x1 usage
  const xu = RUNS.reduce((s, r) => {
    const u = x1.get(r.name)!.usage;
    return { calls: s.calls + u.calls, cached: s.cached + u.cached, inputTokens: s.inputTokens + u.inputTokens, outputTokens: s.outputTokens + u.outputTokens, costUSD: s.costUSD + u.costUSD };
  }, { calls: 0, cached: 0, inputTokens: 0, outputTokens: 0, costUSD: 0 });
  out.push(`bench-judge-x1 usage: ${JSON.stringify({ ...xu, costUSD: Number(xu.costUSD.toFixed(4)) })}`, "");

  // validity
  const fpFile = join(validityDir, "fps.json");
  if (!existsSync(fpFile)) {
    out.push("Validity: no FP set built.");
    console.log(out.join("\n"));
    return;
  }
  const items = readJson<{ items: FpItem[] }>(fpFile).items;
  const keyOf = new Map(items.map((i) => [fpKey(i), i.key]));
  const vf = (name: string) => (existsSync(join(validityDir, `${name}.json`)) ? readJson<ValidityFile>(join(validityDir, `${name}.json`)) : null);
  const files = { super: vf("super"), qwen: vf("qwen") };
  const vmap = (f: ValidityFile | null) => new Map<string, Verdict>((f?.results ?? []).map((r) => [r.key, r.verdict]));
  const sv = vmap(files.super);
  const qv = vmap(files.qwen);
  const runFps: RunFps[] = RUNS.map((r) => ({ run: r.name, tp: v1.get(r.name)!.c.tp, fp: v1.get(r.name)!.c.fp, fpKeys: v1FpComments(r).map((c) => keyOf.get(fpKey(c))!) }));
  out.push(
    `### Validity check (validity-v1): ${items.length} deduplicated bench-judge-v1 FPs`,
    "",
    "| run | v1 FP comments | distinct FPs | Super valid / invalid / unsure | Qwen valid / invalid / unsure |",
    "|---|---|---|---|---|",
    ...runFps.map((r) => {
      const c = (m: Map<string, Verdict>) => VERDICTS.map((v) => r.fpKeys.filter((k) => m.get(k) === v).length).join(" / ");
      return `| ${r.run} | ${r.fpKeys.length} | ${new Set(r.fpKeys).size} | ${c(sv)} | ${c(qv)} |`;
    }),
    "",
  );
  for (const [name, f] of Object.entries(files)) {
    if (!f) {
      out.push(`${name}: not run.`);
      continue;
    }
    const rs = f.results;
    const cnt = (p: (x: (typeof rs)[number]) => boolean) => rs.filter(p).length;
    const u = rs.reduce((s, x) => ({ calls: s.calls + x.usage.calls, cached: s.cached + x.usage.cached, inputTokens: s.inputTokens + x.usage.inputTokens, outputTokens: s.outputTokens + x.usage.outputTokens, costUSD: s.costUSD + x.usage.costUSD }), { calls: 0, cached: 0, inputTokens: 0, outputTokens: 0, costUSD: 0 });
    const lat = rs.filter((x) => x.usage.calls > x.usage.cached).map((x) => x.usage.latencyMs).sort((a, b) => a - b);
    out.push(
      `${name} (${f.model}, reasoning ${f.reasoning}, prompt ${f.promptSha256.slice(0, 8)}…): completed ${f.completed}; judged ${rs.length}/${f.items}; ` +
        `${VERDICTS.map((v) => `${v} ${cnt((x) => x.verdict === v)}`).join(", ")}; answered ${cnt((x) => x.status === "answered")}, invalid reply after retry ${cnt((x) => x.status === "invalid-reply")}, no diff ${cnt((x) => x.status === "no-diff")}, failed ${cnt((x) => x.status === "failed")}, retried ${cnt((x) => x.attempts > 1)}, partial diff ${cnt((x) => x.partial)}; ` +
        `usage ${JSON.stringify({ ...u, costUSD: Number(u.costUSD.toFixed(4)) })}; latency per comment median ${lat.length ? lat[Math.floor((lat.length - 1) / 2)] : 0} ms, max ${lat.length ? lat[lat.length - 1] : 0} ms`,
      "",
    );
  }
  const keys = items.map((i) => i.key);
  const ap = augmentedPrecision(keys, sv, qv, runFps);
  if (!ap.completed) {
    out.push(`**Validity check not completed:** ${JSON.stringify(ap.done)}. No augmented precision is reported.`);
  } else {
    const both = keys.map((k): [Verdict, Verdict] => [sv.get(k)!, qv.get(k)!]);
    const k = cohenKappa(both);
    out.push(
      "### Validity judges' agreement (deduplicated FPs)",
      "",
      `| Super \\ Qwen | ${VERDICTS.join(" | ")} |`,
      `|---|${VERDICTS.map(() => "---").join("|")}|`,
      ...VERDICTS.map((a) => `| ${a} | ${VERDICTS.map((b) => both.filter(([x, y]) => x === a && y === b).length).join(" | ")} |`),
      "",
      `Same verdict: ${both.filter(([a, b]) => a === b).length}/${both.length} (${pct(k.observed)}); kappa ${num(k.kappa)} (expected ${num(k.expected)}).`,
      "",
      "### Augmented precision ((TP + FPs judged valid) / (TP + FP), bench-judge-v1 counts)",
      "",
      "| run | TP | FP | v1 precision (n) | valid (Super) | AP Super | valid (Qwen) | AP Qwen | valid (both) | AP both |",
      "|---|---|---|---|---|---|---|---|---|---|",
      ...ap.runs.map((r) => `| ${r.run} | ${r.tp} | ${r.fp} | ${pct(r.tp + r.fp ? r.tp / (r.tp + r.fp) : null)} (${r.tp}/${r.tp + r.fp}) | ${r.validSuper} | ${pct(r.apSuper)} | ${r.validQwen} | ${pct(r.apQwen)} | ${r.validBoth} | ${pct(r.apBoth)} |`),
      "",
    );
  }
  console.log(out.join("\n"));
}

const sub = process.argv[2];
if (import.meta.main) {
  if (sub === "judge") judge();
  else if (sub === "fps") fps();
  else if (sub === "validity") validity();
  else if (sub === "tables") tables();
  else {
    console.error("usage: node scripts/bench/scorer-checks.ts judge|fps|validity|tables [--bench <dir>]");
    process.exit(1);
  }
}
