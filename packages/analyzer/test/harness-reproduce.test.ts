// Reproduce stage (decision 048) end to end on real Docker sandboxes, with scripted agents and no
// model: the toy-cart fixture (its base has the discount bug: 10% off 200 charges 190), a profile
// with a JUnit report, and one claim. Each case writes files (or edits one) the way an agent would;
// the check then runs in a fresh sandbox with only the new file added.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildToyRepo, TOY_BASE_SHA, TOY_REPO } from "../../../eval/fixtures/build-toy-repo.ts";
import type { Agent, AgentContext } from "../src/harness/agents.ts";
import { dockerAvailable, LocalDockerProvider, SANDBOX_IMAGE } from "../src/harness/docker.ts";
import { loadClaim, runReproduce, type LoadedClaim, type ReproRecord } from "../src/harness/reproduce.ts";

/** Writes files and runs shell commands in the sandbox, as an agent's tools would. */
class ScriptedAgent implements Agent {
  readonly name = "scripted";
  readonly #files: Record<string, string>;
  readonly #cmds: string[];
  constructor(files: Record<string, string>, cmds: string[] = []) {
    this.#files = files;
    this.#cmds = cmds;
  }
  async run(ctx: AgentContext): Promise<void> {
    for (const [file, content] of Object.entries(this.#files)) await ctx.writeFile(file, content);
    for (const cmd of this.#cmds) {
      const r = await ctx.exec(cmd);
      if (r.exitCode !== 0) throw new Error(`${cmd} failed: ${r.stderr}`);
    }
  }
}

const HEADER = 'import { expect, test } from "bun:test";\n';
const FAILING = `${HEADER}import { checkoutTotal } from "../src/cart.ts";\n\ntest("a 10% discount on a 200 cart charges 180", () => {\n  expect(checkoutTotal([{ price: 100, qty: 2 }], 10)).toBe(180);\n});\n`;
const PASSING = `${HEADER}import { subtotal } from "../src/cart.ts";\n\ntest("subtotal adds price times quantity", () => {\n  expect(subtotal([{ price: 100, qty: 2 }])).toBe(200);\n});\n`;
const IMPORT_ERROR = `${HEADER}import { checkoutTotal } from "../src/checkout.ts";\n\ntest("a 10% discount on a 200 cart charges 180", () => {\n  expect(checkoutTotal([{ price: 100, qty: 2 }], 10)).toBe(180);\n});\n`;
// fails the first time it runs in a sandbox, passes after that
const FLAKY = `${HEADER}import { existsSync, writeFileSync } from "node:fs";\n\ntest("flaky", () => {\n  const seen = existsSync("/tmp/.flaky-marker");\n  writeFileSync("/tmp/.flaky-marker", "x");\n  expect(seen).toBe(true);\n});\n`;
const TYPE_ERROR_AT_RUNTIME = `${HEADER}import { checkoutTotal } from "../src/cart.ts";\n\ntest("crashes", () => {\n  const items: any = undefined;\n  expect(checkoutTotal(items.list, 10)).toBe(180);\n});\n`;

const containerExists = (id: string) => spawnSync("docker", ["ps", "-a", "-q", "--filter", `name=^/${id}$`], { encoding: "utf8" }).stdout.trim() !== "";

function toyClaim(): LoadedClaim {
  const dir = mkdtempSync(path.join(tmpdir(), "th-repro-"));
  writeFileSync(path.join(dir, "profile.json"), JSON.stringify({ id: "toy", workdir: ".", test: "bun test", typecheck: "$TSC --noEmit", testReport: { format: "junit", command: "bun test --reporter=junit --reporter-outfile=$REPORT" } }));
  writeFileSync(
    path.join(dir, "claim.json"),
    JSON.stringify({ id: "toy-discount", profile: "profile.json", source: { localPath: TOY_REPO }, baseSha: TOY_BASE_SHA, title: "Discounts are wrong", claim: "A 10% discount on a 200 cart charges 190. It should charge 180." }),
  );
  return loadClaim(path.join(dir, "claim.json"));
}

const docker = dockerAvailable();
if (!docker.ok) {
  console.warn(`\n⚠ SKIPPED harness-reproduce Docker tests: ${docker.detail}\n`);
  describe.skip(`reproduce stage on Docker (skipped: ${docker.detail})`, () => it("needs Docker", () => {}));
} else
  describe("reproduce stage on Docker (toy-cart, scripted agents, no model)", () => {
    beforeAll(async () => {
      expect(buildToyRepo()).toBe(TOY_BASE_SHA);
      await LocalDockerProvider.ensureImage();
    }, 15 * 60_000);

    const reproduce = async (agent: Agent): Promise<ReproRecord> => {
      const r = await runReproduce({ claim: toyClaim(), agent, provider: new LocalDockerProvider(), image: SANDBOX_IMAGE });
      for (const box of Object.values(r.sandboxes)) {
        expect(box.destroyed).toBe(true);
        expect(containerExists(box.id!)).toBe(false);
      }
      return r;
    };

    it("a correct failing test → REPRODUCED: each check passes, in a second sandbox at the same base", async () => {
      const r = await reproduce(new ScriptedAgent({ "tests/discount.test.ts": FAILING }));
      expect(r).toMatchObject({ state: "REPRODUCED", testFile: { path: "tests/discount.test.ts", runnerPath: "tests/discount.test.ts", content: FAILING } });
      expect(Object.fromEntries(Object.entries(r.checks).map(([k, v]) => [k, v.ok]))).toEqual({ a: true, b: true, c: true, d: true });
      expect(r.fileRuns.first!.cases).toEqual([{ file: "tests/discount.test.ts", name: "a 10% discount on a 200 cart charges 180", status: "failed", failureType: "AssertionError", message: expect.stringContaining("Expected: 180") }]);
      expect(r.fileRuns.second!.cases!.map((c) => c.status)).toEqual(["failed"]);
      // check d ran the whole suite with the file in it: the 2 existing tests still pass
      expect(r.baseline!.regression[0]!.tests!.map((t) => t.status)).toEqual(["passed", "passed"]);
      expect(r.withFile!.regression[0]!.tests!.filter((t) => t.file === "tests/discount.test.ts").map((t) => t.status)).toEqual(["failed"]);
      expect(r.sandboxes.agent!.id).not.toBe(r.sandboxes.check!.id);
      expect(r.commands.check.filter((c) => c.phase === "NETWORK_OFF").every((c) => c.exitCode !== 0)).toBe(true);
    }, 300_000);

    it("a passing test → NOT_REPRODUCED", async () => {
      const r = await reproduce(new ScriptedAgent({ "tests/subtotal.test.ts": PASSING }));
      expect(r).toMatchObject({ state: "NOT_REPRODUCED", reason: "the test passes: 1 test case(s) ran and passed", checks: { a: { ok: true }, b: { ok: false } } });
    }, 300_000);

    it("no file → NOT_REPRODUCED, without a check sandbox", async () => {
      const r = await reproduce(new ScriptedAgent({}));
      expect(r).toMatchObject({ state: "NOT_REPRODUCED", reason: "no qualifying file: the agent added no file" });
      expect(r.sandboxes.check).toBeUndefined();
    }, 300_000);

    it("an import error → REJECTED, check b (the file did not load)", async () => {
      const r = await reproduce(new ScriptedAgent({ "tests/discount.test.ts": IMPORT_ERROR }));
      expect(r).toMatchObject({ state: "REJECTED", failedCheck: "b", reason: expect.stringMatching(/^check b: the file did not load: no report written \(exit 1/) });
    }, 300_000);

    it("a runtime TypeError → REJECTED, check b (not an assertion)", async () => {
      const r = await reproduce(new ScriptedAgent({ "tests/discount.test.ts": TYPE_ERROR_AT_RUNTIME }));
      expect(r).toMatchObject({ state: "REJECTED", failedCheck: "b", reason: expect.stringContaining("failed on something other than an assertion: crashes (TypeError") });
    }, 300_000);

    it("a file outside the test-file pattern → REJECTED, check a", async () => {
      const r = await reproduce(new ScriptedAgent({ "tests/discount.check.ts": FAILING }));
      expect(r).toMatchObject({ state: "REJECTED", failedCheck: "a", reason: expect.stringContaining("tests/discount.check.ts does not match the test-file pattern") });
      expect(r.sandboxes.check).toBeUndefined();
    }, 300_000);

    it("an edit to an existing file → REJECTED, check a", async () => {
      const r = await reproduce(new ScriptedAgent({}, [`printf '%s\\n' 'test("x", () => expect(1).toBe(2));' >> tests/cart.test.ts`]));
      expect(r).toMatchObject({ state: "REJECTED", failedCheck: "a", reason: "check a: modified existing file(s): tests/cart.test.ts; added 0 files, not exactly one" });
    }, 300_000);

    it("a flaky test → REJECTED, check c", async () => {
      const r = await reproduce(new ScriptedAgent({ "tests/flaky.test.ts": FLAKY }));
      expect(r).toMatchObject({ state: "REJECTED", failedCheck: "c", reason: "check c: second run: the test passed", checks: { b: { ok: true } } });
    }, 300_000);
  });
