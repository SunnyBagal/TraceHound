// contracts-v1, keyed: changed string keys and the unedited files that still use the old key.
import { afterAll, describe, expect, it } from "vitest";
import { computeKeyed, type KeyedResult } from "../src/contracts/keyed.ts";
import { classifyLiteral, dotenvName, isDotenvFile, NOT_CODE, quotedLiterals, SHAPES, TEST_FILE, usesKey } from "../src/contracts/shapes.ts";
import { openTrees } from "../src/contracts/trees.ts";
import { CASES, TSCONFIG } from "./fixtures/contracts/cases.ts";
import { makeRepo } from "./fixtures/contracts/repo.ts";

const cleanups: (() => void)[] = [];
afterAll(() => cleanups.forEach((c) => c()));

function keyed(base: Record<string, string>, head: Record<string, string | null>): KeyedResult {
  const r = makeRepo(base, head);
  cleanups.push(r.cleanup);
  const trees = openTrees(r.repo, r.base, r.head);
  try {
    return computeKeyed(trees);
  } finally {
    trees.close();
  }
}
const stale = (r: KeyedResult) => r.keys.flatMap((k) => k.staleUses.map((u) => `${u.path}:${u.line}`)).sort();

describe("contracts keyed: fixture cases", () => {
  for (const c of CASES) {
    it(`${c.control ? "control" : "positive"}: ${c.name} → ${c.expected.contract} stale use(s)`, () => {
      const r = keyed(c.base, c.head);
      expect(stale(r)).toEqual(c.expected.contract ? [...c.expected.paths].sort() : []);
      expect(r.counts.extractorErrors).toBe(0);
    });
  }

  it("queue renamed in the producer only: before, after, both sites, via the extractor", () => {
    const c = CASES.find((x) => x.name === "queue renamed in the producer only")!;
    expect(keyed(c.base, c.head).keys).toEqual([
      {
        key: "queue:emails", kind: "queue", before: "emails", after: "outbound-emails", prefix: false, via: "extractor",
        changedAt: { path: "src/producer.ts", line: 2, side: "base", text: 'export const emails = new Queue("emails");' },
        afterAt: { path: "src/producer.ts", line: 2, side: "head", text: 'export const emails = new Queue("outbound-emails");' },
        staleUses: [{ path: "src/worker.ts", line: 2, text: 'export const worker = new Worker("emails", async (job) => {' }],
      },
    ]);
  });

  it("env var renamed in config only: the TS reader and the dotenv file agree on one key", () => {
    const c = CASES.find((x) => x.name === "env var renamed in config only")!;
    const r = keyed(c.base, c.head);
    expect(r.keys.map((k) => [k.key, k.after, k.via])).toEqual([["env:DATABASE_URL", "DB_URL", "dotenv"]]);
    expect(r.keys[0]!.staleUses).toEqual([{ path: "src/db.ts", line: 1, text: 'export const url = process.env.DATABASE_URL ?? "";' }]);
  });

  it("Go: env var and Redis key prefix from the literal diff", () => {
    const c = CASES.find((x) => x.name.startsWith("Go: env var and Redis key renamed in config only"))!;
    expect(keyed(c.base, c.head).keys.map((k) => [k.key, k.after, k.via])).toEqual([
      ["env:DATABASE_URL", "DB_URL", "literal"],
      ["redis-key:session:", "sess:", "literal"],
    ]);
  });
});

const TS = { "package.json": "{}", "tsconfig.json": TSCONFIG };
describe("contracts keyed: what isn't a stale use", () => {
  it("a route that another unedited file still registers is not removed", () => {
    const server = (route: string) => `import express from "express";\nconst app = express();\napp.get("${route}", (_req, res) => res.json([]));\n`;
    const r = keyed({ ...TS, "src/a.ts": server("/api/users"), "src/b.ts": server("/api/users"), "src/client.ts": 'fetch("/api/users");\n' }, { "src/a.ts": server("/api/members") });
    expect(stale(r)).toEqual([]);
    expect(r.keys[0]!.note).toBe("still provided at head by src/b.ts:3: uses are not stale");
  });

  it("a key moved to another edited file, or to a constant, is not removed", () => {
    const r = keyed(
      { ...TS, "src/producer.ts": 'import { Queue } from "bullmq";\nexport const q = new Queue("emails");\n', "src/worker.ts": 'import { Worker } from "bullmq";\nnew Worker("emails", async () => {});\n' },
      { "src/producer.ts": 'import { Queue } from "bullmq";\nimport { NAME } from "./names";\nexport const q = new Queue(NAME);\n', "src/names.ts": 'export const NAME = "emails";\n' },
    );
    expect(r.keys).toEqual([]);
  });

  it("an env var removed without a rename is reported but not searched", () => {
    const r = keyed({ ...TS, "src/config.ts": "export const a = process.env.FEATURE_FLAG;\n", "src/other.ts": "export const b = process.env.FEATURE_FLAG;\n" }, { "src/config.ts": "export const a = true;\n" });
    expect(r.keys.map((k) => [k.key, k.after, k.staleUses.length, k.note])).toEqual([["env:FEATURE_FLAG", undefined, 0, "env var removed without a rename: not a break by itself, not searched"]]);
  });

  it("a test that stops using a key doesn't change the key; docs mentioning it are not uses", () => {
    const r = keyed(
      { "server.py": '@app.route("/api/users")\ndef users():\n    return []\n', "tests/test_api.py": 'def test_users(client):\n    @app.route("/api/users")\n    def x(): pass\n', "README.md": 'Call "/api/users".\n' },
      { "tests/test_api.py": "def test_users(client):\n    pass\n" },
    );
    expect(r.keys).toEqual([]);
    const moved = keyed({ "server.py": '@app.route("/api/users")\ndef users():\n    return []\n', "README.md": 'GET "/api/users"\n' }, { "server.py": '@app.route("/api/members")\ndef users():\n    return []\n' });
    expect(moved.keys.map((k) => [k.key, k.staleUses.length])).toEqual([["route:/api/users", 0]]);
  });

  it("a longer literal that only contains the key is not a use", () => {
    const r = keyed({ "app.py": '@app.route("/api/users")\ndef u(): pass\n', "client.py": 'get("/api/users/export")\nget("/v2/api/users")\nget("/api/users?page=2")\n' }, { "app.py": '@app.route("/api/people")\ndef u(): pass\n' });
    expect(stale(r)).toEqual(["client.py:3"]);
  });
});

describe("contracts shapes", () => {
  const cases: [string, string, string | undefined][] = [
    // [literal, line, kind]
    ["DATABASE_URL", 'url = os.getenv("DATABASE_URL")', "env"],
    ["DATABASE_URL", 'os.environ["DATABASE_URL"]', "env"],
    ["DATABASE_URL", 'v := os.Getenv("DATABASE_URL")', "env"],
    ["PENDING_REVIEW", 'status = "PENDING_REVIEW"', undefined], // a constant, not an env read
    ["PORT", 'os.getenv("PORT")', undefined], // no underscore: too generic
    ["/api/users", '@app.route("/api/users")', "route"],
    ["/users/<int:id>", '@bp.route("/users/<int:id>")', "route"],
    ["/users/{id}", '@router.get("/users/{id}")', "route"],
    ["/users/:id", 'r.GET("/users/:id", handler)', "route"],
    ["/api/users", 'http.HandleFunc("/api/users", list)', "route"],
    ["/api/users", 'requests.get(base + "/api/users")', undefined], // a client call, not a registration
    ["/etc/hosts", 'path = "/etc/hosts"', undefined],
    ["/static/app.js", 'app.mount("/static/app.js")', undefined],
    ["session:", 'rdb.Get(ctx, "session:"+id)', "redis-key"],
    ["user:{id}:profile", 'redis.hgetall("user:{id}:profile")', "redis-key"],
    ["session:", 'prefix = "session:"', undefined],
    ["emails.welcome", '@celery_app.task(name="emails.welcome")', "queue"],
    ["emails", 'queue = Queue("emails")', "queue"],
    ["ok", 'queue.put("ok")', undefined], // too short
    ["welcome", 'print("welcome")', undefined],
    ["user.created", 'emitter.emit("user.created", user)', "event"],
    ["order:paid", 'bus.on("order:paid", handler)', "event"],
    ["created", 'emitter.emit("created")', undefined], // no separator
  ];
  for (const [literal, line, kind] of cases) {
    it(`${JSON.stringify(literal)} on \`${line}\` → ${kind ?? "not a key"}`, () => expect(classifyLiteral(literal, line)).toBe(kind));
  }

  it("every shape has a description and is exercised above", () => {
    for (const s of SHAPES) {
      expect(s.description.length).toBeGreaterThan(20);
      expect(cases.some(([, , k]) => k === s.kind)).toBe(true);
    }
  });

  it("quotedLiterals: double, single and plain template strings, escapes; not interpolated templates", () => {
    expect(quotedLiterals(`a("x", 'y\\'z', \`w\`, \`\${v}/u\`)`).map((l) => l.value)).toEqual(["x", "y\\'z", "w"]);
  });

  it("dotenv files and names", () => {
    expect([".env", ".env.example", "config/.env.local", "prod.env", "env.ts", "src/.envrc.ts"].map(isDotenvFile)).toEqual([true, true, true, true, false, false]);
    expect(["DB_URL=x", "export DB_URL=x", "# DB_URL=x", "  KEY = 1"].map(dotenvName)).toEqual(["DB_URL", "DB_URL", undefined, "KEY"]);
  });

  it("usesKey: whole keys only, per kind", () => {
    expect(usesKey('fetch("/api/users")', "/api/users", "route")).toBe(true);
    expect(usesKey("fetch(`${base}/api/users`)", "/api/users", "route")).toBe(true);
    expect(usesKey('fetch("/api/users/1")', "/api/users", "route")).toBe(false);
    expect(usesKey('new Worker("emails", h)', "emails", "queue")).toBe(true);
    expect(usesKey('new Worker("emails-v2", h)', "emails", "queue")).toBe(false);
    expect(usesKey('client.get(`session:${id}`)', "session:", "redis-key", true)).toBe(true);
    expect(usesKey("process.env.DATABASE_URL", "DATABASE_URL", "env")).toBe(true);
    expect(usesKey("process.env.DATABASE_URL_RO", "DATABASE_URL", "env")).toBe(false);
    expect(usesKey("  - DATABASE_URL=postgres://db", "DATABASE_URL", "env")).toBe(true);
    expect(usesKey('log("DATABASE_URL missing")', "DATABASE_URL", "env")).toBe(false);
  });

  it("NOT_CODE and TEST_FILE", () => {
    expect(["README.md", "pnpm-lock.yaml", "vendor/x.go", "src/a.ts", "app.py"].map((p) => NOT_CODE.test(p))).toEqual([true, true, true, false, false]);
    expect(["src/a.test.ts", "tests/x.py", "pkg/a_test.go", "test_api.py", "src/contest.ts"].map((p) => TEST_FILE.test(p))).toEqual([true, true, true, true, false]);
  });
});
