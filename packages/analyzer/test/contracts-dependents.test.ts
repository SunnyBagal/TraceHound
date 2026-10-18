// contracts-v1, dependents: changed exported declarations, their signatures, and use sites in unedited files.
import { afterAll, describe, expect, it } from "vitest";
import { computeDependents, type DependentsResult } from "../src/contracts/dependents.ts";
import { openTrees } from "../src/contracts/trees.ts";
import { CASES, TSCONFIG } from "./fixtures/contracts/cases.ts";
import { makeRepo } from "./fixtures/contracts/repo.ts";

const cleanups: (() => void)[] = [];
afterAll(() => cleanups.forEach((c) => c()));

function dependents(base: Record<string, string>, head: Record<string, string | null>): DependentsResult {
  const r = makeRepo(base, head);
  cleanups.push(r.cleanup);
  const trees = openTrees(r.repo, r.base, r.head);
  try {
    return computeDependents(trees);
  } finally {
    trees.close();
  }
}
const sites = (r: DependentsResult, id: string) => r.declarations.find((d) => d.id === id)?.dependents.map((s) => `${s.path}:${s.line}:${s.resolution}`);
const TS = { "package.json": "{}", "tsconfig.json": TSCONFIG };

describe("contracts dependents: TypeScript", () => {
  it("a gained parameter: the signature at both sides and every confirmed use in unedited files", () => {
    const c = CASES.find((x) => x.name === "required parameter added")!;
    const r = dependents(c.base, c.head);
    expect(r.declarations).toEqual([
      {
        id: "src/greet.ts#greet", name: "greet", file: "src/greet.ts", kind: "function", language: "ts", status: "modified", modifications: ["signature"],
        signature: { base: "export function greet(name: string)", head: "export function greet(name: string, greeting: string)" },
        dependents: [
          { path: "src/app.ts", line: 1, text: 'import { greet } from "./greet";', resolution: "symbol" },
          { path: "src/app.ts", line: 2, text: 'export const message = greet("a");', resolution: "symbol" },
        ],
        rejected: 0,
      },
    ]);
  });

  it("a removed export: its importers still name it through the import", () => {
    const c = CASES.find((x) => x.name === "export renamed, stale importer")!;
    const r = dependents(c.base, c.head);
    expect(r.declarations.map((d) => [d.id, d.status, d.signature.head])).toEqual([["src/users.ts#getUser", "removed", undefined]]);
    expect(sites(r, "src/users.ts#getUser")).toEqual(["src/page.ts:1:import", "src/page.ts:2:import"]);
  });

  it("an interface whose shape changed and a function whose body changed are both listed; types use their whole definition", () => {
    const c = CASES.find((x) => x.name === "exported field removed")!;
    const r = dependents(c.base, c.head);
    expect(r.declarations.map((d) => [d.id, d.modifications])).toEqual([
      ["src/user.ts#load", ["body"]],
      ["src/user.ts#User", ["shape"]],
    ]);
    expect(r.declarations[1]!.signature).toEqual({ base: "export interface User { id: string; name: string; email: string; }", head: "export interface User { id: string; name: string; }" });
    expect(sites(r, "src/user.ts#load")).toEqual(["src/view.ts:1:symbol", "src/view.ts:2:symbol"]);
  });

  it("a same-named declaration elsewhere is rejected and counted, not listed", () => {
    const r = dependents(
      { ...TS, "src/a.ts": "export function save(x: number) {\n  return x;\n}\n", "src/b.ts": "function save() {\n  return 0;\n}\nexport const v = save();\n" },
      { "src/a.ts": "export function save(x: string) {\n  return x;\n}\n" },
    );
    expect(r.declarations[0]).toMatchObject({ id: "src/a.ts#save", dependents: [], rejected: 2 });
  });

  it("formatting-only edits and unexported declarations are not changes", () => {
    const r = dependents({ ...TS, "src/a.ts": "export function f(x: number) {\n  return x;\n}\nfunction g() {\n  return 1;\n}\n" }, { "src/a.ts": "export function f( x: number ) {\n  // same\n  return x;\n}\nfunction g() {\n  return 2;\n}\n" });
    expect(r.declarations).toEqual([]);
  });

  it("methods of an exported class count as exported", () => {
    const cls = (sig: string) => `export class Cart {\n  add(${sig}) {\n    return 1;\n  }\n}\n`;
    const r = dependents({ ...TS, "src/cart.ts": cls("n: number"), "src/use.ts": 'import { Cart } from "./cart";\nnew Cart().add(1);\n' }, { "src/cart.ts": cls("n: number, qty: number") });
    expect(r.declarations.map((d) => [d.id, d.signature])).toEqual([["src/cart.ts#Cart.add", { base: "add(n: number)", head: "add(n: number, qty: number)" }]]);
    expect(sites(r, "src/cart.ts#Cart.add")).toEqual(["src/use.ts:2:symbol"]);
  });
});

describe("contracts dependents: other languages", () => {
  it("Python: a changed def line, uses by whole word", () => {
    const r = dependents(
      { "tasks.py": "def send_welcome(user_id):\n    return user_id\n\ndef _private(x):\n    return x\n", "app.py": "from tasks import send_welcome\nsend_welcome(1)\nresend_welcome(1)\n" },
      { "tasks.py": "def send_welcome(user_id, locale):\n    return user_id\n\ndef _private(x, y):\n    return x\n" },
    );
    expect(r.declarations.map((d) => [d.id, d.language, d.status, d.signature])).toEqual([["tasks.py#send_welcome", "python", "modified", { base: "def send_welcome(user_id):", head: "def send_welcome(user_id, locale):" }]]);
    expect(sites(r, "tasks.py#send_welcome")).toEqual(["app.py:1:name", "app.py:2:name"]);
  });

  it("Go: an exported func removed; unexported ones are not listed", () => {
    const r = dependents(
      { "store.go": "package main\n\nfunc LoadSession(id string) string {\n\treturn id\n}\n\nfunc helper() {}\n", "main.go": "package main\n\nfunc main() {\n\tLoadSession(\"1\")\n}\n" },
      { "store.go": "package main\n\nfunc helper(x int) {}\n" },
    );
    expect(r.declarations.map((d) => [d.id, d.status, d.signature.head])).toEqual([["store.go#LoadSession", "removed", undefined]]);
    expect(sites(r, "store.go#LoadSession")).toEqual(["main.go:4:name"]);
  });
});
