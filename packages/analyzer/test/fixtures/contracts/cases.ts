// Fixture pull requests for the contracts tests: each break has a positive case and a control.
// Every control must produce zero findings. Dependencies are never installed: TS fixtures that
// import express or bullmq fail to resolve them the same way at base and head.
import type { Files } from "./repo.ts";

export interface ContractCase {
  name: string;
  control: boolean;
  base: Files;
  head: Record<string, string | null>;
  /** findings by source, and where they land */
  expected: { tsc: number; contract: number; paths: string[] };
}

export const TSCONFIG = JSON.stringify({
  compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, noEmit: true, lib: ["ES2022", "DOM"], skipLibCheck: true },
  include: ["src"],
});
const TS = { "package.json": JSON.stringify({ name: "fixture", private: true }), "tsconfig.json": TSCONFIG };

const GREET = (params: string) => `export function greet(${params}) {\n  return "hi " + name;\n}\n`;
const USER = (fields: string, value: string) => `export interface User {\n  id: string;\n${fields}}\nexport function load(): User {\n  return ${value};\n}\n`;
const FIND = (ret: string, body: string) => `export function find(id: string): ${ret} {\n  return ${body};\n}\n`;
const PRODUCER = (queue: string) => `import { Queue } from "bullmq";\nexport const emails = new Queue("${queue}");\nexport async function send(to: string) {\n  await emails.add("welcome", { to });\n}\n`;
const WORKER = (queue: string) => `import { Worker } from "bullmq";\nexport const worker = new Worker("${queue}", async (job) => {\n  console.log(job.data);\n});\n`;
const SERVER = (route: string) => `import express from "express";\nconst app = express();\napp.get("${route}", (_req, res) => {\n  res.json([]);\n});\napp.listen(3000);\n`;
const CLIENT = (route: string) => `export async function users() {\n  return (await fetch("${route}")).json();\n}\n`;
const ENV_FILE = (name: string) => `${name}=postgres://localhost/app\nPORT=3000\n`;
const CONFIG = (name: string) => `export const dbUrl = process.env.${name};\n`;
const DB = (name: string) => `export const url = process.env.${name} ?? "";\n`;

const PY_SERVER = (route: string, task: string) => `from flask import Flask\nfrom celery import Celery\n\napp = Flask(__name__)\ncelery_app = Celery("app")\n\n@app.route("${route}")\ndef list_users():\n    return []\n\n@celery_app.task(name="${task}")\ndef send_welcome(user_id):\n    return user_id\n`;
const PY_CLIENT = (route: string, task: string) => `import requests\nfrom tasks import celery_app\n\ndef users(base):\n    return requests.get(base + "${route}").json()\n\ndef welcome(user_id):\n    celery_app.send_task("${task}", args=[user_id])\n`;
const GO_CONFIG = (env: string, key: string) => `package main\n\nimport "os"\n\nfunc dbURL() string {\n\treturn os.Getenv("${env}")\n}\n\nfunc loadSession(id string) string {\n\treturn rdb.Get(ctx, "${key}"+id).Val()\n}\n`;
const GO_MAIN = (env: string, key: string) => `package main\n\nimport (\n\t"fmt"\n\t"os"\n)\n\nfunc main() {\n\tfmt.Println(os.Getenv("${env}"))\n\trdb.Set(ctx, "${key}"+"42", "v", 0)\n}\n`;

export const CASES: ContractCase[] = [
  {
    name: "required parameter added",
    control: false,
    base: { ...TS, "src/greet.ts": GREET("name: string"), "src/app.ts": 'import { greet } from "./greet";\nexport const message = greet("a");\n' },
    head: { "src/greet.ts": GREET("name: string, greeting: string") },
    expected: { tsc: 1, contract: 0, paths: ["src/app.ts:2"] },
  },
  {
    name: "optional parameter added",
    control: true,
    base: { ...TS, "src/greet.ts": GREET("name: string"), "src/app.ts": 'import { greet } from "./greet";\nexport const message = greet("a");\n' },
    head: { "src/greet.ts": GREET("name: string, greeting?: string") },
    expected: { tsc: 0, contract: 0, paths: [] },
  },
  {
    name: "exported field removed",
    control: false,
    base: { ...TS, "src/user.ts": USER("  name: string;\n  email: string;\n", '{ id: "1", name: "a", email: "a@b" }'), "src/view.ts": 'import { load } from "./user";\nexport const email = load().email;\n' },
    head: { "src/user.ts": USER("  name: string;\n", '{ id: "1", name: "a" }') },
    expected: { tsc: 1, contract: 0, paths: ["src/view.ts:2"] },
  },
  {
    name: "exported field added",
    control: true,
    base: { ...TS, "src/user.ts": USER("  name: string;\n  email: string;\n", '{ id: "1", name: "a", email: "a@b" }'), "src/view.ts": 'import { load } from "./user";\nexport const email = load().email;\n' },
    head: { "src/user.ts": USER("  name: string;\n  email: string;\n  age: number;\n", '{ id: "1", name: "a", email: "a@b", age: 1 }') },
    expected: { tsc: 0, contract: 0, paths: [] },
  },
  {
    name: "export renamed, stale importer",
    control: false,
    base: { ...TS, "src/users.ts": "export function getUser(id: string) {\n  return { id };\n}\n", "src/page.ts": 'import { getUser } from "./users";\nexport const user = getUser("1");\n' },
    head: { "src/users.ts": "export function fetchUser(id: string) {\n  return { id };\n}\n" },
    expected: { tsc: 1, contract: 0, paths: ["src/page.ts:1"] },
  },
  {
    name: "export renamed everywhere",
    control: true,
    base: { ...TS, "src/users.ts": "export function getUser(id: string) {\n  return { id };\n}\n", "src/page.ts": 'import { getUser } from "./users";\nexport const user = getUser("1");\n' },
    head: { "src/users.ts": "export function fetchUser(id: string) {\n  return { id };\n}\n", "src/page.ts": 'import { fetchUser } from "./users";\nexport const user = fetchUser("1");\n' },
    expected: { tsc: 0, contract: 0, paths: [] },
  },
  {
    name: "return type becomes nullable, caller dereferences",
    control: false,
    base: { ...TS, "src/repo.ts": FIND("{ name: string }", "{ name: id }"), "src/caller.ts": 'import { find } from "./repo";\nexport const name = find("a").name;\n' },
    head: { "src/repo.ts": FIND("{ name: string } | null", "id ? { name: id } : null") },
    expected: { tsc: 1, contract: 0, paths: ["src/caller.ts:2"] },
  },
  {
    name: "return type becomes nullable, caller already guards",
    control: true,
    base: { ...TS, "src/repo.ts": FIND("{ name: string }", "{ name: id }"), "src/caller.ts": 'import { find } from "./repo";\nconst found = find("a");\nexport const name = found ? found.name : "";\n' },
    head: { "src/repo.ts": FIND("{ name: string } | null", "id ? { name: id } : null") },
    expected: { tsc: 0, contract: 0, paths: [] },
  },
  {
    name: "queue renamed in the producer only",
    control: false,
    base: { ...TS, "src/producer.ts": PRODUCER("emails"), "src/worker.ts": WORKER("emails") },
    head: { "src/producer.ts": PRODUCER("outbound-emails") },
    expected: { tsc: 0, contract: 1, paths: ["src/worker.ts:2"] },
  },
  {
    name: "queue renamed on both sides",
    control: true,
    base: { ...TS, "src/producer.ts": PRODUCER("emails"), "src/worker.ts": WORKER("emails") },
    head: { "src/producer.ts": PRODUCER("outbound-emails"), "src/worker.ts": WORKER("outbound-emails") },
    expected: { tsc: 0, contract: 0, paths: [] },
  },
  {
    name: "env var renamed in config only",
    control: false,
    base: { ...TS, ".env.example": ENV_FILE("DATABASE_URL"), "src/config.ts": CONFIG("DATABASE_URL"), "src/db.ts": DB("DATABASE_URL") },
    head: { ".env.example": ENV_FILE("DB_URL"), "src/config.ts": CONFIG("DB_URL") },
    expected: { tsc: 0, contract: 1, paths: ["src/db.ts:1"] },
  },
  {
    name: "env var renamed in all readers",
    control: true,
    base: { ...TS, ".env.example": ENV_FILE("DATABASE_URL"), "src/config.ts": CONFIG("DATABASE_URL"), "src/db.ts": DB("DATABASE_URL") },
    head: { ".env.example": ENV_FILE("DB_URL"), "src/config.ts": CONFIG("DB_URL"), "src/db.ts": DB("DB_URL") },
    expected: { tsc: 0, contract: 0, paths: [] },
  },
  {
    name: "HTTP route path changed on the server only",
    control: false,
    base: { ...TS, "src/server.ts": SERVER("/api/users"), "src/client.ts": CLIENT("/api/users") },
    head: { "src/server.ts": SERVER("/api/members") },
    expected: { tsc: 0, contract: 1, paths: ["src/client.ts:2"] },
  },
  {
    name: "HTTP route path changed, client fetch updated",
    control: true,
    base: { ...TS, "src/server.ts": SERVER("/api/users"), "src/client.ts": CLIENT("/api/users") },
    head: { "src/server.ts": SERVER("/api/members"), "src/client.ts": CLIENT("/api/members") },
    expected: { tsc: 0, contract: 0, paths: [] },
  },
  {
    name: "Python: route and task renamed on the server only",
    control: false,
    base: { "tasks.py": PY_SERVER("/api/users", "emails.welcome"), "client.py": PY_CLIENT("/api/users", "emails.welcome") },
    head: { "tasks.py": PY_SERVER("/api/members", "emails.send_welcome") },
    expected: { tsc: 0, contract: 2, paths: ["client.py:5", "client.py:8"] },
  },
  {
    name: "Python: route and task renamed on both sides",
    control: true,
    base: { "tasks.py": PY_SERVER("/api/users", "emails.welcome"), "client.py": PY_CLIENT("/api/users", "emails.welcome") },
    head: { "tasks.py": PY_SERVER("/api/members", "emails.send_welcome"), "client.py": PY_CLIENT("/api/members", "emails.send_welcome") },
    expected: { tsc: 0, contract: 0, paths: [] },
  },
  {
    name: "Go: env var and Redis key renamed in config only",
    control: false,
    base: { "go.mod": "module example.com/app\n\ngo 1.22\n", "config.go": GO_CONFIG("DATABASE_URL", "session:"), "main.go": GO_MAIN("DATABASE_URL", "session:") },
    head: { "config.go": GO_CONFIG("DB_URL", "sess:") },
    expected: { tsc: 0, contract: 2, paths: ["main.go:9", "main.go:10"] },
  },
  {
    name: "Go: env var and Redis key renamed in all readers",
    control: true,
    base: { "go.mod": "module example.com/app\n\ngo 1.22\n", "config.go": GO_CONFIG("DATABASE_URL", "session:"), "main.go": GO_MAIN("DATABASE_URL", "session:") },
    head: { "config.go": GO_CONFIG("DB_URL", "sess:"), "main.go": GO_MAIN("DB_URL", "sess:") },
    expected: { tsc: 0, contract: 0, paths: [] },
  },
];
