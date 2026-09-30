// tracehound repair --task <task.json> --agent oracle|noop [--patch <file>] --provider docker [--runs-dir runs]
// Exit code: 0 RESOLVED · 1 UNRESOLVED · 2 FAILED/CANCELLED · 3 bad arguments / Docker unavailable.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { NoopAgent, OracleAgent, type Agent } from "./agents.ts";
import { DockerUnavailableError, LocalDockerProvider, SANDBOX_IMAGE } from "./docker.ts";
import { runRepair, type RunRecord } from "./run.ts";
import { loadTask } from "./task.ts";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../..");
const USAGE = "usage: tracehound repair --task <task.json> --agent oracle|noop [--patch <file>] --provider docker [--runs-dir runs]";

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
    },
  });
  const fail = (msg: string) => (console.error(`✖ ${msg}`), 3);
  if (!values.task || !values.agent) return fail(USAGE);
  if (values.provider !== "docker") return fail(`unknown provider "${values.provider}" (only docker; Contree comes after the Sandboxes spike)\n${USAGE}`);
  let agent: Agent;
  if (values.agent === "oracle") {
    if (!values.patch) return fail(`--agent oracle needs --patch <file>\n${USAGE}`);
    agent = new OracleAgent(readFileSync(values.patch, "utf8"));
  } else if (values.agent === "noop") agent = new NoopAgent();
  else return fail(`unknown agent "${values.agent}" (oracle | noop)\n${USAGE}`);

  const task = loadTask(values.task);
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

  const record = await runRepair({ task, agent, provider, image, signal: abort.signal, onState: (s, note) => console.error(`[repair] ${s}${note ? `: ${note}` : ""}`) });
  const file = writeRun(record, path.resolve(values["runs-dir"]!));
  console.log(`${record.finalState} · ${record.taskId} · agent ${record.agent} · ${record.sandbox.createToDestroyMs ?? "?"}ms create→destroy · ${record.reason}`);
  console.log(`→ ${path.relative(process.cwd(), file)}`);
  return record.finalState === "RESOLVED" ? 0 : record.finalState === "UNRESOLVED" ? 1 : 2;
}
