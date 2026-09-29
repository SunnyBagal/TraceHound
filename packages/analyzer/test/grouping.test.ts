import { describe, expect, it } from "vitest";
import { groupComponents } from "../src/group/grouping.ts";
import type { FileFacts } from "../src/schema.ts";

type Partial_ = Partial<Omit<FileFacts, "imports">> & { imports?: string[] };

function file(path: string, pkg: string, extra: Partial_ = {}): FileFacts {
  const { imports = [], ...rest } = extra;
  return {
    path, package: pkg, language: "ts", loc: 10, isEntry: false,
    imports: imports.map((target) => ({ specifier: target, target, external: false, typeOnly: false, names: [], evidenceId: `imp:${path}->${target}` })),
    symbols: [], routes: [], mounts: [], listens: [], clients: [], redisOps: [], prismaOps: [], prismaModels: [], envReads: [],
    ...rest,
  };
}
const route = (path: string, router = "r") => ({ method: "GET" as const, path, router, handlers: ["h"], evidenceId: `route:${path}` });
const redisClient = (variable: string, exported = false) => ({ tech: "redis" as const, variable, exported, connection: "REDIS_URL", evidenceId: `client:${variable}` });
const op = (opName: string, role: "produce" | "consume", key: string) => ({ client: "c", connection: "REDIS_URL", op: opName, role, key: { raw: key, value: key }, evidenceId: `op:${opName}` });

// Mirrors the demo repo's shape: layered dirs (routes/controllers/utils) that cut across features.
const backend = [
  file("be/src/index.ts", "be", { isEntry: true, entryReason: "script dev", listens: [{ evidenceId: "l" }], imports: ["be/src/routes/index.ts", "be/src/utils/env.ts", "be/src/utils/engine-client.ts"] }),
  file("be/src/routes/index.ts", "be", { imports: ["be/src/routes/auth-routes.ts", "be/src/routes/order-routes.ts"], mounts: [{ parent: "app", router: "order", prefix: "/v1", evidenceId: "m" }] }),
  file("be/src/routes/auth-routes.ts", "be", { routes: [route("/signup", "auth")], imports: ["be/src/controllers/auth-controller.ts", "be/src/utils/async-handler.ts"] }),
  file("be/src/routes/order-routes.ts", "be", { routes: [route("/order", "order"), route("/depth", "order")], imports: ["be/src/controllers/order-controller.ts", "be/src/utils/auth.ts", "be/src/utils/async-handler.ts"] }),
  file("be/src/controllers/auth-controller.ts", "be", { imports: ["be/src/utils/auth.ts", "be/src/db.ts", "be/src/utils/env.ts"] }),
  file("be/src/controllers/order-controller.ts", "be", { imports: ["be/src/utils/engine-client.ts", "be/src/utils/env.ts"] }),
  file("be/src/utils/auth.ts", "be", { imports: ["be/src/utils/env.ts"] }),
  file("be/src/utils/async-handler.ts", "be"),
  file("be/src/utils/env.ts", "be"),
  file("be/src/utils/engine-client.ts", "be", {
    clients: [redisClient("publisher")], redisOps: [op("lPush", "produce", "jobs"), op("brPop", "consume", "replies")],
    symbols: [{ name: "send", kind: "function", exported: true, range: { startLine: 1, endLine: 2 } }], imports: ["be/src/store/pending.ts"],
  }),
  file("be/src/store/pending.ts", "be"),
  file("be/src/types/express.d.ts", "be"),
  file("be/src/db.ts", "be", {
    clients: [{ tech: "prisma", variable: "prisma", exported: true, connection: "DATABASE_URL", evidenceId: "pc" }],
    symbols: [{ name: "prisma", kind: "variable", exported: true, range: { startLine: 1, endLine: 1 } }],
  }),
  file("be/prisma.config.ts", "be"),
  file("be/prisma/schema.prisma", "be", { language: "prisma", prismaModels: [{ name: "User", evidenceId: "pm" }], prismaDatasource: { provider: "postgresql", evidenceId: "pd" } }),
];
const engine = [
  file("engine/src/index.ts", "engine", { isEntry: true, entryReason: "script dev", clients: [redisClient("broker")], redisOps: [op("brPop", "consume", "jobs"), op("lPush", "produce", "replies")], imports: ["engine/src/env.ts"] }),
  file("engine/src/env.ts", "engine"),
  file("engine/src/store/exchange-store.ts", "engine"),
];
const packages = [{ root: "be", name: "backend" }, { root: "engine", name: "engine" }];

const result = groupComponents([...backend, ...engine], packages);
const byName = Object.fromEntries(result.components.map((c) => [c.name, c]));
const reasonOf = (component: string, path: string) => byName[component]!.membership.find((m) => m.file === path)?.reason;

describe("groupComponents on a demo-shaped repo", () => {
  it("produces responsibility components, not one per file or per directory", () => {
    expect(result.components.map((c) => `${c.name}:${c.kind}`).sort()).toEqual([
      "Auth API:api", "Backend Server:api", "Backend Shared:library", "Engine Client:service",
      "Engine Worker:worker", "Order API:api", "Postgres:db", "Redis:queue",
    ]);
  });

  it("assigns files reachable from exactly one anchor to it", () => {
    expect(byName["Auth API"]!.files).toContain("be/src/controllers/auth-controller.ts");
    expect(byName["Order API"]!.files).toContain("be/src/controllers/order-controller.ts");
    expect(byName["Backend Server"]!.files).toEqual(["be/src/index.ts", "be/src/routes/index.ts"]);
    expect(reasonOf("Engine Client", "be/src/store/pending.ts")).toMatch(/only reachable from Engine Client/);
  });

  it("breaks ties for shared files by name affinity, else sends them to Shared", () => {
    expect(byName["Auth API"]!.files).toContain("be/src/utils/auth.ts");
    expect(reasonOf("Auth API", "be/src/utils/auth.ts")).toMatch(/used by .*file name matches Auth API/);
    expect(byName["Backend Shared"]!.files).toEqual(["be/src/types/express.d.ts", "be/src/utils/async-handler.ts", "be/src/utils/env.ts"]);
  });

  it("absorbs client-only modules and prisma files into the resource", () => {
    expect(byName["Postgres"]!.files).toEqual(["be/prisma.config.ts", "be/prisma/schema.prisma", "be/src/db.ts"]);
    expect(byName["Postgres"]!.resource).toMatchObject({ tech: "prisma", engine: "postgresql", models: ["User"] });
  });

  it("keeps one Redis node per connection with the keys seen in code", () => {
    expect(byName["Redis"]!.resource).toMatchObject({ connection: "REDIS_URL", keys: ["jobs", "replies"] });
    expect(result.redisResourceByConnection.get("REDIS_URL")).toBe(byName["Redis"]!.id);
  });

  it("never mixes packages; orphans join a package's only component", () => {
    expect(byName["Engine Worker"]!.files).toEqual(["engine/src/env.ts", "engine/src/index.ts", "engine/src/store/exchange-store.ts"]);
    expect(reasonOf("Engine Worker", "engine/src/store/exchange-store.ts")).toMatch(/only component in package/);
  });

  it("applies mount prefixes to routes and lists entry points", () => {
    expect(byName["Order API"]!.routes.map((r) => r.path)).toEqual(["/v1/order", "/v1/depth"]);
    expect(byName["Engine Worker"]!.entryPoints.map((e) => e.symbol ?? e.reason)).toEqual(["script dev", "brPop jobs"]);
    expect(byName["Engine Client"]!.entryPoints).toContainEqual(expect.objectContaining({ symbol: "send", reason: "exported function" }));
  });

  it("is deterministic regardless of input order", () => {
    const shuffled = groupComponents([...engine, ...backend].reverse(), packages);
    expect(shuffled.components).toEqual(result.components);
  });
});

describe("component bounds", () => {
  it("merges the smallest cluster into its most-coupled sibling above the max", () => {
    const files = Array.from({ length: 4 }, (_, i) =>
      file(`p/src/r${i}-routes.ts`, "p", { routes: [route(`/r${i}`)], imports: i === 0 ? ["p/src/r1-routes.ts"] : [] }),
    );
    const { components } = groupComponents(files, [{ root: "p", name: "p" }], { min: 1, max: 3 });
    expect(components).toHaveLength(3);
    const merged = components.find((c) => c.files.length === 2)!;
    expect(merged.membership.some((m) => /merged from/.test(m.reason))).toBe(true);
  });

  it("splits the largest cluster by directory below the min", () => {
    const files = [
      file("p/src/index.ts", "p", { isEntry: true, imports: ["p/src/a/x.ts", "p/src/b/y.ts"] }),
      file("p/src/a/x.ts", "p"),
      file("p/src/b/y.ts", "p"),
    ];
    const { components } = groupComponents(files, [{ root: "p", name: "p" }], { min: 3, max: 10 });
    expect(components.map((c) => c.files)).toEqual([["p/src/index.ts"], ["p/src/a/x.ts"], ["p/src/b/y.ts"]]);
    expect(components[1]!.membership[0]!.reason).toMatch(/split out of P App by directory p\/src\/a/);
  });
});
