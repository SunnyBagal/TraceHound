// BullMQ detector bullmq-queues@0.2 (decision 035): one fixture repo per case, analyzed for real.
import { afterAll, describe, expect, it } from "vitest";
import type { Snapshot } from "../src/schema.ts";
import { makeFixtureRepo } from "./fixture-repo.ts";

const cleanups: (() => void)[] = [];
afterAll(() => cleanups.forEach((c) => c()));

/** A one-package app whose package.json starts src/api.ts only; the other files are the case. */
function analyze(files: Record<string, string>): Snapshot {
  const made = makeFixtureRepo({
    "package.json": JSON.stringify({ name: "app", private: true, scripts: { start: "bun run src/api.ts" } }),
    ...files,
  });
  cleanups.push(made.cleanup);
  return made.snapshot;
}
const componentOf = (s: Snapshot, file: string) => s.components.find((c) => c.files.includes(file))!.id;
const queueEdges = (s: Snapshot) =>
  s.edges
    .filter((e) => e.kind === "produces" || e.kind === "consumes")
    .sort((a, b) => a.kind.localeCompare(b.kind))
    .map((e) => [e.kind, e.source, e.target, e.label, e.confidenceLabel]);
const queueWarnings = (s: Snapshot) => s.warnings.filter((w) => w.kind.startsWith("queue-")).map((w) => [w.kind, w.message]);
const evidence = (s: Snapshot, id: string) => s.evidence.find((e) => e.id === id)!;
const WORKER = 'import { Worker } from "bullmq";\nasync function sendEmail(job: { data: unknown }) {\n  console.log(job.data);\n}\nnew Worker("emails", sendEmail, { concurrency: 2 });\n';

describe("bullmq-queues@0.2: queue definitions, producers and consumers → produces/consumes through one node per queue name", () => {
  it("literal names on both sides: proven edges, evidence at both ends, the job name in the producer's evidence", () => {
    const s = analyze({
      "src/api.ts": 'import { Queue } from "bullmq";\nconst emails = new Queue("emails");\nexport async function signup() {\n  await emails.add("welcome", { to: "a@b.c" });\n}\nawait signup();\n',
      "src/worker.ts": WORKER,
    });
    const api = componentOf(s, "src/api.ts");
    const worker = componentOf(s, "src/worker.ts");
    expect(queueEdges(s)).toEqual([
      ["consumes", "bullmq:emails", worker, "Worker sendEmail", "proven"],
      ["produces", api, "bullmq:emails", "add welcome", "proven"],
    ]);
    expect(s.components.find((c) => c.id === "bullmq:emails")).toMatchObject({ kind: "queue", files: [], resource: { tech: "bullmq", keys: ["emails"] }, subtitle: "BullMQ queue · emails · jobs: welcome" });
    const produced = evidence(s, s.edges.find((e) => e.kind === "produces")!.evidenceIds[0]!);
    expect(produced).toMatchObject({ file: "src/api.ts", range: { startLine: 4 }, extractor: "bullmq-queues", resolution: "proven" });
    expect(produced.detail).toBe('emails.add("welcome") produces job "welcome" on queue "emails" (defined at src/api.ts:2) (bullmq-queues@0.2)');
    const consumed = evidence(s, s.edges.find((e) => e.kind === "consumes")!.evidenceIds[0]!);
    expect(consumed).toMatchObject({ file: "src/worker.ts", range: { startLine: 5 }, extractor: "bullmq-queues", resolution: "proven" });
    expect(queueWarnings(s)).toEqual([]);
  });

  it("a const name resolved within the module: resolved-default on both sides", () => {
    const s = analyze({
      "src/api.ts": 'import { Queue } from "bullmq";\nconst EMAILS = "emails";\nconst q = new Queue(EMAILS);\nawait q.add("welcome", {});\n',
      "src/worker.ts": 'import { Worker } from "bullmq";\nconst EMAILS = "emails";\nnew Worker(EMAILS, async () => {});\n',
    });
    expect(queueEdges(s).map((e) => [e[0], e[3], e[4]])).toEqual([
      ["consumes", "Worker <inline function>", "resolved-default"],
      ["produces", "add welcome", "resolved-default"],
    ]);
    expect(queueWarnings(s)).toEqual([]);
  });

  it("a name built at runtime: a template pairs by its pattern (dynamic); an env-only name can't pair and is a warning, not an edge", () => {
    const s = analyze({
      "src/api.ts": 'import { Queue } from "bullmq";\nconst q = new Queue(`emails-${process.env.REGION}`);\nawait q.add("welcome", {});\n',
      "src/worker.ts": 'import { Worker } from "bullmq";\nnew Worker(`emails-${process.env.REGION}`, async () => {});\nnew Worker(process.env.AUDIT_QUEUE!, async () => {});\n',
    });
    expect(queueEdges(s).map((e) => [e[0], e[1] === "bullmq:emails-dynamic" || e[2] === "bullmq:emails-dynamic", e[4]])).toEqual([
      ["consumes", true, "dynamic"],
      ["produces", true, "dynamic"],
    ]);
    expect(s.components.find((c) => c.id === "bullmq:emails-dynamic")!.resource!.keys).toEqual(["emails-*"]);
    expect(queueWarnings(s)).toEqual([
      ["queue-unresolved", "BullMQ consume at src/worker.ts:3: queue name process.env.AUDIT_QUEUE! is not static, so it can't be paired; no node, no edge"],
    ]);
  });

  it("an unpaired producer: its edge to the queue is drawn, and it's a warning", () => {
    const s = analyze({ "src/api.ts": 'import { Queue } from "bullmq";\nconst q = new Queue("reports");\nawait q.add("nightly", {});\n' });
    expect(queueEdges(s)).toEqual([["produces", componentOf(s, "src/api.ts"), "bullmq:reports", "add nightly", "proven"]]);
    expect(queueWarnings(s)).toEqual([["queue-unpaired", 'BullMQ producer at src/api.ts:3 adds to queue "reports", but no Worker consumes "reports" in this repo']]);
  });

  it("a producer through an imported queue variable: resolved to its definition via symbols, the edge starts at the producer's component", () => {
    const s = analyze({
      "src/queues.ts": 'import { Queue } from "bullmq";\nexport const emailQueue = new Queue("emails");\n',
      "src/api.ts": 'import { emailQueue } from "./queues.ts";\nexport async function signup() {\n  await emailQueue.add("welcome", {});\n}\nawait signup();\n',
      "src/worker.ts": WORKER,
    });
    const produce = s.files.find((f) => f.path === "src/api.ts")!.queueOps!;
    expect(produce).toMatchObject([{ role: "produce", queue: { value: "emails" }, jobName: { value: "welcome" }, variable: "emailQueue", definedAt: "src/queues.ts:2", resolution: "proven" }]);
    expect(queueEdges(s)).toContainEqual(["produces", componentOf(s, "src/api.ts"), "bullmq:emails", "add welcome", "proven"]);
    expect(queueWarnings(s)).toEqual([]);
  });

  it("a Worker file nothing imports is a process entry point (its own worker component), not an orphan", () => {
    const s = analyze({ "src/api.ts": 'import { Queue } from "bullmq";\nconst q = new Queue("emails");\nawait q.add("welcome", {});\n', "src/worker.ts": WORKER });
    expect(s.files.find((f) => f.path === "src/worker.ts")).toMatchObject({ isEntry: true, entryReason: "constructs a BullMQ Worker (process entry point)" });
    expect(s.warnings.filter((w) => w.kind === "orphan-file")).toEqual([]);
    const worker = s.components.find((c) => c.files.includes("src/worker.ts"))!;
    expect(worker).toMatchObject({ kind: "worker", subtitle: "Consumes emails" });
    expect(worker.entryPoints).toContainEqual({ file: "src/worker.ts", symbol: "Worker emails", reason: "queue consumer" });
    expect(componentOf(s, "src/api.ts")).not.toBe(worker.id);
  });

  it("out of scope, but never silent: QueueEvents, FlowProducer and job-name filtering in a processor are warnings", () => {
    const s = analyze({
      "src/api.ts": 'import { Queue, QueueEvents, FlowProducer } from "bullmq";\nconst q = new Queue("emails");\nawait q.add("welcome", {});\nnew QueueEvents("emails");\nnew FlowProducer();\n',
      "src/worker.ts": 'import { Worker } from "bullmq";\nnew Worker("emails", async (job) => {\n  if (job.name === "welcome") console.log(job.data);\n});\n',
    });
    expect(queueWarnings(s)).toEqual([
      ["queue-unsupported", "BullMQ new QueueEvents(…) at src/api.ts:4 is not modeled by the bullmq-queues detector; no edge drawn for it"],
      ["queue-unsupported", "BullMQ new FlowProducer(…) at src/api.ts:5 is not modeled by the bullmq-queues detector; no edge drawn for it"],
      ["queue-unsupported", "BullMQ job-name filtering in <inline function> (job.name) at src/worker.ts:3 is not modeled by the bullmq-queues detector; no edge drawn for it"],
    ]);
    expect(queueEdges(s)).toHaveLength(2); // the modeled producer and consumer still pair
  });

  it("a queue receiver that only has a bullmq Queue type (no resolvable definition) is recorded and warned about", () => {
    const s = analyze({ "src/api.ts": 'import type { Queue } from "bullmq";\nexport async function enqueue(q: Queue) {\n  await q.add("welcome", {});\n}\n' });
    expect(queueEdges(s)).toEqual([]);
    expect(queueWarnings(s)).toEqual([["queue-unresolved", "BullMQ produce at src/api.ts:3: q.add(…) on parameter q of enqueue, which no call site of enqueue wires to a Queue; its queue isn't known, so it can't be paired; no node, no edge"]]);
  });
});

describe("bullmq-queues@0.2: a queue that reaches the producer through a parameter or a factory (decision 042)", () => {
  // generic shapes: the queue is built in one module and handed to the code that adds to it
  const QUEUES = 'import { Queue } from "bullmq";\nexport const emails = new Queue("emails");\n';
  const APP = 'export interface Mailer {\n  add(name: string, data: unknown): Promise<unknown>;\n}\nexport function buildApp(deps: { mailer: Mailer; port: number }) {\n  const { mailer } = deps;\n  return async function signup(to: string) {\n    await mailer.add("welcome", { to });\n  };\n}\n';
  const MAIN = 'import { buildApp } from "./app.ts";\nimport { emails } from "./queues.ts";\nconst signup = buildApp({ mailer: emails, port: 3000 });\nawait signup("a@b.c");\n';
  const produces = (s: Snapshot) => s.edges.filter((e) => e.kind === "produces");
  const sites = (s: Snapshot, ids: string[]) => ids.map((id) => evidence(s, id)).map((e) => [`${e.file}:${e.range.startLine}`, e.resolution]);

  it("a. one parameter (object property, destructured), one call site: the edge cites the add site, the wiring call site and the Queue construction", () => {
    const s = analyze({ "src/queues.ts": QUEUES, "src/app.ts": APP, "src/api.ts": MAIN, "src/worker.ts": WORKER });
    expect(queueEdges(s)).toContainEqual(["produces", componentOf(s, "src/app.ts"), "bullmq:emails", "add welcome", "resolved-default"]);
    const edge = produces(s)[0]!;
    expect(sites(s, edge.evidenceIds)).toEqual([
      ["src/api.ts:3", "resolved-default"], // the wiring call site
      ["src/app.ts:7", "resolved-default"], // the add site
      ["src/queues.ts:2", "resolved-default"], // the Queue construction
    ]);
    const fact = s.files.find((f) => f.path === "src/app.ts")!.queueOps![0]!;
    expect(fact).toMatchObject({ role: "produce", queue: { value: "emails" }, resolution: "resolved-default", jobName: { value: "welcome" }, variable: "mailer", definedAt: "src/queues.ts:2", wiredAt: ["src/api.ts:3"] });
    expect(evidence(s, fact.evidenceId).detail).toBe(
      'mailer.add("welcome") produces job "welcome" on queue "emails": mailer is parameter deps.mailer of buildApp, wired at src/api.ts:3 to the Queue defined at src/queues.ts:2 (bullmq-queues@0.2)',
    );
    expect(fact.supportEvidenceIds!.map((id) => evidence(s, id).detail)).toEqual([
      'buildApp(…) passes emails as deps.mailer: the Queue "emails" defined at src/queues.ts:2, which src/app.ts:7 adds to (bullmq-queues@0.2)',
      'new Queue("emails") is the queue passed to buildApp at src/api.ts:3 and added to at src/app.ts:7 (bullmq-queues@0.2)',
    ]);
    expect(queueWarnings(s)).toEqual([]);
  });

  it("b. a second call site in a test file passes a fake: the same edge to the real queue; the fake creates no node, edge or warning", () => {
    const s = analyze({
      "src/queues.ts": QUEUES,
      "src/app.ts": APP,
      "src/api.ts": MAIN,
      "src/worker.ts": WORKER,
      "src/app.test.ts": 'import { buildApp } from "./app.ts";\nconst sent: unknown[] = [];\nconst fake = { add: async (_name: string, data: unknown) => void sent.push(data) };\nconst signup = buildApp({ mailer: fake, port: 0 });\nawait signup("t@t.t");\n',
    });
    expect(queueEdges(s)).toEqual([
      ["consumes", "bullmq:emails", componentOf(s, "src/worker.ts"), "Worker sendEmail", "proven"],
      ["produces", componentOf(s, "src/app.ts"), "bullmq:emails", "add welcome", "resolved-default"],
    ]);
    expect(s.components.filter((c) => c.kind === "queue").map((c) => c.id)).toEqual(["bullmq:emails"]);
    const fact = s.files.find((f) => f.path === "src/app.ts")!.queueOps![0]!;
    expect(fact.wiredAt).toEqual(["src/api.ts:3"]);
    expect(evidence(s, fact.evidenceId).detail).toContain("wired at src/api.ts:3 to the Queue defined at src/queues.ts:2; 1 other call site passes something that is not a BullMQ Queue (src/app.test.ts:4)");
    expect(s.files.find((f) => f.path === "src/app.test.ts")!.queueOps).toBeUndefined();
    expect(queueWarnings(s)).toEqual([]);
  });

  it("c. two call sites wire two different real queues: one edge per queue, dynamic, never proven", () => {
    const s = analyze({
      "src/queues.ts": 'import { Queue } from "bullmq";\nexport const emails = new Queue("emails");\nexport const sms = new Queue("sms");\n',
      "src/app.ts": APP,
      "src/api.ts": 'import { buildApp } from "./app.ts";\nimport { emails, sms } from "./queues.ts";\nawait buildApp({ mailer: emails, port: 3000 })("a@b.c");\nawait buildApp({ mailer: sms, port: 3001 })("+1");\n',
    });
    const app = componentOf(s, "src/app.ts");
    expect(queueEdges(s)).toEqual([
      ["produces", app, "bullmq:emails", "add welcome", "dynamic"],
      ["produces", app, "bullmq:sms", "add welcome", "dynamic"],
    ]);
    const [toEmails, toSms] = produces(s);
    expect(sites(s, toEmails!.evidenceIds).map((x) => x[0])).toEqual(["src/api.ts:3", "src/app.ts:7", "src/queues.ts:2"]);
    expect(sites(s, toSms!.evidenceIds).map((x) => x[0])).toEqual(["src/api.ts:4", "src/app.ts:7", "src/queues.ts:3"]);
    expect(evidence(s, toSms!.evidenceIds.find((id) => id.startsWith("src/app.ts"))!).detail).toContain('one of 2 queues wired into buildApp ("emails", "sms"); which one a call reaches is decided at runtime');
  });

  it("d. no call site resolves to a Queue within one hop: no edge, and a warning naming the add site", () => {
    // two parameter hops: main → start(deps) → register(deps.mailer) → mailer.add
    const s = analyze({
      "src/queues.ts": QUEUES,
      "src/routes.ts": 'export function register(mailer: { add(name: string, data: unknown): Promise<unknown> }) {\n  return (to: string) => mailer.add("welcome", { to });\n}\n',
      "src/app.ts": 'import { register } from "./routes.ts";\nexport function start(deps: { mailer: { add(name: string, data: unknown): Promise<unknown> } }) {\n  return register(deps.mailer);\n}\n',
      "src/api.ts": 'import { start } from "./app.ts";\nimport { emails } from "./queues.ts";\nawait start({ mailer: emails })("a@b.c");\n',
      "src/worker.ts": WORKER,
    });
    expect(produces(s)).toEqual([]);
    expect(queueWarnings(s)).toEqual([
      ["queue-unresolved", "BullMQ produce at src/routes.ts:2: mailer.add(…) on parameter mailer of register, which reaches a Queue only through more than one parameter hop (one is followed); its queue isn't known, so it can't be paired; no node, no edge"],
      ["queue-unpaired", 'BullMQ Worker at src/worker.ts:5 consumes queue "emails", but nothing in this repo adds to "emails"'],
    ]);
    // an .add on a parameter that nothing ties to BullMQ stays what it was: not a fact
    const plain = analyze({ "src/api.ts": "export function remember(seen: Set<string>, id: string) {\n  seen.add(id);\n}\nremember(new Set(), \"a\");\n" });
    expect(plain.files[0]!.queueOps).toBeUndefined();
    expect(queueWarnings(plain)).toEqual([]);
  });

  it("e. a Queue returned from a factory function and destructured from its result", () => {
    const s = analyze({
      "src/queues.ts": 'import { Queue } from "bullmq";\nexport function createQueues() {\n  const connection = { host: "localhost" };\n  const emails = new Queue("emails", { connection });\n  return { connection, emails };\n}\n',
      "src/api.ts": 'import { createQueues } from "./queues.ts";\nconst { emails } = createQueues();\nawait emails.add("welcome", {});\n',
      "src/worker.ts": WORKER,
    });
    expect(queueEdges(s)).toContainEqual(["produces", componentOf(s, "src/api.ts"), "bullmq:emails", "add welcome", "proven"]);
    expect(s.files.find((f) => f.path === "src/api.ts")!.queueOps).toMatchObject([{ role: "produce", queue: { value: "emails" }, definedAt: "src/queues.ts:4", resolution: "proven" }]);
    expect(queueWarnings(s)).toEqual([]);
    // a factory whose returns disagree is not resolved
    const two = analyze({
      "src/api.ts": 'import { Queue } from "bullmq";\nfunction pick(fast: boolean) {\n  if (fast) return new Queue("fast");\n  return new Queue("slow");\n}\nconst q = pick(true);\nawait q.add("job", {});\n',
    });
    expect(produces(two)).toEqual([]);
  });

  it("a + e together: a factory-built queue passed through one parameter, with a test wiring a fake", () => {
    const s = analyze({
      "src/queues.ts": 'import { Queue } from "bullmq";\nexport function createQueues() {\n  const emails = new Queue("emails");\n  return { emails };\n}\n',
      "src/app.ts": APP,
      "src/api.ts": 'import { buildApp } from "./app.ts";\nimport { createQueues } from "./queues.ts";\nconst { emails } = createQueues();\nawait buildApp({ mailer: emails, port: 1 })("a@b.c");\n',
      "src/worker.ts": WORKER,
    });
    expect(queueEdges(s)).toContainEqual(["produces", componentOf(s, "src/app.ts"), "bullmq:emails", "add welcome", "resolved-default"]);
    expect(sites(s, produces(s)[0]!.evidenceIds).map((x) => x[0])).toEqual(["src/api.ts:4", "src/app.ts:7", "src/queues.ts:3"]);
    expect(queueWarnings(s)).toEqual([]);
  });

  it("f. a Worker whose processor is an arrow function wrapping one named function: the label names that function", () => {
    const s = analyze({
      "src/api.ts": 'import { Queue } from "bullmq";\nconst q = new Queue("emails");\nawait q.add("welcome", {});\n',
      "src/worker.ts": 'import { Worker } from "bullmq";\nasync function sendEmail(job: { data: unknown }, retries: number) {\n  console.log(job.data, retries);\n}\nnew Worker("emails", async (job) => sendEmail(job, 3));\n',
      "src/worker2.ts": 'import { Worker } from "bullmq";\nasync function archive(job: { data: unknown }) {\n  console.log(job.data);\n}\nnew Worker("emails", async (job) => {\n  await archive(job);\n});\nnew Worker("emails", async (job) => {\n  console.log("start");\n  await archive(job);\n});\n',
    });
    const consumes = s.edges.filter((e) => e.kind === "consumes").map((e) => e.label);
    expect(consumes).toContain("Worker sendEmail");
    expect(consumes).toContain("Worker <inline function>, Worker archive"); // two statements: still inline
    const fact = s.files.find((f) => f.path === "src/worker.ts")!.queueOps![0]!;
    expect(fact.handler).toBe("sendEmail");
    expect(evidence(s, fact.evidenceId).detail).toBe('new Worker("emails", sendEmail) consumes queue "emails"; the processor is an inline function that only calls sendEmail (bullmq-queues@0.2)');
  });
});

describe("tracehound.json name-only overrides and summary: false (0.7.0)", () => {
  it("renames by component id without pinning files (no model naming for it), drops summaries, and warns on unknown ids", () => {
    const s = analyze({
      "tracehound.json": JSON.stringify({ components: { "bullmq:emails": { name: "Email Queue" }, "app:app-app": { summary: false }, "no:such": { name: "Ghost" } } }),
      "src/api.ts": 'import { Queue } from "bullmq";\nconst q = new Queue("emails");\nawait q.add("welcome", {});\n',
      "src/worker.ts": WORKER,
    });
    const queue = s.components.find((c) => c.id === "bullmq:emails")!;
    expect(queue).toMatchObject({ name: "Email Queue", naming: { source: "override", heuristicName: "emails queue" } });
    expect(queue.files).toEqual([]);
    expect(s.components.find((c) => c.id === "app:app-app")!.naming).toMatchObject({ source: "heuristic", summaryDropped: true });
    expect(s.warnings.filter((w) => w.kind === "override-unmatched").map((w) => w.message)).toEqual(['override "no:such" in tracehound.json names no component in this snapshot']);
  });

  it("the schema refuses an override with nothing to do, and kind without files", async () => {
    const { TraceHoundConfig } = await import("../src/config.ts");
    expect(TraceHoundConfig.safeParse({ components: { a: {} } }).success).toBe(false);
    expect(TraceHoundConfig.safeParse({ components: { a: { kind: "worker" } } }).success).toBe(false);
    expect(TraceHoundConfig.safeParse({ components: { a: { summary: false } } }).success).toBe(true);
  });
});

describe("tracehound.json ignore and entryPoints (0.7.0)", () => {
  it("ignored files are left out and listed; entryPoints globs mark entry files; a glob matching nothing is a warning", () => {
    const s = analyze({
      "tracehound.json": JSON.stringify({ ignore: ["bench/**", "nothing/**"], entryPoints: ["src/main.tsx"] }),
      "src/api.ts": "export const x = 1;\n",
      "src/main.tsx": 'import { x } from "./api.ts";\nconsole.log(x);\n',
      "bench/run.ts": 'import { x } from "../src/api.ts";\nconsole.log(x);\n',
    });
    expect(s.files.map((f) => f.path)).toEqual(["src/api.ts", "src/main.tsx"]);
    expect(s.ignored).toEqual([{ file: "bench/run.ts", glob: "bench/**" }]);
    expect(s.files.find((f) => f.path === "src/main.tsx")).toMatchObject({ isEntry: true, entryReason: "tracehound.json entryPoints (src/main.tsx)" });
    expect(s.warnings.map((w) => [w.kind, w.message])).toEqual([["override-unmatched", 'glob "nothing/**" in tracehound.json matched no files']]);
  });
});
