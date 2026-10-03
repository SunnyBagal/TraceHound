// tracehound repair --task <task.json> --agent oracle|noop|nemotron [--patch <file>] [--graph on|off]
//                   [--reasoning on|off] [--decider lexical|nemotron] [--model <id>] --provider docker [--runs-dir runs]
// Exit code: 0 RESOLVED · 1 UNRESOLVED · 2 FAILED/CANCELLED · 3 bad arguments / Docker unavailable.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { createTokenFactoryClient } from "../llm/setup.ts";
import { loadSnapshot } from "../agent/query.ts";
import { NoopAgent, OracleAgent, type Agent } from "./agents.ts";
import { RepairLoopAgent, type LoopOptions } from "./loop.ts";
import { DockerUnavailableError, LocalDockerProvider, SANDBOX_IMAGE } from "./docker.ts";
import { runRepair, type GraphSnapshotRef, type RunRecord } from "./run.ts";
import { loadTask } from "./task.ts";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../..");
const USAGE =
  "usage: tracehound repair --task <task.json> --agent oracle|noop|nemotron [--patch <file>] [--graph on|off] [--reasoning on|off] [--decider lexical|nemotron] [--model <id>] --provider docker [--runs-dir runs]";

export function writeRun(record: RunRecord, runsDir: string): string {
  mkdirSync(runsDir, { recursive: true });
  const file = path.join(runsDir, `${record.runId}.json`);
  writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  return file;
}

export async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      task: { type: "string" },
      agent: { type: "string" },
      patch: { type: "string" },
      provider: { type: "string", default: "docker" },
      "runs-dir": { type: "string", default: path.join(WORKSPACE_ROOT, "runs") },
      graph: { type: "string", default: "off" },
      reasoning: { type: "string", default: "on" }, // agent-v4 default (decision 034); the decider and naming keep their own settings
      decider: { type: "string", default: "lexical" },
      // decision 047: the repair agent's model (default Nano); Super/Ultra only when named here
      model: { type: "string" },
    },
  });
  const fail = (msg: string) => (console.error(`✖ ${msg}`), 3);
  if (!values.task || !values.agent) return fail(USAGE);
  if (values.provider !== "docker") return fail(`unknown provider "${values.provider}" (only docker: local Docker is the sandbox of record, decision 036)\n${USAGE}`);
  let agent: Agent | undefined;
  if (values.agent === "oracle") {
    if (!values.patch) return fail(`--agent oracle needs --patch <file>\n${USAGE}`);
    agent = new OracleAgent(readFileSync(values.patch, "utf8"));
  } else if (values.agent === "noop") agent = new NoopAgent();
  else if (values.agent !== "nemotron") return fail(`unknown agent "${values.agent}" (oracle | noop | nemotron)\n${USAGE}`);
  for (const [flag, allowed] of [["graph", ["on", "off"]], ["reasoning", ["on", "off"]], ["decider", ["lexical", "nemotron"]]] as const) {
    if (!(allowed as readonly string[]).includes(values[flag]!)) return fail(`--${flag} must be ${allowed.join(" or ")}\n${USAGE}`);
  }

  const task = loadTask(values.task);
  let llm: ReturnType<typeof createTokenFactoryClient>["client"] | undefined;
  let snapshotRef: GraphSnapshotRef | undefined;
  if (values.agent === "nemotron") {
    let graph: LoopOptions["graph"];
    if (values.graph === "on") {
      if (!task.spec.snapshot) return fail(`--graph on needs a "snapshot" in ${values.task}`);
      const file = path.resolve(task.dir, task.spec.snapshot);
      const { snapshot } = loadSnapshot(file);
      if (snapshot.repo.commitSha !== task.spec.baseSha) return fail(`snapshot is for ${snapshot.repo.commitSha}, task baseSha is ${task.spec.baseSha}`);
      graph = { snapshot, decider: values.decider as "lexical" | "nemotron" };
      snapshotRef = {
        path: path.relative(WORKSPACE_ROOT, file),
        analyzerVersion: snapshot.analyzerVersion,
        commitSha: snapshot.repo.commitSha,
        sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
      };
    }
    agent = new RepairLoopAgent({ reasoning: values.reasoning as "on" | "off", graph, ...(values.model && { model: values.model }) });
    // every model call: budget caps (TRACEHOUND_BUDGET_*) → request → ledger; cache reads off so each run is a real run
    llm = createTokenFactoryClient({ readCache: false }).client;
  }
  try {
    console.error(`[repair] docker ${LocalDockerProvider.assertAvailable()}`);
  } catch (error) {
    if (error instanceof DockerUnavailableError) return fail(error.message);
    throw error;
  }
  const image = task.spec.image ?? SANDBOX_IMAGE;
  await LocalDockerProvider.ensureImage(image);
  const provider = new LocalDockerProvider();

  // Ctrl-C / SIGTERM: abort the run and remove its container now; the run ends CANCELLED.
  const abort = new AbortController();
  const onSignal = (sig: string) => {
    console.error(`[repair] ${sig}: cancelling, removing sandbox`);
    abort.abort();
    for (const h of provider.live()) void provider.destroy(h);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  const record = await runRepair({ task, agent: agent!, provider, image, llm, ...(snapshotRef && { snapshot: snapshotRef }), signal: abort.signal, onState: (s, note) => console.error(`[repair] ${s}${note ? `: ${note}` : ""}`) });
  const file = writeRun(record, path.resolve(values["runs-dir"]!));
  console.log(
    `${record.finalState} · ${record.taskId} · agent ${record.agent} · ${record.agentRun?.steps ?? 0} steps · ${record.usage.tokens} tokens · $${record.usage.costUSD.toFixed(5)} · ${record.sandbox.createToDestroyMs ?? "?"}ms create→destroy · ${record.reason}`,
  );
  if (record.arm)
    console.log(`arm: ${record.arm.arm} · packet ${record.arm.packetInjected ? `injected, ${record.arm.packetChars} chars (~${record.arm.packetTokensEstimated} tokens est.)` : "not injected"} · ${record.arm.graphToolCalls} graph tool call(s)`);
  if (record.faultFileRead) {
    const r = record.faultFileRead.read;
    console.log(`fault file: ${r ? `first read at step ${r.step} (${r.file}), ${r.tokens} tokens so far` : "never read"} · seed changed ${record.faultFileRead.files.join(", ")}`);
  }
  const env = record.sandboxEnv;
  console.log(
    `sandbox: ${env ? `${env.providerVersion} · ${env.engineVersion ?? "engine ?"} · ${env.image} ${env.imageId ?? "(image id unknown)"}` : "(not described)"} · snapshot: ${record.snapshot === "none" ? "none" : `${record.snapshot.path} (${record.snapshot.analyzerVersion}, sha256 ${record.snapshot.sha256.slice(0, 12)}…)`}`,
  );
  console.log(`→ ${path.relative(process.cwd(), file)}`);
  return record.finalState === "RESOLVED" ? 0 : record.finalState === "UNRESOLVED" ? 1 : 2;
}
