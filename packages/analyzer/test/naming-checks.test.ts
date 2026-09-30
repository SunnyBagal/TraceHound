import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkReply, identifierTokens, normalizeText } from "../src/naming/checks.ts";
import { componentFacts } from "../src/naming/facts.ts";
import { Snapshot } from "../src/schema.ts";

// Facts come from the committed demo snapshot; replies are verbatim Nemotron Nano outputs
// (nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B, 2026-09-30) unless marked "derived".
const snap = Snapshot.parse(
  JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../../snapshots/da0e3d640a9c02f815fcca48f8328c94558cc058/0.3.0.json"), "utf8")),
);
const facts = (id: string) => componentFacts(snap, snap.components.find((c) => c.id === id)!);
const symbols = (id: string) => {
  const files = new Set(snap.components.find((c) => c.id === id)!.files);
  return snap.files.filter((f) => files.has(f.path)).flatMap((f) => f.symbols.map((s) => s.name));
};

const REAL = {
  // run 1, analyzer 0.2.0: queue key written with U+2011 NON-BREAKING HYPHEN
  engineWorker: { name: "Engine Worker", summary: "Consumes messages from the backend‑to‑engine‑broker queue for Redis consumers." },
  // run 1: named after the component's single route
  backendServer: { name: "Health Check Service", summary: "Provides a health check endpoint for monitoring the backend system." },
  // run 2, analyzer 0.3.0: U+2011 again, in prose
  backendServer2: { name: "Backend Server", summary: "Provides HTTP endpoints and Redis‑based background processing for Auth and Exchange APIs." },
};

describe("normalizeText", () => {
  it("maps every dash variant, smart quote, ellipsis and odd space to ASCII", () => {
    expect(normalizeText(REAL.engineWorker.summary)).toBe("Consumes messages from the backend-to-engine-broker queue for Redis consumers.");
    expect(normalizeText("a‐b‒c–d—e―f−g－h")).toBe("a-b-c-d-e-f-g-h");
    expect(normalizeText("“quoted” ‘x’ and… → next​")).toBe("\"quoted\" 'x' and... -> next");
    expect(normalizeText("café • naïve ★")).toBe("café - naïve");
  });
});

describe("checkReply: identifiers must match extracted facts", () => {
  it("rejects the raw U+2011 key (not a fact) but accepts it once normalized", () => {
    // raw token check: the non-ASCII key is identifier-like and matches nothing
    expect(identifierTokens(REAL.engineWorker.summary)).toEqual(["backend‑to‑engine‑broker"]);
    const result = checkReply(REAL.engineWorker, facts("engine:engine-worker"), symbols("engine:engine-worker"));
    expect(result).toEqual({ ok: true, name: "Engine Worker", summary: "Consumes messages from the backend-to-engine-broker queue for Redis consumers." });
  });

  it("stores the run-2 U+2011 prose as ASCII", () => {
    const result = checkReply(REAL.backendServer2, facts("backend:backend-server"), symbols("backend:backend-server"));
    expect(result).toMatchObject({ ok: true, summary: "Provides HTTP endpoints and Redis-based background processing for Auth and Exchange APIs." });
  });

  it("rejects a queue key that isn't in the facts (derived from the real Engine Worker reply)", () => {
    const derived = { ...REAL.engineWorker, summary: REAL.engineWorker.summary.replace("backend‑to‑engine‑broker", "backend-to-engine-queue") };
    expect(checkReply(derived, facts("engine:engine-worker"))).toEqual({ ok: false, reason: "identifier(s) not in extracted facts: backend-to-engine-queue" });
  });

  it("rejects the real Super reply's BRPOP/LPUSH: the facts spell the ops brPop/lPush", () => {
    // verbatim nvidia/nemotron-3-super-120b-a12b reply for the Redis component (2026-09-30, cached)
    const superRedis = {
      name: "Task Queue",
      summary: "Manages asynchronous task distribution between Engine Workers and Redis RPC Bridge using BRPOP/LPUSH operations.",
    };
    const f = facts("redis:redis-url");
    expect(JSON.stringify(f)).toMatch(/brPop/); // the fact really is spelled brPop
    expect(checkReply(superRedis, f)).toEqual({ ok: false, reason: "identifier(s) not in extracted facts: BRPOP, LPUSH" });
    expect(checkReply({ ...superRedis, summary: superRedis.summary.replace("BRPOP/LPUSH", "brPop/lPush") }, f)).toMatchObject({ ok: true });
  });

  it("splits joined tokens on / , | + and checks every identifier-like piece, case-sensitively", () => {
    const f = facts("redis:redis-url");
    expect(identifierTokens("uses brPop,LPUSH and a|b+SET_X")).toEqual(["brPop", "LPUSH", "SET_X"]);
    expect(checkReply({ name: "Redis Queue", summary: "Uses brpop|lPush." }, f)).toEqual({ ok: false, reason: "identifier(s) not in extracted facts: brpop" });
    expect(checkReply({ name: "Redis Queue", summary: "Reads and writes via read/write calls." }, f)).toMatchObject({ ok: true }); // plain words stay prose
    // a whole fact is never split: /depth/:symbol is a route in the facts
    expect(checkReply({ name: "Exchange API", summary: "Serves /depth/:symbol." }, facts("backend:exchange-api"))).toMatchObject({ ok: true });
  });

  it("rejects invented file paths, routes and symbols; accepts real ones", () => {
    const f = facts("backend:exchange-api");
    expect(checkReply({ name: "Exchange API", summary: "Serves /orders via exchange-service.ts." }, f)).toMatchObject({ ok: false, reason: expect.stringContaining("/orders, exchange-service.ts") });
    expect(checkReply({ name: "Exchange API", summary: "Serves /order and /depth/:symbol via exchange-controller.ts." }, f)).toMatchObject({ ok: true });
    expect(checkReply({ name: "RPC Bridge", summary: "Wraps sendToEngine and awaitReply." }, facts("redis-rpc-bridge"), symbols("redis-rpc-bridge"))).toEqual({
      ok: false,
      reason: "identifier(s) not in extracted facts: awaitReply",
    });
  });
});

describe("checkReply: names must describe the whole component", () => {
  it('rejects "Health Check Service" for a 2-file entry point that mounts 2 routers', () => {
    expect(checkReply(REAL.backendServer, facts("backend:backend-server"))).toEqual({
      ok: false,
      reason: 'name "Health Check Service" describes only GET /health ("health"), but the component has 2 files, mounts 2 routers',
    });
  });

  it("accepts names built from words shared by several routes/files or by the heuristic name", () => {
    expect(checkReply({ name: "Auth Service", summary: "Handles signup and signin." }, facts("backend:auth-api"))).toMatchObject({ ok: true });
    expect(checkReply({ name: "Order Gateway", summary: "Order endpoints." }, facts("backend:exchange-api"))).toMatchObject({ ok: true }); // /order in 3 routes
  });

  it("rejects a name taken from one of several routes (derived: Exchange API named after /balance)", () => {
    expect(checkReply({ name: "Balance Service", summary: "Returns balances." }, facts("backend:exchange-api"))).toMatchObject({
      ok: false,
      reason: expect.stringContaining("describes only GET /balance"),
    });
  });
});
