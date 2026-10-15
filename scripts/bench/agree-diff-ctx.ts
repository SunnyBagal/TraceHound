// The agreement table's review files (decision 058, step 6; reported only, never adopted). A
// review-diff-v1 finding is "agreed" if review-ctx-v1 (same model) has a finding on the same path
// whose line is within 3 lines of it in the new version. Writes the agreed review-diff-v1 findings,
// in the neutral review format, to reviews/agree-diff-ctx/<out model dir>/<repo>/. No model call.
// Prints counts only. Cal.com is not in DEV_REPOS and is never read.
//   node scripts/bench/agree-diff-ctx.ts [--bench ~/Projects/tracehound-bench] [--model nemotron-3-super-120b-a12b] [--out-model super]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PullReview } from "../../packages/analyzer/src/bench/types.ts";

const DEV_REPOS = ["sentry", "grafana", "keycloak", "discourse"];
export const AGREE_LINES = 3;
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const bench = arg("--bench") ?? join(homedir(), "Projects/tracehound-bench");
const model = arg("--model") ?? "nemotron-3-super-120b-a12b";
const outModel = arg("--out-model") ?? "super";

const norm = (p: string) => p.trim().replace(/^\.?\//, "").replace(/^[ab]\//, "");
const agrees = (a: { path: string; line: number | null }, b: { path: string; line: number | null }) =>
  norm(a.path) === norm(b.path) && a.line !== null && b.line !== null && Math.abs(a.line - b.line) <= AGREE_LINES;

const totals: Record<string, { pulls: number; diff: number; ctx: number; agreed: number }> = {};
for (const repo of DEV_REPOS) {
  const diffDir = join(bench, "reviews", "review-diff-v1", model, repo);
  const ctxDir = join(bench, "reviews", "review-ctx-v1", model, repo);
  const outDir = join(bench, "reviews", "agree-diff-ctx", outModel, repo);
  mkdirSync(outDir, { recursive: true });
  const t = { pulls: 0, diff: 0, ctx: 0, agreed: 0 };
  for (const f of readdirSync(diffDir).filter((x) => x.endsWith(".json")).sort()) {
    const d = PullReview.parse(JSON.parse(readFileSync(join(diffDir, f), "utf8")));
    if (!existsSync(join(ctxDir, f))) throw new Error(`${repo}/${f}: no review-ctx-v1 review`);
    const c = PullReview.parse(JSON.parse(readFileSync(join(ctxDir, f), "utf8")));
    if (c.pr_title !== d.pr_title) throw new Error(`${repo}/${f}: titles differ`);
    const agreed = d.comments.filter((x) => c.comments.some((y) => agrees(x, y)));
    writeFileSync(
      join(outDir, f),
      JSON.stringify({ pr_title: d.pr_title, ...(d.pr_number !== undefined && { pr_number: d.pr_number }), comments: agreed, agree: { rule: `same path, line within ${AGREE_LINES}`, diffFindings: d.comments.length, ctxFindings: c.comments.length, agreed: agreed.length } }, null, 1) + "\n",
    );
    t.pulls++;
    t.diff += d.comments.length;
    t.ctx += c.comments.length;
    t.agreed += agreed.length;
  }
  totals[repo] = t;
}
console.log(JSON.stringify(totals));
