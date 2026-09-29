import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeRepo } from "../src/analyze.ts";

const DEMO = path.resolve(import.meta.dirname, "../../../fixtures/demo-repo");

// Run `pnpm fixture` first; skipped when the pinned demo repo isn't checked out.
describe.skipIf(!existsSync(DEMO))("demo repo (cex-v2-boilercode @ da0e3d6)", () => {
  const snap = analyzeRepo(DEMO, { now: () => new Date(0) });
  const id = (name: string) => snap.components.find((c) => c.name === name)!.id;
  const edge = (from: string, to: string, kind: string) => snap.edges.find((e) => e.source === id(from) && e.target === id(to) && e.kind === kind);

  it("is keyed by the pinned commit", () => {
    expect(snap.repo).toMatchObject({ name: "rahul-MyGit/cex-v2-boilercode", commitSha: "da0e3d640a9c02f815fcca48f8328c94558cc058" });
  });

  it("groups 22 files into 8 responsibility components", () => {
    expect(snap.files).toHaveLength(22);
    expect(snap.components.map((c) => c.name).sort()).toEqual([
      "Auth API", "Backend Server", "Backend Shared", "Engine Client", "Engine Worker", "Exchange API", "Postgres", "Redis",
    ]);
  });

  it("recovers the backend ⇄ engine round trip through Redis, which has no import edge", () => {
    expect(edge("Exchange API", "Engine Client", "imports")).toBeDefined();
    expect(edge("Engine Client", "Redis", "produces")?.label).toBe("lPush backend-to-engine-broker");
    expect(edge("Redis", "Engine Worker", "consumes")?.label).toBe("brPop backend-to-engine-broker");
    expect(edge("Engine Worker", "Redis", "produces")?.confidence).toBe(0.5); // lPush(message.responseQueue): dynamic key
    expect(edge("Redis", "Engine Client", "consumes")?.label).toBe("brPop response-queue-*");
    expect(edge("Auth API", "Postgres", "queries")?.label).toBe("User.create");
  });

  it("labels every edge proven / resolved-default / dynamic", () => {
    expect(edge("Exchange API", "Engine Client", "imports")?.confidenceLabel).toBe("proven");
    expect(edge("Auth API", "Postgres", "queries")?.confidenceLabel).toBe("proven");
    expect(edge("Engine Client", "Redis", "produces")?.confidenceLabel).toBe("resolved-default");
    expect(edge("Redis", "Engine Worker", "consumes")?.confidenceLabel).toBe("resolved-default");
    expect(edge("Engine Worker", "Redis", "produces")?.confidenceLabel).toBe("dynamic");
    expect(edge("Redis", "Engine Client", "consumes")?.confidenceLabel).toBe("dynamic");
    expect(snap.edges.every((e) => ["proven", "resolved-default", "dynamic"].includes(e.confidenceLabel))).toBe(true);
  });

  it("finds all 8 HTTP routes", () => {
    expect(snap.components.flatMap((c) => c.routes.map((r) => `${r.method} ${r.path}`)).sort()).toEqual([
      "DELETE /order/:orderId", "GET /balance", "GET /depth/:symbol", "GET /health", "GET /order/:orderId", "POST /order", "POST /signin", "POST /signup",
    ]);
  });

  it("backs every edge with evidence that points at real lines in the repo", () => {
    const evidence = new Map(snap.evidence.map((e) => [e.id, e]));
    for (const e of snap.edges) {
      expect(e.evidenceIds.length).toBeGreaterThan(0);
      for (const evId of e.evidenceIds) {
        const ev = evidence.get(evId)!;
        const lines = readFileSync(path.join(DEMO, ev.file), "utf8").split("\n");
        expect(ev.range.endLine).toBeLessThanOrEqual(lines.length);
        expect(ev.snippet.lines).toEqual(lines.slice(ev.snippet.startLine - 1, ev.snippet.startLine - 1 + ev.snippet.lines.length));
      }
    }
  });

  it("warns about the one orphan file: the engine's unused exchange store", () => {
    expect(snap.warnings.map((w) => [w.kind, w.file, w.componentId])).toEqual([
      ["orphan-file", "engine/src/store/exchange-store.ts", "engine:engine-worker"],
    ]);
  });

  describe("with configs/cex-v2-boilercode.tracehound.json", () => {
    const configPath = path.resolve(import.meta.dirname, "../../../configs/cex-v2-boilercode.tracehound.json");
    const run = () => analyzeRepo(DEMO, { now: () => new Date(0), configPath });
    const first = run();
    const ids = (s: typeof snap) => s.components.map((c) => c.id).sort();

    it("splits Engine Client into the Redis RPC Bridge and the Pending-Response Registry", () => {
      const byId = Object.fromEntries(first.components.map((c) => [c.id, c]));
      expect(byId["redis-rpc-bridge"]).toMatchObject({ name: "Redis RPC Bridge", files: ["backend/src/types/engine.ts", "backend/src/utils/engine-client.ts"] });
      expect(byId["pending-response-registry"]).toMatchObject({ name: "Pending-Response Registry", files: ["backend/src/store/pending-responses.ts"] });
      expect(first.components.some((c) => c.name === "Engine Client")).toBe(false);
      expect(first.edges.find((e) => e.source === "redis-rpc-bridge" && e.target === "pending-response-registry")?.label).toBe("resolveEngineResponse, waitForEngineResponse");
      expect(first.warnings.filter((w) => w.kind === "override-unmatched")).toEqual([]);
    });

    it("keeps component ids identical across re-runs", () => {
      const again = run();
      expect(ids(again)).toEqual(ids(first));
      expect(again.edges.map((e) => e.id)).toEqual(first.edges.map((e) => e.id));
    });

    it("leaves ids of components the override doesn't touch unchanged", () => {
      const untouched = ids(snap).filter((id) => id !== "backend:engine-client");
      expect(ids(first)).toEqual([...untouched, "pending-response-registry", "redis-rpc-bridge"].sort());
    });
  });

  it("never draws edges for unresolved imports", () => {
    const db = snap.files.find((f) => f.path === "backend/src/db.ts")!;
    const generated = db.imports.find((i) => i.specifier === "./generated/prisma/client")!;
    expect(generated.target).toBeUndefined();
    expect(snap.edges.some((e) => e.evidenceIds.includes(generated.evidenceId))).toBe(false);
  });
});
