// Shared fixture: a tiny two-package repo with a Redis queue between an API and a worker.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeRepo } from "../src/analyze.ts";
import type { Snapshot } from "../src/schema.ts";

// A tiny two-package repo, committed for real so `git diff --name-status` does the work:
//   api:api-app -imports-> orders -imports-> queue-client -produces-> redis:redis-url -consumes-> worker
//   redis:redis-url -consumes (dynamic key)-> notifier          api/src/orders.test.ts TESTS orders
export const BASE_FILES: Record<string, string> = {
  "package.json": JSON.stringify({ name: "mini", private: true, workspaces: ["api", "worker"] }),
  "tracehound.json": JSON.stringify({
    components: {
      orders: { name: "Orders", kind: "service", files: ["api/src/orders.ts"] },
      "queue-client": { name: "Queue Client", kind: "service", files: ["api/src/queue-client.ts"] },
      notifier: { name: "Notifier", kind: "service", files: ["api/src/notifier.ts"] },
    },
  }),
  "api/package.json": JSON.stringify({ name: "api", scripts: { dev: "bun run src/index.ts" } }),
  "api/src/index.ts": 'import { handleOrder } from "./orders.ts";\nimport { listen } from "./notifier.ts";\nawait handleOrder({ id: "1", qty: 2 });\nawait listen(process.argv[2]!);\n',
  "api/src/orders.ts": 'import { send } from "./queue-client.ts";\nexport async function handleOrder(order: { id: string; qty: number }) {\n  return send({ orderId: order.id, qty: order.qty });\n}\n',
  "api/src/queue-client.ts": 'import { createClient } from "redis";\nconst client = createClient({ url: process.env.REDIS_URL });\nexport async function send(message: { orderId: string; qty: number }) {\n  await client.lPush("jobs", JSON.stringify(message));\n}\n',
  "api/src/notifier.ts": 'import { createClient } from "redis";\nconst client = createClient({ url: process.env.REDIS_URL });\nexport async function listen(queue: string) {\n  return client.brPop(queue, 0);\n}\n',
  "api/src/orders.test.ts": 'import { handleOrder } from "./orders.ts";\nhandleOrder({ id: "t", qty: 1 });\n',
  "worker/package.json": JSON.stringify({ name: "worker", scripts: { start: "bun run src/index.ts" } }),
  "worker/src/index.ts": 'import { createClient } from "redis";\nconst client = createClient({ url: process.env.REDIS_URL });\nconst item = await client.brPop("jobs", 0);\nif (item) console.log(JSON.parse(item.element).orderId);\n',
};


// A key/value cache instead of a queue: writer -writes-> redis (kind "cache") <-reads- reader.
export const CACHE_FILES: Record<string, string> = {
  "package.json": JSON.stringify({ name: "cache-mini", private: true, workspaces: ["app"] }),
  "tracehound.json": JSON.stringify({
    components: {
      "profile-writer": { name: "Profile Writer", kind: "service", files: ["app/src/writer.ts"] },
      "profile-reader": { name: "Profile Reader", kind: "service", files: ["app/src/reader.ts"] },
    },
  }),
  "app/package.json": JSON.stringify({ name: "app", scripts: { dev: "bun run src/index.ts" } }),
  "app/src/index.ts": 'import { saveProfile } from "./writer.ts";\nimport { loadProfile } from "./reader.ts";\nawait saveProfile({ id: "1", name: "a" });\nconsole.log(await loadProfile("1"));\n',
  "app/src/writer.ts": 'import { createClient } from "redis";\nconst client = createClient({ url: process.env.REDIS_URL });\nexport async function saveProfile(p: { id: string; name: string }) {\n  await client.set("profile-cache", JSON.stringify(p));\n}\n',
  "app/src/reader.ts": 'import { createClient } from "redis";\nconst client = createClient({ url: process.env.REDIS_URL });\nexport async function loadProfile(id: string) {\n  return JSON.parse((await client.get("profile-cache")) ?? "null")?.[id];\n}\n',
};

/** Write a file set (default BASE_FILES) to a temp dir, commit it, and analyze the commit (heuristic names, no model). */
export function makeFixtureRepo(files: Record<string, string> = BASE_FILES): { repo: string; base: string; snapshot: Snapshot; cleanup: () => void } {
  const repo = mkdtempSync(path.join(tmpdir(), "tracehound-fixture-"));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    writeFileSync(path.join(repo, file), text);
  }
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-qm", "base");
  return { repo, base: git("rev-parse", "HEAD"), snapshot: analyzeRepo(repo, { now: () => new Date(0) }), cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}
