#!/usr/bin/env node
// Recording git for test/run-tracehound.test.ts: logs argv to FAKE_GIT_LOG, then runs the real git on a local
// fixture repo (no network: the fixture has no remote, and the runner sets GIT_NO_LAZY_FETCH=1).
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const argv = process.argv.slice(2);
appendFileSync(process.env.FAKE_GIT_LOG, JSON.stringify({ argv, noLazy: process.env.GIT_NO_LAZY_FETCH ?? null }) + "\n");
const r = spawnSync("git", argv, { stdio: "inherit" });
process.exit(r.status ?? 1);
