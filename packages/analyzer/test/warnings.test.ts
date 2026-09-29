import { describe, expect, it } from "vitest";
import { orphanWarnings } from "../src/aggregate/warnings.ts";
import type { FileFacts } from "../src/schema.ts";

const file = (path: string, extra: Partial<FileFacts> = {}): FileFacts => ({
  path, package: ".", language: "ts", loc: 1, isEntry: false, imports: [], symbols: [], routes: [], mounts: [], listens: [],
  clients: [], redisOps: [], prismaOps: [], prismaModels: [], envReads: [], ...extra,
});
const imports = (target: string) => [{ specifier: target, target, external: false, typeOnly: false, names: [], evidenceId: "e" }];

describe("orphanWarnings", () => {
  const files = [
    file("src/index.ts", { isEntry: true, imports: imports("src/used.ts") }),
    file("src/used.ts"),
    file("src/store/exchange-store.ts", { symbols: [{ name: "ORDERS", kind: "variable", exported: true, range: { startLine: 1, endLine: 1 } }] }),
    file("src/self.ts", { imports: imports("src/self.ts") }),
    file("src/types/express.d.ts"),
    file("prisma.config.ts"),
    file("prisma/schema.prisma", { language: "prisma" }),
  ];
  const warnings = orphanWarnings(files, new Map([["src/store/exchange-store.ts", "pkg:worker"]]));

  it("flags non-entry source files nothing imports (self-imports don't count)", () => {
    expect(warnings.map((w) => w.file)).toEqual(["src/store/exchange-store.ts", "src/self.ts"]);
  });

  it("links the warning to the file's component and explains it", () => {
    expect(warnings[0]).toMatchObject({ kind: "orphan-file", severity: "warning", componentId: "pkg:worker" });
    expect(warnings[0]!.message).toMatch(/not imported by any file.*exports 1 symbols/);
  });

  it("ignores declaration files, tool configs and entry points", () => {
    expect(warnings.some((w) => /express\.d\.ts|prisma\.config|index\.ts|schema\.prisma/.test(w.file))).toBe(false);
  });
});
