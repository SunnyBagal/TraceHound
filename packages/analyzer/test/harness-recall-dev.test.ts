// Decision 044: the four seeded dev tasks on Recall, validated with scripted patches and no model.
// For each task the oracle fix is RESOLVED (repro passes, the 62 baseline tests all still pass,
// compared per test) and the empty patch is UNRESOLVED because the repro still fails. A task that
// fails either is replaced, not adjusted.
// Needs Docker and outbound network (GitHub, npm): runs only with TRACEHOUND_NETWORK_TESTS=1 (CI sets it).
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { NoopAgent, OracleAgent, type Agent } from "../src/harness/agents.ts";
import { dockerAvailable, LocalDockerProvider, SANDBOX_IMAGE } from "../src/harness/docker.ts";
import { runRepair, type RunRecord } from "../src/harness/run.ts";
import { loadTask } from "../src/harness/task.ts";

const TASKS = path.resolve(import.meta.dirname, "../../../eval/tasks");
const DEV_TASKS = ["recall-dev-short-summary", "recall-dev-search-description", "recall-dev-session-expiry", "recall-dev-chat-recent"];
const run = (id: string, agent: Agent): Promise<RunRecord> => runRepair({ task: loadTask(path.join(TASKS, id, "task.json")), agent, provider: new LocalDockerProvider(), image: SANDBOX_IMAGE });

const docker = dockerAvailable();
const enabled = docker.ok && process.env.TRACEHOUND_NETWORK_TESTS === "1";
const why = !docker.ok ? `Docker is not available (${docker.detail})` : "set TRACEHOUND_NETWORK_TESTS=1 (needs GitHub + npm access)";

if (!enabled) {
  console.warn(`\n⚠ SKIPPED harness-recall-dev (dev tasks on Recall in a sandbox): ${why}.\n`);
  describe.skip(`dev tasks on Recall (skipped: ${why})`, () => it("needs Docker + network", () => {}));
} else
  describe("dev tasks on Recall: scripted patches, no model (decision 044)", () => {
    beforeAll(async () => {
      await LocalDockerProvider.ensureImage();
    }, 15 * 60_000);

    for (const id of DEV_TASKS) {
      it(`${id}: oracle fix → RESOLVED, per test, nothing regressed`, async () => {
        const r = await run(id, new OracleAgent(readFileSync(path.join(TASKS, id, "fix.patch"), "utf8")));
        expect(r).toMatchObject({ finalState: "RESOLVED", taskKind: "dev", repro: { atBase: { exitCode: 1 }, afterPatch: { exitCode: 0 } } });
        // the seed leaves Recall's own suite green: 62 tests, all passing at the seeded base and after the fix
        expect(r.baseline!.regression[0]!.tests).toHaveLength(62);
        expect(r.baseline!.regression[0]!.tests!.every((t) => t.status === "passed")).toBe(true);
        expect(r.comparison).toMatchObject({ granularity: "test", regressedTests: [], newFailures: [] });
        expect(r.changes!.modifiedBase).toHaveLength(1);
      }, 6 * 60_000);

      it(`${id}: empty patch → UNRESOLVED, repro still fails`, async () => {
        const r = await run(id, new NoopAgent());
        expect(r).toMatchObject({ finalState: "UNRESOLVED", taskKind: "dev", reason: "repro still fails (exit 1)" });
      }, 6 * 60_000);
    }
  });
