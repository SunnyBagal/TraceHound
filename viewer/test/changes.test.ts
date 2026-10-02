import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ChangeSet, Snapshot, SnapshotManifest } from "@tracehound/analyzer/schema";
import { describe, expect, it } from "vitest";
import {
  buildChangeModel,
  changeSummary,
  ChangeSetIndex,
  componentFiles,
  declStatus,
  evidenceLink,
  orderComponents,
  orderWarnings,
  parseComponentEdgeId,
  patchLine,
  reasons,
  rollupBadges,
  type ChangeSetEntry,
  type ChangeWarning,
  type DeclarationChange,
} from "@/lib/changes";
import { repoList } from "@/lib/repos";

const ROOT = path.resolve(import.meta.dirname, "../..");
const CHANGESETS = path.join(ROOT, "changesets");
const index = ChangeSetIndex.parse(JSON.parse(readFileSync(path.join(CHANGESETS, "index.json"), "utf8")));
const manifest = SnapshotManifest.parse(JSON.parse(readFileSync(path.join(ROOT, "snapshots/index.json"), "utf8")));

function load(id: string) {
  const entry = index.find((e) => e.id === id)!;
  const set = ChangeSet.parse(JSON.parse(readFileSync(path.join(CHANGESETS, entry.file), "utf8")));
  const repo = repoList(manifest).find((r) => r.id === entry.repo);
  const snapshot = repo ? Snapshot.parse(JSON.parse(readFileSync(path.join(ROOT, "snapshots", repo.latest.path), "utf8"))) : undefined;
  const patch = entry.runRecord ? (JSON.parse(readFileSync(path.join(CHANGESETS, entry.runRecord), "utf8")) as { diff: string }).diff : undefined;
  return { entry, set, snapshot, model: buildChangeModel(entry, set, snapshot, { patch, slug: repo?.repoUrl?.replace(/^https:\/\/github\.com\/|\.git$/g, "") }) };
}

describe("changesets/index.json (step 1c)", () => {
  it("lists the five change sets the viewer serves", () => {
    expect(index.map((e) => e.id).sort()).toEqual(["cex-seed-queue-consumer", "recall-5d2165a", "recall-7943212", "recall-worker-deleted", "toy-discount-run"]);
  });

  it.each(index.map((e) => [e.id, e] as [string, ChangeSetEntry]))("%s: its file exists and parses as ChangeSet schemaVersion 2", (_, entry) => {
    const file = path.join(CHANGESETS, entry.file);
    expect(existsSync(file)).toBe(true);
    const set = ChangeSet.parse(JSON.parse(readFileSync(file, "utf8")));
    expect(set.schemaVersion).toBe(2);
    expect(set.base.sha).toBe(entry.base);
    if (entry.kind === "run") expect("run" in set.head && set.head.run.runId).toBe(entry.head);
    else expect("sha" in set.head && set.head.sha).toBe(entry.head);
    for (const rel of [entry.patch, entry.runRecord].filter(Boolean)) expect(existsSync(path.join(CHANGESETS, rel!))).toBe(true);
    expect(entry.regenerate).toMatch(/tracehound changes/);
  });

  it("every entry's repo is a published repo, except a run on a fixture repo", () => {
    const repos = new Set(repoList(manifest).map((r) => r.id));
    expect(index.filter((e) => !repos.has(e.repo)).map((e) => e.kind)).toEqual(["run"]);
  });
});

const decl = (over: Partial<DeclarationChange>): DeclarationChange => ({
  id: "a.ts#f",
  name: "f",
  file: "a.ts",
  kind: "function",
  exported: true,
  status: "modified",
  modifications: ["body"],
  lines: { added: 1, removed: 1 },
  ...over,
});

describe("status mapping", () => {
  it("formatting-only is its own status, never 'modified'", () => {
    expect(declStatus(decl({ modifications: ["formatting"] }))).toBe("formatting");
    expect(declStatus(decl({ modifications: ["formatting", "body"] }))).toBe("modified");
    expect(declStatus(decl({ status: "added", modifications: [] }))).toBe("added");
    expect(declStatus(decl({ status: "unchanged", modifications: [] }))).toBe("unchanged");
  });

  it("modification reasons read as words", () => {
    expect(reasons(decl({ modifications: ["returnType", "shape", "signature"] }))).toEqual(["return type changed", "shape changed", "signature changed"]);
  });

  it("Recall 7943212: five route handlers are formatting only, the search handler is modified", () => {
    const { model } = load("recall-7943212");
    const groups = componentFiles(model.set, "recall-backend:brainly-server");
    const index = groups.find((g) => g.file === "recall-backend/index.ts")!;
    expect(index.formatting.map((d) => d.name).sort()).toEqual(["route:GET /api/v1/content", "route:POST /api/v1/chat", "route:POST /api/v1/content", "route:POST /api/v1/signin", "route:POST /api/v1/signup"]);
    expect(index.changed.map((d) => d.name)).toEqual(["<module>", "route:GET /api/v1/search"]);
    expect(index.changed.every((d) => declStatus(d) === "modified")).toBe(true);
  });
});

describe("collapsed unchanged declarations", () => {
  it("unchanged declarations are grouped apart from changed ones", () => {
    const { model } = load("recall-worker-deleted");
    const shared = componentFiles(model.set, "recall-backend:shared");
    expect(shared.flatMap((g) => g.changed)).toEqual([]);
    expect(shared.flatMap((g) => g.unchanged.map((d) => d.name)).sort()).toEqual(["detectLinkType", "generateEmbedding"]);
    const worker = componentFiles(model.set, "recall-backend:worker");
    expect(worker[0]!.file).toBe("recall-backend/worker.ts");
    expect(worker[0]!.changed.map((d) => d.status)).toEqual(["removed", "removed", "removed"]);
    expect(worker.flatMap((g) => g.unchanged).length).toBe(2); // aiProcessor, textExtractor: callees of the removed worker
  });
});

describe("rollup display", () => {
  it("leaves out zero counts and labels each badge with a sign or a word", () => {
    expect(rollupBadges({ id: "x", added: 3, removed: 0, modified: 2, formatting: 5, typesChanged: 1, warnings: 0, crossProcessChanged: 0 }).map((b) => b.text)).toEqual(["+3", "~2", "1 type", "5 fmt"]);
    expect(rollupBadges({ id: "x", added: 0, removed: 0, modified: 0, formatting: 0, typesChanged: 0, warnings: 0, crossProcessChanged: 0 })).toEqual([]);
  });

  it("warnings come first on a component", () => {
    expect(rollupBadges({ id: "x", added: 0, removed: 3, modified: 0, formatting: 0, typesChanged: 1, warnings: 1, crossProcessChanged: 1 }).map((b) => b.text)).toEqual(["⚠ 1", "−3", "1 type"]);
  });

  it("worker deleted: the worker's rollup, its removed component edges, and the regrouped ones", () => {
    const { model } = load("recall-worker-deleted");
    expect(model.diffs.get("recall-backend:worker")).toMatchObject({ removed: 3, typesChanged: 1, warnings: 1, crossProcessChanged: 1 });
    expect(model.edgeStatus.get("bullmq:content-processing->recall-backend:worker:consumes")).toBe("removed");
    expect(model.edgeStatus.get("recall-backend:worker->recall-backend:queue:imports")).toBe("removed");
    expect(model.edgeStatus.get("recall-backend:worker->recall-backend:shared:imports")).toBe("regrouped");
    expect(model.edgeStatus.get("recall-backend:brainly-server->recall-backend:queue:imports")).toBeUndefined(); // unchanged
    // the API is involved through the warning only (its producer remains)
    expect(model.diffs.get("recall-backend:brainly-server")).toMatchObject({ added: 0, removed: 0, modified: 0, warnings: 1 });
    expect(model.diffs.has("recall-frontend:brainly-frontend-app")).toBe(false);
  });

  it("summary bar numbers", () => {
    expect(changeSummary(load("recall-worker-deleted").set)).toEqual({ components: 5, declarations: { added: 0, removed: 3, modified: 0, formatting: 0 }, crossProcessEdges: 1, warnings: 1 });
    expect(changeSummary(load("recall-7943212").set)).toEqual({ components: 2, declarations: { added: 3, removed: 0, modified: 5, formatting: 5 }, crossProcessEdges: 0, warnings: 0 });
  });

  it("a repo without a published snapshot gets its components from the change set alone", () => {
    const { model } = load("toy-discount-run");
    expect(model.graphSha).toBeUndefined();
    expect([...model.synthetic]).toEqual(["toy-cart:toy-cart"]);
    expect(model.display.components.map((c) => c.id)).toEqual(["toy-cart:toy-cart"]);
    expect(model.display.edges).toEqual([]);
  });

  it("parses component-edge ids whose component ids contain colons", () => {
    expect(parseComponentEdgeId("bullmq:content-processing->recall-backend:worker:consumes")).toEqual({ source: "bullmq:content-processing", target: "recall-backend:worker", kind: "consumes" });
  });
});

describe("warnings first", () => {
  const w = (kind: ChangeWarning["kind"], id: string): ChangeWarning => ({ id, kind, rule: "r", message: "m", evidence: [{ side: "head", file: "a.ts", line: 1, detail: "d" }] });

  it("orders warnings by what breaks first, then id", () => {
    const ordered = orderWarnings([w("cross-component-signature-change", "a"), w("removed-declaration-still-referenced", "b"), w("queue-orphaned-by-diff", "c"), w("queue-payload-type-changed", "d")]);
    expect(ordered.map((x) => x.kind)).toEqual(["queue-orphaned-by-diff", "queue-payload-type-changed", "removed-declaration-still-referenced", "cross-component-signature-change"]);
  });

  it("orders components: warned first, then most changed, untouched last", () => {
    const { model } = load("recall-worker-deleted");
    const order = orderComponents(model.display.components, model.diffs).map((c) => c.id);
    expect(order[0]).toBe("recall-backend:worker"); // warned and changed
    expect(order.slice(1, 3).sort()).toEqual(["bullmq:content-processing", "recall-backend:brainly-server"]); // warned only
    expect(order.slice(-2).sort()).toEqual(["recall-frontend:brainly-frontend-app", "redis:redis-url"]); // untouched
  });

  it("CEX seed: the payload warning involves the broker, the consumer and the producer's component", () => {
    const { model } = load("cex-seed-queue-consumer");
    expect(model.warnings.map((x) => x.kind)).toEqual(["queue-payload-type-changed"]);
    expect(model.warningComponents.get(model.warnings[0]!.id)!.sort()).toEqual(["engine:engine-worker", "redis-rpc-bridge", "redis:redis-url"]);
    expect(model.warnedDeclarations.has("engine/src/index.ts#EngineRequest")).toBe(true);
  });
});

describe("evidence links", () => {
  it("commit change sets link to GitHub at the side's SHA", () => {
    const { model } = load("cex-seed-queue-consumer");
    expect(evidenceLink(model.link, "head", "engine/src/index.ts", 96).href).toBe("https://github.com/SunnyBagal/cex-v2-boilercode/blob/c389d3df0cfa45579061ad5c79bd0d852901d664/engine/src/index.ts#L96");
    expect(evidenceLink(model.link, "base", "engine/src/index.ts", 12, 14).href).toBe("https://github.com/SunnyBagal/cex-v2-boilercode/blob/da0e3d640a9c02f815fcca48f8328c94558cc058/engine/src/index.ts#L12-L14");
  });

  it("a demo's local head commit has no permalink; its base does", () => {
    const { model } = load("recall-worker-deleted");
    const head = evidenceLink(model.link, "head", "recall-backend/index.ts", 153);
    expect(head.href).toBeUndefined();
    expect(head.note).toMatch(/local demo commit/);
    expect(evidenceLink(model.link, "base", "recall-backend/worker.ts", 111).href).toBe("https://github.com/SunnyBagal/Recall/blob/5d2165aa9654f17a148f6663bc478a3fd9f7fc6b/recall-backend/worker.ts#L111");
  });

  it("a run shows patch line numbers instead", () => {
    const { model } = load("toy-discount-run");
    // head line 11 of src/cart.ts is `export function applyDiscount…`, the 8th line of the patch
    expect(evidenceLink(model.link, "head", "src/cart.ts", 11)).toEqual({ text: "patch line 8", note: "src/cart.ts:11 in the patched tree" });
    expect(evidenceLink(model.link, "head", "src/cart.ts", 1).href).toBeUndefined();
  });

  it("patchLine maps base '-' lines and head '+' lines", () => {
    const diff = ["diff --git a/x.ts b/x.ts", "--- a/x.ts", "+++ b/x.ts", "@@ -2,3 +2,3 @@", " a", "-b", "+B", " c"].join("\n");
    expect(patchLine(diff, "base", "x.ts", 3)).toBe(6);
    expect(patchLine(diff, "head", "x.ts", 3)).toBe(7);
    expect(patchLine(diff, "head", "x.ts", 4)).toBe(8);
    expect(patchLine(diff, "head", "x.ts", 9)).toBeNull();
    expect(patchLine(diff, "head", "y.ts", 3)).toBeNull();
  });
});
