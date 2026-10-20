import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTRACTS_BUDGET_MS, readContractsReport, runContracts, settleContracts, type ContractsExecute } from "../src/contracts.ts";

const base = "a".repeat(40), head = "b".repeat(40), mergeBase = "c".repeat(40);
const candidate = { path: "src/consumer.ts", line: 3, body: "What breaks: missing export. Where: src/consumer.ts:3.",
  source: "tsc", category: "contract", severity: "high", evidence: [{ path: "src/api.ts", line: 1, quote: "export function old() {}", side: "base" },
    { path: "src/consumer.ts", line: 3, quote: "old();", side: "head" }] };
const report = () => ({ refs: { base: mergeBase, head, mergeBase }, typed: { complete: true }, keyed: {}, dependents: {},
  findings: [candidate], timings: { totalMs: 12 } });
afterEach(() => vi.useRealTimers());

function fake(value: unknown = report(), shallow = false) {
  let missing = shallow; let output = "";
  const exec = vi.fn<ContractsExecute>(async (file, args) => {
    if (file === "git") {
      if (args.includes("merge-base")) { if (missing) { missing = false; throw new Error("private output"); } return { stdout: mergeBase }; }
      if (args.includes("--is-shallow-repository")) return { stdout: "true" };
      if (args.includes("--git-path")) return { stdout: "/checkout/.git/shallow.lock" };
      if (args.includes("fetch")) return { stdout: "" };
      throw new Error("Unexpected git");
    }
    output = args[args.indexOf("--out") + 1]!;
    await writeFile(output, typeof value === "string" ? value : JSON.stringify(value));
    return { stdout: "private checker output" };
  });
  return { exec, output: () => output };
}

describe("contracts runner", () => {
  it("terminates a timed-out fetch before killing it and removes only its shallow lock", async () => {
    vi.useFakeTimers();
    const repo = await mkdtemp(path.join(tmpdir(), "contracts-lock-"));
    await mkdir(path.join(repo, ".git"));
    const lock = path.join(repo, ".git/shallow.lock"), other = path.join(repo, ".git/index.lock");
    const order: string[] = [];
    const exec: ContractsExecute = (file, args) => {
      if (args.includes("fetch")) {
        let reject!: (error: Error) => void;
        const task = new Promise<{ stdout: string }>((_, fail) => { reject = fail; });
        return Object.assign(task, { child: { kill(signal: string) {
          order.push(signal);
          if (signal === "SIGKILL") reject(new Error("killed"));
          return true;
        } } });
      }
      if (args.includes("merge-base")) return Promise.reject(new Error("missing"));
      return Promise.resolve({ stdout: args.includes("--git-path") ? lock : "true" });
    };
    try {
      const result = runContracts(repo, base, head, {}, exec);
      await vi.advanceTimersByTimeAsync(0);
      await writeFile(lock, "fetch lock"); await writeFile(other, "other lock");
      await vi.advanceTimersByTimeAsync(CONTRACTS_BUDGET_MS);
      expect(order).toEqual(["SIGTERM"]);
      await vi.advanceTimersByTimeAsync(4_999);
      expect(order).toEqual(["SIGTERM"]);
      order.push("waited 5s");
      await vi.advanceTimersByTimeAsync(1);
      expect(await result).toMatchObject({ status: "failed", reason: "timeout", messages: ["contracts: removed shallow.lock after killed fetch"] });
      expect(order).toEqual(["SIGTERM", "waited 5s", "SIGKILL"]);
      await expect(access(lock)).rejects.toThrow(); await expect(access(other)).resolves.toBeUndefined();
    } finally { await rm(repo, { recursive: true, force: true }); }
  });
  it("does not start a base fetch with less than 30 seconds remaining", async () => {
    const f = fake(report(), true);
    vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValue(61_000);
    try {
      expect(await runContracts("/checkout", base, head, {}, f.exec)).toMatchObject({ status: "failed", reason: "merge-base" });
      expect(f.exec.mock.calls.some(([, args]) => args.includes("fetch"))).toBe(false);
    } finally { vi.restoreAllMocks(); }
  });
  it("passes the merge base and remaining budget to the trusted CLI, removes credentials and cleans temp files", async () => {
    const f = fake();
    const result = await runContracts("/checkout", base, head, { GIT_DIR: "/wrong", GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.extraheader", GIT_CONFIG_VALUE_0: "fake-secret", GITHUB_TOKEN: "fake-secret",
      NEBIUS_API_KEY: "fake-secret", GIT_CONFIG_GLOBAL: "/runner-config" }, f.exec);
    expect(result).toMatchObject({ status: "ok", findings: [{ path: candidate.path, line: 3, body: candidate.body }] });
    const [file, args, options] = f.exec.mock.calls.find(([file]) => file !== "git")!;
    expect(file).toBe(process.execPath);
    expect(args).toEqual([expect.stringContaining("packages/analyzer/src/bin.ts"), "contracts", "--repo", "/checkout",
      "--base", mergeBase, "--head", head, "--out", f.output(), "--budget-s", expect.stringMatching(/^(79|80)$/)]);
    expect(options.cwd).not.toBe("/checkout");
    expect(options.env).not.toHaveProperty("GITHUB_TOKEN"); expect(options.env).not.toHaveProperty("NEBIUS_API_KEY");
    expect(options.env).not.toHaveProperty("GIT_DIR"); expect(options.env).not.toHaveProperty("GIT_CONFIG_VALUE_0");
    expect(options.env.GIT_CONFIG_GLOBAL).toBe("/runner-config");
    expect(options.timeout).toBeLessThanOrEqual(CONTRACTS_BUDGET_MS);
    await expect(access(f.output())).rejects.toThrow();
  });
  it("shrinks the analyzer budget after a slow merge-base", async () => {
    const f = fake(); let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const exec: ContractsExecute = (file, args, options) => {
      if (args.includes("merge-base")) now = 24_000;
      return f.exec(file, args, options);
    };
    try {
      expect((await runContracts("/checkout", base, head, {}, exec)).status).toBe("ok");
      const args = f.exec.mock.calls.find(([file]) => file !== "git")![1];
      expect(args[args.indexOf("--budget-s") + 1]).toBe("56");
    } finally { vi.restoreAllMocks(); }
  });
  it("skips the analyzer when fewer than five budget seconds remain after cleanup reserve", async () => {
    const f = fake(); let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const exec: ContractsExecute = (file, args, options) => {
      if (args.includes("merge-base")) now = 76_000;
      return f.exec(file, args, options);
    };
    try {
      expect(await runContracts("/checkout", base, head, {}, exec)).toMatchObject({ status: "failed", reason: "timeout" });
      expect(f.exec.mock.calls.every(([file]) => file === "git")).toBe(true);
    } finally { vi.restoreAllMocks(); }
  });
  it("unshallows and fetches the base without credentials before retrying merge-base", async () => {
    const f = fake(report(), true);
    expect((await runContracts("/checkout", base, head, {}, f.exec)).status).toBe("ok");
    const fetch = f.exec.mock.calls.find(([, args]) => args.includes("fetch"))!;
    expect(fetch[1]).toContain("--unshallow"); expect(fetch[1].slice(-2)).toEqual(["origin", base]);
    expect(fetch[1]).toContain("credential.helper="); expect(fetch[1]).toContain("http.https://github.com/.extraheader=");
    expect(f.exec.mock.calls.filter(([, args]) => args.includes("merge-base"))).toHaveLength(2);
  });
  it.each(["not JSON", {}, { ...report(), refs: { base, head, mergeBase } },
    { ...report(), findings: [{ ...candidate, path: "../outside.ts" }] },
    { ...report(), findings: [{ ...candidate, line: 0 }] }])("contains invalid output without exposing it: %j", async value => {
    const f = fake(value);
    expect(await runContracts("/checkout", base, head, {}, f.exec)).toMatchObject({ status: "failed", findings: [], reason: "invalid-output" });
  });
  it.each(["budget", "error"])("keeps keyed findings when typed checking skipped for %s", async skipped => {
    const f = fake({ ...report(), typed: { skipped, reason: "private detail" }, findings: [{ ...candidate, source: "contract" }] });
    const log = vi.fn();
    expect(await settleContracts(() => runContracts("/checkout", base, head, {}, f.exec), log)).toMatchObject({
      status: "ok", typed: `skipped-${skipped}`, findings: [{ path: candidate.path, line: 3, body: candidate.body }],
    });
    expect(log).toHaveBeenCalledExactlyOnceWith(`contracts: typed check skipped (${skipped}); key checks only.`);
  });
  it("still permits keyed findings when the repo has no tsconfig", () => {
    expect(readContractsReport({ ...report(), typed: { skipped: "no-tsconfig" } }, mergeBase, head)).toHaveLength(1);
  });
  it("logs exactly one sanitized line on a runner exception", async () => {
    const log = vi.fn();
    const result = await settleContracts(async () => { throw new Error("fake-secret"); }, log);
    expect(result.status).toBe("failed"); expect(log).toHaveBeenCalledExactlyOnceWith("contracts: failed (error)");
  });
  it("bounds even an injected runner that never settles", async () => {
    vi.useFakeTimers(); const log = vi.fn();
    const result = settleContracts(() => new Promise(() => {}), log);
    await vi.advanceTimersByTimeAsync(CONTRACTS_BUDGET_MS + 5_100);
    expect(await result).toMatchObject({ status: "failed", findings: [], reason: "timeout" });
    expect(log).toHaveBeenCalledExactlyOnceWith("contracts: failed (timeout)");
  });
});
