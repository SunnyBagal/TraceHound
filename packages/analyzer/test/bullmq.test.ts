// BullMQ detector bullmq-queues@0.1 (decision 035): one fixture repo per case, analyzed for real.
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

describe("bullmq-queues@0.1: queue definitions, producers and consumers → produces/consumes through one node per queue name", () => {
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
    expect(produced.detail).toBe('emails.add("welcome") produces job "welcome" on queue "emails" (defined at src/api.ts:2) (bullmq-queues@0.1)');
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
    expect(queueWarnings(s)).toEqual([["queue-unresolved", "BullMQ produce at src/api.ts:3: q.add(…) on a Queue whose definition isn't resolvable is not static, so it can't be paired; no node, no edge"]]);
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
