// Change sets (decision 038): one fixture repo (base commit → head commit) per case.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { computeChangeSet } from "../src/changes/changeset.ts";
import { cleanGitEnv } from "../src/git-env.ts";
import type { ChangeSet } from "../src/schema.ts";

const repos: string[] = [];
afterAll(() => repos.forEach((r) => rmSync(r, { recursive: true, force: true })));

const PKG = { "package.json": JSON.stringify({ name: "app", private: true, scripts: { start: "bun run src/app.ts" } }) };
/** Commit `base`, then apply `head` (null deletes a file) and commit; return the change set. */
function changes(base: Record<string, string>, head: Record<string, string | null>): ChangeSet {
  const repo = mkdtempSync(path.join(tmpdir(), "tracehound-changes-test-"));
  repos.push(repo);
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", env: cleanGitEnv() }).trim();
  const write = (files: Record<string, string | null>) => {
    for (const [f, text] of Object.entries(files)) {
      const abs = path.join(repo, f);
      if (text === null) rmSync(abs);
      else {
        mkdirSync(path.dirname(abs), { recursive: true });
        writeFileSync(abs, text);
      }
    }
  };
  git("init", "-q", "-b", "main");
  write({ ...PKG, ...base });
  git("add", "-A");
  git("commit", "-qm", "base");
  write(head);
  git("add", "-A");
  git("commit", "-qm", "head");
  return computeChangeSet({ repo, base: "HEAD~1", head: "HEAD" });
}
const decl = (c: ChangeSet, id: string) => c.declarations.find((d) => d.id === id);
const edge = (c: ChangeSet, id: string) => c.edges.find((e) => e.id === id);

describe("change sets: declarations", () => {
  it("each status: added, removed, modified, and unchanged (listed because an added call points at it); +/- lines per span", () => {
    const c = changes(
      { "src/app.ts": "export function keep() {\n  return 1;\n}\nexport function change() {\n  return 1;\n}\nexport function drop() {\n  return 1;\n}\n" },
      { "src/app.ts": "export function keep() {\n  return 1;\n}\nexport function change() {\n  return 2;\n}\nexport function fresh() {\n  return keep();\n}\n" },
    );
    // +/- lines are git's hunk lines inside each span: git pairs drop's closing "}" with fresh's, so 2 each
    expect(decl(c, "src/app.ts#fresh")).toMatchObject({ status: "added", kind: "function", exported: true, lines: { added: 2, removed: 0 }, head: { file: "src/app.ts", startLine: 7, endLine: 9 } });
    expect(decl(c, "src/app.ts#drop")).toMatchObject({ status: "removed", lines: { added: 0, removed: 2 }, base: { startLine: 7, endLine: 9 } });
    expect(decl(c, "src/app.ts#drop")!.head).toBeUndefined();
    expect(decl(c, "src/app.ts#change")).toMatchObject({ status: "modified", modifications: ["body"], lines: { added: 1, removed: 1 } });
    expect(decl(c, "src/app.ts#keep")).toMatchObject({ status: "unchanged", modifications: [] });
    expect(c.stats.declarations).toMatchObject({ added: 1, removed: 1, modified: 1 });
  });

  it("a method-level change inside a class: the method is modified, its siblings and the class header are not", () => {
    const cls = (total: string) => `export class Cart {\n  items: number[] = [];\n  add(n: number) {\n    this.items.push(n);\n  }\n  total() {\n    ${total}\n  }\n}\n`;
    const c = changes({ "src/app.ts": cls("return this.items.length;") }, { "src/app.ts": cls("return this.items.reduce((a, b) => a + b, 0);") });
    expect(decl(c, "src/app.ts#Cart.total")).toMatchObject({ status: "modified", kind: "method", modifications: ["body"], lines: { added: 1, removed: 1 } });
    expect(decl(c, "src/app.ts#Cart.add")).toBeUndefined(); // unchanged and nothing points at it
    expect(decl(c, "src/app.ts#Cart.items")).toBeUndefined();
    expect(decl(c, "src/app.ts#Cart")).toBeUndefined(); // the class's own header/body (members as markers) didn't change
  });

  it("signature vs body-only vs annotated return type", () => {
    const c = changes(
      { "src/app.ts": "export function f(a: number) {\n  return a;\n}\nexport function g(a: number) {\n  return a;\n}\nexport function h(a: number): number {\n  return a;\n}\n" },
      { "src/app.ts": "export function f(a: number, b = 0) {\n  return a;\n}\nexport function g(a: number) {\n  return a + 1;\n}\nexport function h(a: number): number | string {\n  return a;\n}\n" },
    );
    expect(decl(c, "src/app.ts#f")!.modifications).toEqual(["signature"]);
    expect(decl(c, "src/app.ts#g")!.modifications).toEqual(["body"]);
    expect(decl(c, "src/app.ts#h")!.modifications).toEqual(["returnType"]);
  });

  it("a renamed function appears as removed + added (no rename detection)", () => {
    const c = changes({ "src/app.ts": "export function oldName() {\n  return 1;\n}\n" }, { "src/app.ts": "export function newName() {\n  return 1;\n}\n" });
    expect(decl(c, "src/app.ts#oldName")!.status).toBe("removed");
    expect(decl(c, "src/app.ts#newName")!.status).toBe("added");
    expect(c.limitations.some((l) => l.startsWith("Renames are not detected"))).toBe(true);
  });
});

describe("change sets: edges", () => {
  const BASE = "export function g() {\n  return 1;\n}\n";
  it("an added call: an added calls edge with head evidence", () => {
    const c = changes({ "src/app.ts": `${BASE}export function h() {\n  return 0;\n}\n` }, { "src/app.ts": `${BASE}export function h() {\n  return g();\n}\n` });
    expect(edge(c, "src/app.ts#h->src/app.ts#g:calls")).toMatchObject({ status: "added", kind: "calls", crossComponent: false, crossProcess: false, evidence: [{ side: "head", file: "src/app.ts", line: 5, extractor: "calls (ts-morph symbols)" }] });
    expect(decl(c, "src/app.ts#g")!.status).toBe("unchanged"); // listed: an edge points at it
  });

  it("a removed call: a removed calls edge with base evidence", () => {
    const c = changes({ "src/app.ts": `${BASE}export function h() {\n  return g();\n}\n` }, { "src/app.ts": `${BASE}export function h() {\n  return 0;\n}\n` });
    expect(edge(c, "src/app.ts#h->src/app.ts#g:calls")).toMatchObject({ status: "removed", evidence: [{ side: "base", line: 5 }] });
  });

  it("a dynamic call is counted and labelled per file, never an edge", () => {
    const c = changes(
      { "src/app.ts": "export function g() {\n  return 1;\n}\n" },
      { "src/app.ts": "export function g() {\n  return 1;\n}\nexport function run(fns: Array<() => number>, key: string, table: Record<string, () => number>) {\n  return fns[0]!() + table[key]!() + g();\n}\n" },
    );
    const file = c.files.find((f) => f.path === "src/app.ts")!;
    expect(file.calls.head).toEqual({ resolved: 1, external: 0, dynamic: 2 });
    expect(c.edges.filter((e) => e.from === "src/app.ts#run")).toEqual([expect.objectContaining({ to: "src/app.ts#g", status: "added" })]);
  });

  it("a route registered with an inline handler is a route edge to a route-handler declaration", () => {
    const c = changes(
      { "src/app.ts": 'import express from "express";\nconst app = express();\napp.listen(3000);\n' },
      { "src/app.ts": 'import express from "express";\nconst app = express();\napp.post("/orders", (req, res) => {\n  res.json({ ok: true });\n});\napp.listen(3000);\n' },
    );
    expect(decl(c, "src/app.ts#route:POST /orders")).toMatchObject({ status: "added", kind: "route-handler" });
    expect(edge(c, "route:POST /orders->src/app.ts#route:POST /orders:route")).toMatchObject({ status: "added", evidence: [{ side: "head", line: 3, extractor: "http-routes" }] });
  });
});

describe("change sets: warnings", () => {
  const API = 'import { Queue } from "bullmq";\nconst emails = new Queue("emails");\nexport async function signup() {\n  await emails.add("welcome", {});\n}\nawait signup();\n';
  const WORKER = 'import { Worker } from "bullmq";\nasync function send(job: { data: unknown }) {\n  console.log(job.data);\n}\nnew Worker("emails", send);\n';

  it("a queue orphaned by deleting its consumer: warning with evidence on the remaining producer", () => {
    const c = changes({ "src/app.ts": API, "src/worker.ts": WORKER }, { "src/worker.ts": null });
    const w = c.warnings.find((x) => x.kind === "queue-orphaned-by-diff")!;
    expect(w).toMatchObject({ id: "queue-orphaned-by-diff:queue:bullmq:emails", rule: expect.stringContaining("had both a producer and a consumer at base") });
    expect(w.evidence).toEqual([
      { side: "head", file: "src/app.ts", line: 4, detail: "remaining producer (bullmq-queues)" },
      { side: "base", file: "src/worker.ts", line: 5, detail: "consumer at base, gone at head (bullmq-queues)" },
    ]);
    expect(edge(c, "queue:bullmq:emails->src/worker.ts#<module>:consumes")).toMatchObject({ status: "removed", crossProcess: true });
  });

  it("a cross-component signature change lists the callers in other components", () => {
    const config = JSON.stringify({ components: { pricing: ["src/lib.ts"], checkout: ["src/app.ts"] } });
    const app = 'import { price } from "./lib.ts";\nexport function checkout() {\n  return price(1);\n}\ncheckout();\n';
    const c = changes({ "tracehound.json": config, "src/lib.ts": "export function price(x: number) {\n  return x;\n}\n", "src/app.ts": app }, { "src/lib.ts": "export function price(x: number, tax: number) {\n  return x + tax;\n}\n" });
    const w = c.warnings.find((x) => x.kind === "cross-component-signature-change")!;
    expect(w).toMatchObject({ declarationId: "src/lib.ts#price", evidence: [{ side: "head", file: "src/app.ts", line: 3, detail: "src/app.ts#checkout calls price (component checkout)" }] });
    expect(edge(c, "src/app.ts#checkout->src/lib.ts#price:calls")).toMatchObject({ status: "unchanged", crossComponent: true });
  });

  it("a removed declaration still referenced at head is kept and labelled 'also caught by typecheck'", () => {
    const app = 'import { helper } from "./lib.ts";\nexport function main() {\n  return helper();\n}\nmain();\n';
    const c = changes({ "src/lib.ts": "export function helper() {\n  return 1;\n}\nexport const other = 1;\n", "src/app.ts": app }, { "src/lib.ts": "export const other = 1;\n" });
    const w = c.warnings.find((x) => x.kind === "removed-declaration-still-referenced")!;
    expect(w).toMatchObject({ declarationId: "src/lib.ts#helper", alsoCaughtByTypecheck: true, message: expect.stringContaining("also caught by typecheck") });
    expect(w.evidence[0]).toMatchObject({ side: "head", file: "src/app.ts", line: 1, detail: expect.stringMatching(/^imports helper from \.\/lib\.ts \(tsc reports an error here\)$/) });
    expect(decl(c, "src/lib.ts#helper")!.status).toBe("removed");
  });
});

describe("tracehound changes --run", () => {
  it("applies a run record's patch to its base in a temp worktree (toy-discount + its fix.patch)", async () => {
    const { buildToyRepo, TOY_BASE_SHA } = await import("../../../eval/fixtures/build-toy-repo.ts");
    const { readFileSync } = await import("node:fs");
    const { runChanges } = await import("../src/changes/cli.ts");
    expect(buildToyRepo()).toBe(TOY_BASE_SHA);
    const dir = mkdtempSync(path.join(tmpdir(), "tracehound-run-record-"));
    repos.push(dir);
    const record = path.join(dir, "run.json");
    const patch = readFileSync(path.resolve(import.meta.dirname, "../../../eval/tasks/toy-discount/fix.patch"), "utf8");
    writeFileSync(record, JSON.stringify({ runId: "r1", taskId: "toy-discount", baseSha: TOY_BASE_SHA, diff: patch }));
    const { changeSet: c } = runChanges(["--run", record]);
    expect(c.head).toMatchObject({ run: { runId: "r1", taskId: "toy-discount", patchSha256: expect.stringMatching(/^[0-9a-f]{64}$/) } });
    expect(c.declarations.filter((d) => d.status !== "unchanged").map((d) => [d.id, d.status, d.modifications])).toEqual([["src/cart.ts#applyDiscount", "modified", ["body"]]]);
    expect(c.files).toEqual([expect.objectContaining({ path: "src/cart.ts", status: "modified", linesAdded: 1, linesRemoved: 1 })]);
  }, 120_000);
});

describe("change sets: package types (decision 039)", () => {
  it("the source checkout's node_modules is linked into both worktrees, so calls typed by a package resolve as external instead of dynamic", () => {
    const app = (n: number) => `import { items } from "pkg";\nexport function run() {\n  items.forEach((i) => i.go(${n}));\n}\n`;
    const files = { ".gitignore": "node_modules\n", "src/app.ts": app(1) };
    const withTypes = { "node_modules/pkg/package.json": JSON.stringify({ name: "pkg", types: "index.d.ts" }), "node_modules/pkg/index.d.ts": "export interface Item { go(n: number): void }\nexport declare const items: Item[];\n" };
    const linked = changes({ ...files, ...withTypes }, { "src/app.ts": app(2) });
    expect(linked.nodeModules).toEqual(["node_modules"]);
    expect(linked.files.find((f) => f.path === "src/app.ts")!.calls.head).toEqual({ resolved: 0, external: 2, dynamic: 0 });
    expect(linked.files.map((f) => f.path)).toEqual(["src/app.ts"]); // the links never enter the diff
    const bare = changes(files, { "src/app.ts": app(2) });
    expect(bare.nodeModules).toEqual([]);
    expect(bare.files.find((f) => f.path === "src/app.ts")!.calls.head).toEqual({ resolved: 0, external: 1, dynamic: 1 }); // i.go: i is untyped without the package's types
  });
});

describe("change sets: types (decision 039)", () => {
  it("interfaces, type aliases and enums are declarations of kind type; a definition change is 'shape'; the module isn't modified by it", () => {
    const c = changes(
      { "src/app.ts": "export interface Order {\n  id: string;\n}\ntype Price = number;\nexport enum Side {\n  Buy,\n  Sell,\n}\nexport const x = 1;\n" },
      { "src/app.ts": "export interface Order {\n  id: string;\n  qty: number;\n}\ntype Price = number | string;\nexport enum Side {\n  Buy,\n  Sell,\n}\nexport const x = 1;\n" },
    );
    expect(decl(c, "src/app.ts#Order")).toMatchObject({ kind: "type", exported: true, status: "modified", modifications: ["shape"] });
    expect(decl(c, "src/app.ts#Price")).toMatchObject({ kind: "type", exported: false, status: "modified", modifications: ["shape"] });
    expect(decl(c, "src/app.ts#Side")).toBeUndefined(); // unchanged
    expect(decl(c, "src/app.ts#<module>")).toBeUndefined();
  });

  it("queue-payload-type-changed: a changed type in a BullMQ producer's payload and the consumer's handler, with evidence on both sides and the type", () => {
    const types = (extra: string) => `export interface EmailJob {\n  to: string;${extra}\n}\n`;
    const api = 'import { Queue } from "bullmq";\nimport type { EmailJob } from "./types.ts";\nconst emails = new Queue("emails");\nexport async function signup(to: string) {\n  const job: EmailJob = { to };\n  await emails.add("welcome", job);\n}\n';
    const worker = 'import { Worker } from "bullmq";\nimport type { EmailJob } from "./types.ts";\nasync function send(job: { data: EmailJob }) {\n  console.log(job.data.to);\n}\nnew Worker("emails", send);\n';
    const c = changes({ "src/types.ts": types(""), "src/app.ts": api, "src/worker.ts": worker }, { "src/types.ts": types("\n  subject: string;") });
    const w = c.warnings.find((x) => x.kind === "queue-payload-type-changed")!;
    expect(w).toMatchObject({ id: "queue-payload-type-changed:queue:bullmq:emails", declarationId: "src/types.ts#EmailJob" });
    expect(w.evidence).toEqual([
      { side: "head", file: "src/app.ts", line: 6, detail: "producer uses src/types.ts#EmailJob" },
      { side: "head", file: "src/worker.ts", line: 6, detail: "consumer uses src/types.ts#EmailJob" },
      { side: "head", file: "src/types.ts", line: 1, detail: "type src/types.ts#EmailJob modified [shape]" },
    ]);
  });

  it("no payload warning when the changed type isn't used by any queue side", () => {
    const c = changes(
      { "src/app.ts": 'import { Queue } from "bullmq";\nexport interface Other {\n  a: string;\n}\nconst q = new Queue("emails");\nawait q.add("x", { to: "a" });\n' },
      { "src/app.ts": 'import { Queue } from "bullmq";\nexport interface Other {\n  a: number;\n}\nconst q = new Queue("emails");\nawait q.add("x", { to: "a" });\n' },
    );
    expect(decl(c, "src/app.ts#Other")!.modifications).toEqual(["shape"]);
    expect(c.warnings.filter((w) => w.kind === "queue-payload-type-changed")).toEqual([]);
  });

  it("deleting the consumer is queue-orphaned only: the job type it took with it isn't a payload change", () => {
    const api = 'import { Queue } from "bullmq";\nconst q = new Queue("emails");\nexport async function signup(to: string) {\n  await q.add("welcome", { to });\n}\n';
    const worker = 'import { Worker } from "bullmq";\ninterface EmailJob {\n  to: string;\n}\nasync function send(job: { data: EmailJob }) {\n  console.log(job.data.to);\n}\nnew Worker("emails", send);\n';
    const c = changes({ "src/app.ts": api, "src/worker.ts": worker }, { "src/worker.ts": null });
    expect(decl(c, "src/worker.ts#EmailJob")!.status).toBe("removed");
    expect(c.warnings.map((w) => w.kind)).toContain("queue-orphaned-by-diff");
    expect(c.warnings.filter((w) => w.kind === "queue-payload-type-changed")).toEqual([]);
  });

  it("a removed type on a side that still exists is a payload warning, worded 'removed'", () => {
    const api = 'import { Queue } from "bullmq";\nconst q = new Queue("emails");\nexport async function signup(to: string) {\n  await q.add("welcome", { to });\n}\n';
    const worker = (typed: boolean) => `import { Worker } from "bullmq";\n${typed ? "interface EmailJob {\n  to: string;\n}\nasync function send(job: { data: EmailJob }) {" : "async function send(job: { data: { to: string } }) {"}\n  console.log(job.data.to);\n}\nnew Worker("emails", send);\n`;
    const c = changes({ "src/app.ts": api, "src/worker.ts": worker(true) }, { "src/worker.ts": worker(false) });
    const w = c.warnings.find((x) => x.kind === "queue-payload-type-changed")!;
    expect(w.message).toMatch(/src\/worker\.ts#EmailJob removed and used by its consumer side/);
    expect(w.evidence).toContainEqual(expect.objectContaining({ side: "base", file: "src/worker.ts", detail: "consumer uses src/worker.ts#EmailJob" }));
  });
});

describe("change sets: formatting (decision 039)", () => {
  it("whitespace- or comment-only edits are 'formatting' and don't count as modified; whitespace inside a string is a real change", () => {
    const c = changes(
      {
        "src/app.ts":
          "export function a(x: number) {\n  return x + 1;\n}\n/** doc */\nexport function b(x: number) {\n  return x;\n}\nexport function c(x: number) {\n  return `${x} items`;\n}\nexport function d(x: number) {\n  return x * 2;\n}\n",
      },
      {
        "src/app.ts":
          "export function a( x: number ) {\n    return x+1; // reindented, spaced, commented\n}\n/** changed doc */\nexport function b(x: number) {\n  return x;\n}\nexport function c(x: number) {\n  return `${x}  items`;\n}\nexport function d(x: number) {\n  return x * 3;\n}\n",
      },
    );
    expect(decl(c, "src/app.ts#a")).toMatchObject({ status: "modified", modifications: ["formatting"] });
    expect(decl(c, "src/app.ts#b")).toBeUndefined(); // a JSDoc change is trivia outside the declaration's parts
    expect(decl(c, "src/app.ts#c")).toMatchObject({ status: "modified", modifications: ["body"] }); // template text is content
    expect(decl(c, "src/app.ts#d")).toMatchObject({ status: "modified", modifications: ["body"] });
    expect(c.stats.declarations).toMatchObject({ modified: 2, formatting: 1 });
    expect(c.components[0]!.declarations).toMatchObject({ modified: 2, formatting: 1 });
  });
});

describe("change sets: stable components (decision 039)", () => {
  it("files keep their base component at head; a component edge that only moved because of regrouping is 'regrouped'", () => {
    const util = (n: number) => `export function fmt(x: number) {\n  return x.toFixed(${n});\n}\n`;
    const api = 'import { Queue } from "bullmq";\nimport { fmt } from "./util.ts";\nconst q = new Queue("jobs");\nawait q.add("x", { v: fmt(1) });\n';
    const worker = 'import { Worker } from "bullmq";\nimport { fmt } from "./util.ts";\nnew Worker("jobs", async () => fmt(2));\n';
    const c = changes({ "package.json": JSON.stringify({ name: "app", private: true, scripts: { start: "bun run src/api.ts" } }), "src/api.ts": api, "src/worker.ts": worker, "src/util.ts": util(1) }, { "src/worker.ts": null, "src/util.ts": util(2) });
    const fmt = decl(c, "src/util.ts#fmt")!;
    expect(fmt.status).toBe("modified");
    // at base util.ts is shared by api and worker; at head the heuristics would move it into api's component
    expect(fmt.componentId).toMatch(/shared$/);
    expect(fmt.baseComponentId).toBeUndefined(); // same component on both sides
    const regrouped = c.components.flatMap((x) => x.componentEdges.regrouped);
    expect(regrouped.some((id) => id.endsWith(":imports") && id.includes("shared"))).toBe(true);
    const removed = c.components.flatMap((x) => x.componentEdges.removed);
    expect(removed.some((id) => id.endsWith(":consumes"))).toBe(true); // the worker's consumes edge is a real removal
    expect(removed.filter((id) => regrouped.includes(id))).toEqual([]);
  });
});
