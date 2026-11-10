#!/usr/bin/env node
// Fake gh for test/run-tracehound.test.ts: no network. The test copies this file into the fixture dir as `gh`; state
// is gh.json next to it ({ repo, prs: {n: {...}}, comments: {n: [{body}]}, failComment, changeOnView: {n: {after, pr}} }),
// and one JSON line per call is appended to gh.log there. It finds both from its own path, because the runner gives
// gh an allowlisted env only.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const stateFile = path.join(dir, "gh.json");
const argv = process.argv.slice(2);
const state = JSON.parse(readFileSync(stateFile, "utf8"));
const stdin = argv[0] === "pr" && argv[1] === "comment" ? readFileSync(0, "utf8") : "";
const envText = Object.entries(process.env).map(([k, v]) => `${k}=${v}`).join("\n");
appendFileSync(path.join(dir, "gh.log"), JSON.stringify({
  argv, GH_REPO: process.env.GH_REPO ?? null, GH_HOST: process.env.GH_HOST ?? null, cwd: process.cwd(),
  envKeys: Object.keys(process.env).sort(), env: envText, stdin,
}) + "\n");
const out = (x) => process.stdout.write(typeof x === "string" ? x : JSON.stringify(x));
const save = () => writeFileSync(stateFile, JSON.stringify(state));
if (argv[0] === "api") {
  const m = /^repos\/[^/]+\/[^/]+\/issues\/(\d+)\/comments\?per_page=100&page=(\d+)$/.exec(argv[3]);
  if (m) out((state.comments?.[m[1]] ?? []).slice((Number(m[2]) - 1) * 100, Number(m[2]) * 100));
  else out(state.repo);
} else if (argv[0] === "pr" && argv[1] === "view") {
  const n = argv[2];
  // a ref moving between the runner's first check and its re-check right before the write
  const views = ((state.views ??= {})[n] = (state.views[n] ?? 0) + 1);
  save();
  const change = state.changeOnView?.[n];
  const pr = change && views > change.after ? { ...state.prs[n], ...change.pr } : state.prs?.[n];
  if (!pr) { process.stderr.write("no pull requests found"); process.exit(1); }
  out(pr);
} else if (argv[0] === "pr" && argv[1] === "comment") {
  // a failing gh that dumps its whole env on stderr: the runner must not echo it
  if (state.failComment) { process.stderr.write(`HTTP 502\n${envText}\n`); process.exit(1); }
  (state.comments ??= {})[argv[2]] ??= [];
  state.comments[argv[2]].push({ body: stdin });
  save();
  out(`https://github.com/${argv[4]}/pull/${argv[2]}#issuecomment-${state.comments[argv[2]].length}\n`);
} else {
  process.stderr.write("fake gh: unsupported");
  process.exit(9);
}
