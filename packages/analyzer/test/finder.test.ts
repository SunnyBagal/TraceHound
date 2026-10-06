// Finder phase 1 (decision 051): graph rules → hypotheses, no model. One small fixture repo per
// case, written here (never Recall); each rule has positive and negative fixtures.
import { afterAll, describe, expect, it } from "vitest";
import { findHypotheses } from "../src/finder/index.ts";
import { FinderReport, type RuleFamily } from "../src/finder/hypothesis.ts";
import { makeFixtureRepo } from "./fixture-repo.ts";

const cleanups: (() => void)[] = [];
afterAll(() => cleanups.forEach((c) => c()));

/** A one-package app started from src/server.ts; `files` are the case. */
function find(files: Record<string, string>): FinderReport {
  const made = makeFixtureRepo({ "package.json": JSON.stringify({ name: "app", private: true, scripts: { start: "bun run src/server.ts" } }), ...files });
  cleanups.push(made.cleanup);
  return findHypotheses(made.repo, { now: () => new Date(0) }).report;
}
const of = (r: FinderReport, family: RuleFamily) => r.hypotheses.filter((h) => h.family === family);

// ── route-without-auth ──
const AUTH = 'import type { Request, Response, NextFunction } from "express";\nexport function requireAuth(req: Request, res: Response, next: NextFunction) {\n  if (!req.headers.authorization) return res.status(401).end();\n  next();\n}\n';

describe("route-without-auth@1", () => {
  it("fires on a route with no auth signal when a sibling route has route middleware", () => {
    const r = find({
      "src/auth.ts": AUTH,
      "src/server.ts":
        'import express from "express";\nimport { requireAuth } from "./auth.ts";\nconst app = express();\n' +
        'app.get("/notes", requireAuth, (req, res) => res.json([]));\n' +
        'app.delete("/notes/:id", (req, res) => res.json({ id: req.params.id }));\n' +
        "app.listen(3000);\n",
    });
    const hs = of(r, "route-without-auth");
    expect(hs.map((h) => h.question)).toEqual(["Does DELETE /notes/:id respond with data or perform its action for a caller who sends no credentials?"]);
    expect(hs[0]).toMatchObject({
      rule: { id: "route-without-auth@1" },
      statedInput: "DELETE /notes/:id with no Authorization header, no cookies and no API key; request fields the handler reads: params.id",
      graph: { evidenceIds: ["src/server.ts#L5-5:http-routes"], componentIds: [expect.any(String)] },
    });
    expect(hs[0]!.excerpts[0]).toMatchObject({ file: "src/server.ts", startLine: 5, endLine: 5, lines: ['app.delete("/notes/:id", (req, res) => res.json({ id: req.params.id }));'] });
    expect(() => FinderReport.parse(r)).not.toThrow();
  });

  it("joins mount prefixes and fires on the unguarded router only", () => {
    const r = find({
      "src/auth.ts": AUTH,
      "src/notes.ts": 'import { Router } from "express";\nexport const notes = Router();\nnotes.get("/", (req, res) => res.json([]));\n',
      "src/admin.ts": 'import { Router } from "express";\nexport const admin = Router();\nadmin.post("/purge", (req, res) => res.json({ ok: true }));\n',
      "src/server.ts":
        'import express from "express";\nimport { requireAuth } from "./auth.ts";\nimport { notes } from "./notes.ts";\nimport { admin } from "./admin.ts";\nconst app = express();\n' +
        'app.use("/api/notes", requireAuth, notes);\napp.use("/api/admin", admin);\napp.listen(3000);\n',
    });
    const hs = of(r, "route-without-auth");
    expect(hs.map((h) => h.question)).toEqual(["Does POST /api/admin/purge respond with data or perform its action for a caller who sends no credentials?"]);
    expect(hs[0]!.graph.evidenceIds).toEqual(["src/admin.ts#L3-3:http-routes", "src/server.ts#L7-7:http-routes"]);
  });

  it("negative: app-wide use(auth) before the routes, a guard in the handler body, public paths", () => {
    const r = find({
      "src/auth.ts": AUTH,
      "src/server.ts":
        'import express from "express";\nimport { requireAuth } from "./auth.ts";\nconst app = express();\n' +
        'app.get("/health", (req, res) => res.json({ ok: true }));\n' +
        'app.post("/login", (req, res) => res.json({}));\n' +
        'app.get("/me", (req, res) => {\n  if (!req.user) return res.status(401).end();\n  res.json(req.user);\n});\n' +
        "app.use(requireAuth);\n" +
        'app.get("/notes", (req, res) => res.json([]));\n' +
        "app.listen(3000);\n",
    });
    expect(of(r, "route-without-auth")).toEqual([]);
  });

  it("negative: a use(auth) registered after the route does not guard it, but no route anywhere has a signal → silent with a note", () => {
    const r = find({
      "src/server.ts": 'import express from "express";\nconst app = express();\napp.get("/notes", (req, res) => res.json([]));\napp.listen(3000);\n',
    });
    expect(of(r, "route-without-auth")).toEqual([]);
    expect(r.notes).toEqual(["route-without-auth: no route has an auth signal, so the rule is silent (it compares routes with each other)."]);
  });

  it("express applies use() in order: a route registered before use(requireAuth) fires", () => {
    const r = find({
      "src/auth.ts": AUTH,
      "src/server.ts":
        'import express from "express";\nimport { requireAuth } from "./auth.ts";\nconst app = express();\n' +
        'app.get("/export", (req, res) => res.json([]));\napp.use(requireAuth);\napp.get("/notes", (req, res) => res.json([]));\napp.listen(3000);\n',
    });
    expect(of(r, "route-without-auth").map((h) => h.question)).toEqual(["Does GET /export respond with data or perform its action for a caller who sends no credentials?"]);
  });
});

// ── payload-field-missing ──
const QUEUE = 'import { Queue } from "bullmq";\nexport const emails = new Queue("emails");\n';

describe("payload-field-missing@1", () => {
  it("fires when the processor reads a field the producer's payload type lacks", () => {
    const r = find({
      "src/queue.ts": QUEUE,
      "src/server.ts": 'import { emails } from "./queue.ts";\nexport async function signup(email: string) {\n  await emails.add("welcome", { to: email });\n}\nawait signup("a@b.c");\n',
      "src/worker.ts":
        'import { Worker, type Job } from "bullmq";\nasync function send(job: Job) {\n  const to = job.data.to;\n  const name = job.data.name;\n  console.log(to.trim(), name.trim());\n}\nnew Worker("emails", send);\n',
    });
    const hs = of(r, "payload-field-missing");
    expect(hs).toHaveLength(1);
    expect(hs[0]).toMatchObject({
      question: 'When the job added at src/server.ts:3 reaches the processor of queue "emails", which reads job.data.name, does the processor behave correctly with that field absent?',
      statedInput: 'A job on queue "emails" named "welcome" whose data has the producer\'s keys { to } and no "name"',
      graph: { evidenceIds: ["src/server.ts#L3-3:bullmq-queues", "src/worker.ts#L7-7:bullmq-queues"], componentIds: expect.arrayContaining(["bullmq:emails"]) },
    });
    expect(hs[0]!.graph.edgeIds).toHaveLength(2);
    expect(hs[0]!.excerpts.map((e) => [e.file, e.startLine])).toEqual([["src/server.ts", 3], ["src/worker.ts", 7], ["src/worker.ts", 4]]);
  });

  it("follows destructuring and one call that receives job.data", () => {
    const r = find({
      "src/queue.ts": QUEUE,
      "src/server.ts": 'import { emails } from "./queue.ts";\nawait emails.add("welcome", { to: "a@b.c" });\n',
      "src/worker.ts":
        'import { Worker, type Job } from "bullmq";\nfunction render(data: any) {\n  const { to, subject } = data;\n  return `${to}: ${subject.toUpperCase()}`;\n}\nnew Worker("emails", async (job: Job) => render(job.data));\n',
    });
    expect(of(r, "payload-field-missing").map((h) => /job\.data\.(\w+)/.exec(h.question)?.[1])).toEqual(["subject"]);
  });

  it("negative: every field sent, a guarded read, an unknown payload type", () => {
    const r = find({
      "src/queue.ts": QUEUE,
      "src/server.ts":
        'import { emails } from "./queue.ts";\nexport async function a(to: string) {\n  await emails.add("welcome", { to, name: "x" });\n}\n' +
        "export async function b(payload: any) {\n  await emails.add(\"raw\", payload);\n}\nawait a(\"x\");\nawait b({});\n",
      "src/worker.ts":
        'import { Worker, type Job } from "bullmq";\nnew Worker("emails", async (job: Job) => {\n  const subject = job.data.subject ?? "hello";\n  console.log(job.data.to, job.data.name, subject);\n});\n',
    });
    expect(of(r, "payload-field-missing")).toEqual([]);
  });

  it("negative: a processor that branches on job.name fires only when no producer sends the field", () => {
    const r = find({
      "src/queue.ts": QUEUE,
      "src/server.ts": 'import { emails } from "./queue.ts";\nawait emails.add("welcome", { to: "a" });\nawait emails.add("digest", { to: "a", items: [] as string[] });\n',
      "src/worker.ts":
        'import { Worker, type Job } from "bullmq";\nnew Worker("emails", async (job: Job) => {\n  if (job.name === "digest") console.log(job.data.items.length);\n  console.log(job.data.to);\n});\n',
    });
    expect(of(r, "payload-field-missing")).toEqual([]);
  });
});

// ── request-to-fetch ──
describe("request-to-fetch@1", () => {
  it("fires when a body value reaches fetch() through a variable and a service function", () => {
    const r = find({
      "src/preview.ts": "export async function preview(target: string) {\n  const res = await fetch(target);\n  return res.text();\n}\n",
      "src/server.ts":
        'import express from "express";\nimport { preview } from "./preview.ts";\nconst app = express();\n' +
        'app.post("/preview", async (req, res) => {\n  const { url } = req.body;\n  res.send(await preview(url));\n});\napp.listen(3000);\n',
    });
    const hs = of(r, "request-to-fetch");
    expect(hs).toHaveLength(1);
    expect(hs[0]).toMatchObject({
      question: "Can a caller of POST /preview choose the URL or host of the outbound fetch call?",
      statedInput: "POST /preview with a request value set to a URL whose host the caller chooses (for example http://127.0.0.1:9/); request fields the handler reads: body.url",
      graph: { evidenceIds: ["src/server.ts#L4-7:http-routes"] },
    });
    expect(hs[0]!.excerpts.map((e) => [e.file, e.startLine, e.why])).toEqual([
      ["src/server.ts", 4, "the route registration"],
      ["src/server.ts", 6, "the request value is passed on"],
      ["src/preview.ts", 2, "the outbound request"],
    ]);
  });

  it("follows the value across a BullMQ queue into the processor", () => {
    const r = find({
      "src/queue.ts": 'import { Queue } from "bullmq";\nexport const crawl = new Queue("crawl");\n',
      "src/server.ts":
        'import express from "express";\nimport { crawl } from "./queue.ts";\nconst app = express();\n' +
        'app.post("/crawl", async (req, res) => {\n  await crawl.add("page", { link: req.query.link, at: Date.now() });\n  res.status(202).end();\n});\napp.listen(3000);\n',
      "src/worker.ts":
        'import axios from "axios";\nimport { Worker, type Job } from "bullmq";\nnew Worker("crawl", async (job: Job) => {\n  await axios.get(job.data.link);\n  await axios.get("https://example.com/" + job.data.at);\n});\n',
    });
    const hs = of(r, "request-to-fetch");
    expect(hs.map((h) => h.question)).toEqual(['Can a caller of POST /crawl choose the URL or host of the outbound axios.get call through queue "crawl" (job data link)?']);
    expect(hs[0]!.graph.evidenceIds).toEqual(["src/server.ts#L4-7:http-routes", "src/server.ts#L5-5:bullmq-queues", "src/worker.ts#L3-6:bullmq-queues"]);
    expect(hs[0]!.graph.edgeIds).toHaveLength(2);
  });

  it("negative: a fixed URL, a request value only in the fetch body, a value from headers", () => {
    const r = find({
      "src/server.ts":
        'import express from "express";\nconst app = express();\n' +
        'app.post("/notify", async (req, res) => {\n  await fetch("https://hooks.example.com/x", { method: "POST", body: JSON.stringify(req.body) });\n' +
        '  await fetch(`https://api.example.com/v1/${String(req.headers["x-region"])}`);\n  res.end();\n});\napp.listen(3000);\n',
    });
    expect(of(r, "request-to-fetch")).toEqual([]);
  });

  it("negative: a repo function named fetch is not an outbound call", () => {
    const r = find({
      "src/server.ts":
        'import express from "express";\nconst app = express();\nfunction fetch(id: string) {\n  return { id };\n}\n' +
        'app.get("/items/:id", (req, res) => res.json(fetch(req.params.id)));\napp.listen(3000);\n',
    });
    expect(of(r, "request-to-fetch")).toEqual([]);
  });
});

describe("report", () => {
  it("counts every family and is deterministic for one commit", () => {
    const files = { "src/server.ts": 'import express from "express";\nconst app = express();\napp.get("/x", (req, res) => res.end());\napp.listen(3000);\n' };
    const a = find(files);
    expect(a.counts).toEqual({ "route-without-auth": 0, "payload-field-missing": 0, "request-to-fetch": 0 });
    expect(a.finderVersion).toBe("finder-rules@1");
    const { generatedAt: _a, repo: _r, ...rest } = a;
    const { generatedAt: _b, repo: _s, ...again } = find(files);
    expect(again).toEqual(rest);
  });
});
