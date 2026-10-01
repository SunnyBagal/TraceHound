import { execFileSync } from "node:child_process";
import { cleanGitEnv } from "../src/git-env.ts";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { isTestFile } from "../src/aggregate/tests.ts";
import { analyzeRepo } from "../src/analyze.ts";
import { formatImpact } from "../src/impact/format.ts";
import { ImpactError, regenerateHint, runImpact } from "../src/impact/cli.ts";
import { computeImpact, parseNameStatus, type ImpactReport } from "../src/impact/impact.ts";
import { upsertManifest, writeManifest } from "../src/manifest.ts";
import { ImpactReport as ImpactReportSchema, impactReferenceErrors, type Snapshot } from "../src/schema.ts";

import { BASE_FILES } from "./fixture-repo.ts";

let repo: string;
let snapshotsDir: string;
let snapshot: Snapshot;
let base: string;

const git = (...args: string[]) =>
  execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", env: cleanGitEnv() }).trim();
const write = (file: string, text: string) => {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  writeFileSync(path.join(repo, file), text);
};

/** Branch off base, apply `edit`, commit, and return the impact report (JSON mode) for base..branch. */
function impactOf(branch: string, edit: () => void, depth = 2): ImpactReport {
  git("checkout", "-q", "-B", branch, base);
  edit();
  git("add", "-A");
  git("commit", "-qm", branch);
  const { text } = runImpact(["--repo", repo, "--diff", `${base}..${branch}`, "--depth", String(depth), "--json", "--snapshots", snapshotsDir]);
  return JSON.parse(text) as ImpactReport;
}
const ids = (r: ImpactReport) => r.affected.map((a) => a.id);
const find = (r: ImpactReport, id: string) => r.affected.find((a) => a.id === id)!;

beforeAll(() => {
  repo = mkdtempSync(path.join(tmpdir(), "tracehound-impact-"));
  snapshotsDir = mkdtempSync(path.join(tmpdir(), "tracehound-impact-snapshots-")); // outside the repo: `git add -A` must not see it
  for (const [file, text] of Object.entries(BASE_FILES)) write(file, text);
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-qm", "base");
  base = git("rev-parse", "HEAD");
  snapshot = analyzeRepo(repo, { now: () => new Date(0) });
  writeFileSync(path.join(snapshotsDir, "snap.json"), JSON.stringify(snapshot));
  writeManifest(snapshotsDir, upsertManifest(undefined, { repo: snapshot.repo.name, sha: base, analyzerVersion: snapshot.analyzerVersion, path: "snap.json", createdAt: snapshot.generatedAt }));
  return () => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(snapshotsDir, { recursive: true, force: true });
  };
});

describe("fixture graph (sanity)", () => {
  it("has the edges the impact tests rely on", () => {
    expect(snapshot.edges.map((e) => `${e.source} -${e.kind}-> ${e.target} [${e.confidenceLabel}]`).sort()).toEqual([
      "api:api-app -imports-> notifier [proven]",
      "api:api-app -imports-> orders [proven]",
      "orders -imports-> queue-client [proven]",
      "queue-client -produces-> redis:redis-url [proven]",
      "redis:redis-url -consumes-> notifier [dynamic]",
      "redis:redis-url -consumes-> worker:worker-worker [proven]",
    ]);
  });
});

describe("TESTS links", () => {
  it("recognizes *.test.ts, *.spec.ts and __tests__/** files", () => {
    expect(["a/x.test.ts", "a/x.spec.ts", "a/__tests__/x.ts", "x.test.tsx", "src/__tests__/deep/y.mts"].every(isTestFile)).toBe(true);
    expect(["a/x.ts", "a/testing.ts", "a/tests/x.ts", "a/x.test-utils.ts"].some(isTestFile)).toBe(false);
  });

  it("links a test file to the component whose files it imports, with the import as evidence; test files join no component", () => {
    expect(snapshot.tests).toEqual([{ file: "api/src/orders.test.ts", componentId: "orders", evidenceIds: ["api/src/orders.test.ts#L1-1:imports"] }]);
    expect(snapshot.components.flatMap((c) => c.files)).not.toContain("api/src/orders.test.ts");
    expect(snapshot.warnings).toEqual([]);
  });
});

describe("parseNameStatus", () => {
  it("maps deleted/modified files and renames' old path to base; added and copied files have no base path", () => {
    expect(parseNameStatus("M\ta.ts\nA\tb.ts\nD\tc.ts\nR087\told.ts\tnew.ts\nC100\tsrc.ts\tcopy.ts\n")).toEqual([
      { status: "modified", path: "a.ts", basePath: "a.ts" },
      { status: "added", path: "b.ts" },
      { status: "deleted", path: "c.ts", basePath: "c.ts" },
      { status: "renamed", path: "new.ts", basePath: "old.ts" },
      { status: "copied", path: "copy.ts" },
    ]);
  });
});

describe("tracehound impact on the fixture repo", () => {
  it("reverse walk: dependents of a changed dependency, with an evidence-backed chain per hop", () => {
    const r = impactOf("reverse", () => write("api/src/queue-client.ts", BASE_FILES["api/src/queue-client.ts"]!.replace("orderId", "order_id")));
    expect(r.changed.map((c) => c.id)).toEqual(["queue-client"]);
    expect(find(r, "orders")).toMatchObject({ depth: 1, dynamic: false });
    expect(find(r, "orders").chain).toEqual([
      expect.objectContaining({ kind: "imports", source: "orders", target: "queue-client", walk: "reverse", confidenceLabel: "proven", evidence: { id: "api/src/orders.ts#L1-1:imports", file: "api/src/orders.ts", line: 1 } }),
    ]);
    expect(find(r, "api:api-app").chain.map((h) => `${h.from}->${h.to}:${h.kind}:${h.walk}`)).toEqual([
      "queue-client->orders:imports:reverse",
      "orders->api:api-app:imports:reverse",
    ]);
    // the change's own dependencies are not affected by it (no forward walk over imports)
    expect(r.linkedTests).toEqual([{ file: "api/src/orders.test.ts", componentId: "orders", evidence: { id: "api/src/orders.test.ts#L1-1:imports", file: "api/src/orders.test.ts", line: 1 } }]);
  });

  it("queue bidirectionality: a consumer-side change reaches the producer through the queue", () => {
    const r = impactOf("queue", () => write("worker/src/index.ts", BASE_FILES["worker/src/index.ts"]!.replace(".orderId", ".order_id")));
    expect(r.changed.map((c) => c.id)).toEqual(["worker:worker-worker"]);
    expect(find(r, "redis:redis-url")).toMatchObject({ depth: 1 });
    expect(find(r, "queue-client").chain.map((h) => `${h.source} -${h.kind}-> ${h.target} (${h.walk})`)).toEqual([
      "redis:redis-url -consumes-> worker:worker-worker (bidirectional)",
      "queue-client -produces-> redis:redis-url (bidirectional)",
    ]);
    expect(r.linkedTests.map((t) => t.componentId)).toEqual(["orders"]); // orders: queue crossing (1) + import (1)
  });

  it("decision 024: crossing a queue costs one hop; the broker stays in the chain without consuming depth", () => {
    const edit = () => write("worker/src/index.ts", BASE_FILES["worker/src/index.ts"]!.replace(".orderId", ".order_id"));
    const one = impactOf("broker-depth-1", edit, 1);
    expect(find(one, "queue-client")).toMatchObject({ depth: 1 });
    expect(find(one, "queue-client").chain.map((h) => [h.to, h.depthCost])).toEqual([["redis:redis-url", 1], ["queue-client", 0]]);
    expect(find(one, "redis:redis-url")).toMatchObject({ depth: 1 });
    expect(ids(one)).not.toContain("orders"); // one more import hop: depth 2
    expect(find(impactOf("broker-depth-2", edit, 2), "orders")).toMatchObject({ depth: 2 });
    expect(formatImpact(one)).toContain("leaves the broker, no extra depth");
  });

  it("flags chains through a dynamic edge instead of hiding them", () => {
    const r = impactOf("dynamic", () => write("worker/src/index.ts", BASE_FILES["worker/src/index.ts"]!.replace(".orderId", ".order_id")));
    expect(find(r, "notifier")).toMatchObject({ depth: 1, dynamic: true });
    expect(find(r, "notifier").chain.at(-1)).toMatchObject({ kind: "consumes", confidenceLabel: "dynamic", evidence: { file: "api/src/notifier.ts", line: 4 } });
    expect(find(r, "queue-client").dynamic).toBe(false);
    expect(formatImpact(r)).toContain("[DYNAMIC ⚠]");
  });

  it("depth cutoff: --depth 1 stops after one hop, --depth 0 reports only the changed component", () => {
    const edit = () => write("api/src/queue-client.ts", BASE_FILES["api/src/queue-client.ts"]! + "// v2\n");
    expect(ids(impactOf("depth-2", edit, 2))).toEqual(["notifier", "orders", "redis:redis-url", "worker:worker-worker", "api:api-app"]);
    expect(ids(impactOf("depth-1", edit, 1))).toEqual(["notifier", "orders", "redis:redis-url", "worker:worker-worker"]);
    const zero = impactOf("depth-0", edit, 0);
    expect(zero.changed.map((c) => c.id)).toEqual(["queue-client"]);
    expect(zero.affected).toEqual([]);
  });

  it("lists an added file that isn't in the base snapshot as unmapped instead of dropping it", () => {
    const r = impactOf("added", () => write("api/src/metrics.ts", "export const hits = 0;\n"));
    expect(r.files).toEqual([{ status: "added", path: "api/src/metrics.ts", reason: "added file: not in base snapshot" }]);
    expect(r.unmapped.map((f) => f.path)).toEqual(["api/src/metrics.ts"]);
    expect(r.changed).toEqual([]);
    expect(formatImpact(r)).toMatch(/Unmapped files \(1\)\n {2}A {2}api\/src\/metrics\.ts {2}\(added file: not in base snapshot\)/);
  });

  it("maps a deleted file (and a renamed one) through the base snapshot", () => {
    const deleted = impactOf("deleted", () => rmSync(path.join(repo, "api/src/orders.ts")));
    expect(deleted.files).toEqual([{ status: "deleted", path: "api/src/orders.ts", basePath: "api/src/orders.ts", componentId: "orders" }]);
    expect(ids(deleted)).toEqual(["api:api-app"]);
    expect(deleted.linkedTests.map((t) => t.file)).toEqual(["api/src/orders.test.ts"]);

    const renamed = impactOf("renamed", () => git("mv", "api/src/queue-client.ts", "api/src/mq-client.ts"));
    expect(renamed.files).toEqual([
      { status: "renamed", path: "api/src/mq-client.ts", basePath: "api/src/queue-client.ts", componentId: "queue-client", reason: "mapped via base path api/src/queue-client.ts" },
    ]);
  });

  it("fails loudly, with instructions, when the base commit has no snapshot", () => {
    git("checkout", "-q", "-B", "orphan-base", base);
    write("README.md", "x\n");
    git("add", "-A");
    git("commit", "-qm", "no snapshot for me");
    const run = () => runImpact(["--repo", repo, "--diff", `orphan-base..${base}`, "--snapshots", snapshotsDir]);
    expect(run).toThrow(ImpactError);
    expect(run).toThrow(/no analyzer \S+ snapshot for base [0-9a-f]{40}[\s\S]*create one by analyzing the base commit[\s\S]*--naming heuristic/);
  });

  it("the hint for a missing base snapshot is the real regenerate command: repo, matching configs/ file, --cache-only when the older snapshot had model names", () => {
    const older = { ...snapshot, repo: { ...snapshot.repo, name: "SunnyBagal/cex-v2-boilercode" }, llmCalls: [{ purpose: "component-naming", componentId: "x", model: "m", latencyMs: 0, cached: true, estCostUSD: 0, ok: true }] } as Snapshot;
    const hint = regenerateHint({ snapshotsDir: "/snaps", sha: "a".repeat(40), repo: "/somewhere/not-a-repo", older }).join("\n");
    expect(hint).toMatch(/git -C \S+ worktree add \/tmp\/base a{40}/); // HEAD isn't the base (not even a repo)
    expect(hint).toMatch(/cli\.ts --repo \/tmp\/base --config \S*configs\/cex-v2-boilercode\.tracehound\.json --out \S+ --cache-only/);
    expect(regenerateHint({ snapshotsDir: "/snaps", sha: "a".repeat(40) }).join("\n")).toMatch(/--repo \/tmp\/base --out \S+ --naming heuristic[\s\S]*add --config/);
  });

  it("--out writes a schema-valid report whose ids all exist in the base snapshot; tampering is caught", () => {
    git("checkout", "-q", "-B", "out-file", base);
    write("api/src/queue-client.ts", BASE_FILES["api/src/queue-client.ts"]! + "// v3\n");
    git("add", "-A");
    git("commit", "-qm", "out-file");
    const out = path.join(snapshotsDir, "impacts", "seed-x.json");
    runImpact(["--repo", repo, "--diff", `${base}..out-file`, "--out", out, "--snapshots", snapshotsDir]);
    const report = ImpactReportSchema.parse(JSON.parse(readFileSync(out, "utf8")));
    expect(report.snapshot.file).toBe(`${base}/${snapshot.analyzerVersion}.json`);
    expect(impactReferenceErrors(report, snapshot)).toEqual([]);
    const tampered = { ...report, affected: [{ ...report.affected[0]!, id: "ghost" }, ...report.affected.slice(1)] };
    expect(impactReferenceErrors(tampered, snapshot)).toEqual(['affected references component "ghost", which is not in the base snapshot']);
  });

  it("text mode says 0 linked tests when no test imports a touched component", () => {
    const r = computeImpact({ snapshot: { ...snapshot, tests: [] }, changes: [{ status: "modified", path: "worker/src/index.ts", basePath: "worker/src/index.ts" }], base, head: base });
    expect(formatImpact(r)).toContain("Linked tests: 0 linked tests");
  });
});
