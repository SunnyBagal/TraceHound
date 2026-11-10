#!/usr/bin/env node
// Fake gh for test/run-tracehound.test.ts: no network. State JSON in FAKE_GH_STATE
// ({ repo, prs: {n: {...}}, comments: {n: [{body}]} }), one JSON line per call appended to FAKE_GH_LOG.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const stateFile = process.env.FAKE_GH_STATE;
const state = JSON.parse(readFileSync(stateFile, "utf8"));
const stdin = argv[0] === "pr" && argv[1] === "comment" ? readFileSync(0, "utf8") : "";
appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify({
  argv, GH_REPO: process.env.GH_REPO ?? null, GH_HOST: process.env.GH_HOST ?? null, cwd: process.cwd(),
  env: Object.entries(process.env).map(([k, v]) => `${k}=${v}`).join("\n"), stdin,
}) + "\n");
const out = (x) => process.stdout.write(typeof x === "string" ? x : JSON.stringify(x));
if (argv[0] === "api") {
  const p = argv[3];
  const m = /^repos\/[^/]+\/[^/]+\/issues\/(\d+)\/comments\?per_page=100&page=(\d+)$/.exec(p);
  if (m) {
    const all = state.comments?.[m[1]] ?? [];
    out(all.slice((Number(m[2]) - 1) * 100, Number(m[2]) * 100));
  } else out(state.repo);
} else if (argv[0] === "pr" && argv[1] === "view") {
  const pr = state.prs?.[argv[2]];
  if (!pr) { process.stderr.write("no pull requests found"); process.exit(1); }
  out(pr);
} else if (argv[0] === "pr" && argv[1] === "comment") {
  (state.comments ??= {})[argv[2]] ??= [];
  state.comments[argv[2]].push({ body: stdin });
  writeFileSync(stateFile, JSON.stringify(state));
  out(`https://github.com/${argv[4]}/pull/${argv[2]}#issuecomment-${state.comments[argv[2]].length}\n`);
} else {
  process.stderr.write("fake gh: unsupported");
  process.exit(9);
}
