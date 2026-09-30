// Infrastructure check (not a task: no repro test, no agent): a Git-URL source for real.
// Clone the demo fork at its pinned commit, install with network, cut the network and prove it,
// then record the baseline (tsc per package, bun test) exactly as a repair run would.
// Needs Docker and outbound network (GitHub, npm): runs only with TRACEHOUND_NETWORK_TESTS=1 (CI sets it).
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { dockerAvailable, LocalDockerProvider, SANDBOX_IMAGE } from "../src/harness/docker.ts";
import type { SandboxHandle } from "../src/harness/provider.ts";
import { collectChecks, makeSh, NETWORK_PROBES, prepareSandbox, type CommandRecord } from "../src/harness/run.ts";

const FORK = "https://github.com/SunnyBagal/cex-v2-boilercode";
const PINNED = "da0e3d640a9c02f815fcca48f8328c94558cc058";
const docker = dockerAvailable();
const enabled = docker.ok && process.env.TRACEHOUND_NETWORK_TESTS === "1";
const why = !docker.ok ? `Docker is not available (${docker.detail})` : "set TRACEHOUND_NETWORK_TESTS=1 (needs GitHub + npm access)";

if (!enabled) {
  console.warn(`\n⚠ SKIPPED harness-infra (Git-URL source, CEX in a sandbox): ${why}.\n`);
  describe.skip(`harness infra: CEX from a Git URL (skipped: ${why})`, () => it("needs Docker + network", () => {}));
} else
  describe("harness infra: CEX fork from a Git URL", () => {
    it("clones, installs with network, proves the network off, and records the baseline", async () => {
      await LocalDockerProvider.ensureImage();
      const provider = new LocalDockerProvider();
      const log: CommandRecord[] = [];
      const timings: Record<string, number> = {};
      let handle: SandboxHandle | undefined;
      const started = performance.now();
      try {
        await prepareSandbox({
          provider,
          image: SANDBOX_IMAGE,
          source: { gitUrl: FORK, sha: PINNED },
          baseSha: PINNED,
          setup: ["cd backend && bun install --frozen-lockfile", "cd engine && bun install --frozen-lockfile"],
          commandTimeoutMs: 300_000,
          log,
          onHandle: (h) => (handle = h),
          timings,
        });
        // network proven off before anything else runs
        expect(log.filter((c) => c.phase === "NETWORK_OFF").map((c) => [c.cmd, c.exitCode !== 0])).toEqual(NETWORK_PROBES.map((p) => [p, true]));

        const sh = makeSh(provider, () => handle!, log, 300_000);
        let t = performance.now();
        const baseline = await collectChecks(sh, "BASELINE", {
          regression: ["cd backend && bun test", "cd engine && bun test"],
          typecheck: { packages: ["backend", "engine"], command: "tsc --noEmit" },
        });
        timings["baseline: bun test x2 + tsc x2"] = Math.round(performance.now() - t);
        const tsc = Object.fromEntries(baseline.typecheck.map((x) => [x.package, x.errors]));
        const tscCmds = log.filter((c) => c.cmd.includes("tsc --noEmit"));
        const bunTests = log.filter((c) => c.cmd.includes("bun test"));
        console.log(
          JSON.stringify(
            {
              timingsMs: timings,
              typecheckErrors: tsc,
              typecheckOutput: tscCmds.map((c) => ({ cmd: c.cmd, exitCode: c.exitCode, out: (c.stdoutTail + c.stderrTail).trim() })),
              bunTest: bunTests.map((c) => ({ cmd: c.cmd, exitCode: c.exitCode, out: (c.stdoutTail + c.stderrTail).trim().split("\n").slice(-1)[0] })),
              setupCommands: log.filter((c) => c.phase === "PREPARING_SANDBOX").map((c) => ({ cmd: c.cmd, exitCode: c.exitCode, durationMs: c.durationMs })),
            },
            null,
            2,
          ),
        );

        // the backend's pre-existing Prisma import error is baseline: exactly 1 error, recorded, not a failure
        expect(tsc).toEqual({ backend: 1, engine: 0 });
        expect(tscCmds[0]!.stdoutTail).toContain("src/db.ts(2,30): error TS2307: Cannot find module './generated/prisma/client'");
        // CEX has no tests: bun test exits 1 ("No tests found!" in the sandbox)
        for (const b of baseline.regression) expect(b.exitCode).toBe(1);
        for (const c of bunTests) expect(c.stdoutTail + c.stderrTail).toMatch(/No tests found!|0 test files matching/);
      } finally {
        const t = performance.now();
        if (handle) await provider.destroy(handle);
        timings.destroy = Math.round(performance.now() - t);
        timings.total = Math.round(performance.now() - started);
        console.log(`timings (ms): ${JSON.stringify(timings)}`);
      }
      expect(spawnSync("docker", ["ps", "-a", "-q", "--filter", `name=^/${handle!.id}$`], { encoding: "utf8" }).stdout.trim()).toBe("");
    }, 15 * 60_000);
  });
