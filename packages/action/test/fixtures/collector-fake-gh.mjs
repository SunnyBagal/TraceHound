#!/usr/bin/env node
// Fake gh for test/testset-kit.test.ts (collect-tool-reviews.ts): no network. State is gh.json next to this file
// ({pulls: {n: {pr, comments: [...], reviews: [...]}}}); one JSON line per call goes to gh.log there (argv + env keys).
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const state = JSON.parse(readFileSync(path.join(dir, "gh.json"), "utf8"));
appendFileSync(path.join(dir, "gh.log"), JSON.stringify({ argv, envKeys: Object.keys(process.env).sort(), cwd: process.cwd() }) + "\n");
const m = /^repos\/[^/]+\/[^/]+\/pulls\/(\d+)(?:\/(comments|reviews)\?per_page=(\d+)&page=(\d+))?$/.exec(argv[3] ?? "");
const pull = m && state.pulls[m[1]];
if (!pull || state.fail) { process.stderr.write("HTTP 404 secret-ish stderr"); process.exit(1); }
if (!m[2]) process.stdout.write(JSON.stringify(pull.pr));
else {
  const per = Number(m[3]), page = Number(m[4]);
  process.stdout.write(JSON.stringify((pull[m[2]] ?? []).slice((page - 1) * per, page * per)));
}
