import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fetchPullEvent, runAction, type Dependencies, type Options, type PullEvent } from "./action.ts";
import { runReviewer } from "./reviewer.ts";
import { checkRepoHead, MissingHeadError, runPipeline } from "./pipeline.ts";
import { createFixClient, runFixes } from "./fix.ts";
import { parseReviewFooter } from "./data.ts";
import { runContracts } from "./contracts.ts";
import { formatUsageSummary, ledgerMark, ledgerSince, recordingClient, UsageRecorder, writeUsageSummary } from "./usage.ts";

/** The analyzer CLIs and the fix client all ledger to this file (review/cli.ts STATE_DIR, fix.ts createFixClient). */
const LEDGER_FILE = path.resolve(import.meta.dirname, "../../..", ".tracehound/spend.jsonl");

export interface UsageContext { recorder: UsageRecorder; ledgerFile: string }

function defaultDependencies(env: NodeJS.ProcessEnv, recorder: UsageRecorder): Dependencies {
  // runPipeline logs its own "nothing posted" lines; they set the summary's outcome too.
  const log = recorder.logger(console.log);
  return { fetch, checkRepoHead,
    runReviewer: async (input, model) => {
      const output = await runReviewer(input, model);
      recorder.add("diff reviewer", (output as { review?: { usage?: unknown } } | null)?.review?.usage);
      return output;
    },
    runContracts: (repo, base, head) => runContracts(repo, base, head, env),
    runFixes: (...args) => runFixes(...args, recordingClient(createFixClient(), recorder, "fixes")),
    runPipeline: (...args) => runPipeline(...args, log, undefined, { onUsage: recorder.add }), log };
}

export async function main(
  env: NodeJS.ProcessEnv,
  deps?: Dependencies,
  usage: UsageContext = { recorder: new UsageRecorder(), ledgerFile: LEDGER_FILE },
): Promise<number> {
  deps ??= defaultDependencies(env, usage.recorder);
  const reviewer = env.TRACEHOUND_REVIEWER ?? "pool-verify-v1";
  if (reviewer !== "pool-verify-v1" && reviewer !== "review-diff-v1") {
    deps.log("TraceHound: reviewer must be pool-verify-v1 or review-diff-v1.");
    return 1;
  }
  if (!env.NEBIUS_API_KEY?.trim()) {
    deps.log("TraceHound: NEBIUS_API_KEY is missing. Set the required nebius-api-key action input.");
    return 1;
  }
  const prNumber = env.TRACEHOUND_PR_NUMBER?.trim() ?? "";
  const dispatch = env.GITHUB_EVENT_NAME === "workflow_dispatch" && prNumber !== "";
  if (env.GITHUB_EVENT_NAME !== "pull_request" && !dispatch) {
    deps.log("TraceHound: only pull_request events and workflow_dispatch with a pr-number are supported; skipped.");
    return 0;
  }
  if (dispatch && (!/^[1-9]\d{0,9}$/.test(prNumber) || !/^[^/\s]+\/[^/\s]+$/.test(env.GITHUB_REPOSITORY ?? ""))) {
    deps.log("TraceHound: workflow_dispatch needs a positive pr-number and GITHUB_REPOSITORY.");
    return 1;
  }
  if (!env.GITHUB_TOKEN || (!dispatch && !env.GITHUB_EVENT_PATH)) {
    deps.log("TraceHound: GITHUB_TOKEN and GITHUB_EVENT_PATH are required.");
    return 1;
  }
  const dryRun = env.TRACEHOUND_DRY_RUN ?? "false";
  const fixes = env.TRACEHOUND_FIXES ?? "on";
  const contracts = env.TRACEHOUND_CONTRACTS ?? "on";
  if (contracts !== "on" && contracts !== "off") {
    deps.log("TraceHound: contracts must be on or off.");
    return 1;
  }
  if (fixes !== "on" && fixes !== "off") {
    deps.log("TraceHound: fixes must be on or off.");
    return 1;
  }
  if (!["true", "false"].includes(dryRun)) {
    deps.log("TraceHound: dry-run must be true or false.");
    return 1;
  }
  // The job summary reports whatever usage was recorded, however the review ends.
  const log = deps.log;
  deps = { ...deps, log: usage.recorder.logger(log) };
  const mark = await ledgerMark(usage.ledgerFile);
  let code = 1;
  try {
    const options: Options = {
      token: env.GITHUB_TOKEN,
      apiUrl: env.GITHUB_API_URL || "https://api.github.com",
      model: env.TRACEHOUND_MODEL?.trim() ?? "",
      maxComments: Number(env.TRACEHOUND_MAX_COMMENTS ?? "15"),
      dryRun: dryRun === "true",
      reviewer,
      fixes,
      contracts,
      serverUrl: env.GITHUB_SERVER_URL || "https://github.com",
      repoDir: env.TRACEHOUND_REPO_DIR ?? "",
    };
    const event = dispatch
      ? await fetchPullEvent(env.GITHUB_REPOSITORY!, Number(prNumber), options, deps)
      : JSON.parse(await readFile(env.GITHUB_EVENT_PATH!, "utf8")) as PullEvent;
    await runAction(event, options, { ...deps, ...(env.TRACEHOUND_REVIEW_FILE && { onReview: async (body: string) => {
      const footer = parseReviewFooter(body);
      if (footer) await writeFile(env.TRACEHOUND_REVIEW_FILE!, JSON.stringify(footer));
    } }) });
    code = 0;
    return code;
  } catch (error) {
    if (error instanceof MissingHeadError) {
      deps.log(error.message);
      return code;
    }
    // Do not echo exception text: HTTP or subprocess errors can contain credentials.
    deps.log("TraceHound: action failed. Check the event payload, inputs, and GitHub token permissions.");
    return code;
  } finally {
    if (env.GITHUB_STEP_SUMMARY) {
      try {
        const ledger = await ledgerSince(usage.ledgerFile, mark);
        const result = usage.recorder.outcome || (code === 0 ? (dryRun === "true" ? "dry run; review printed, not posted." : "finished.") : "failed.");
        await writeUsageSummary(env.GITHUB_STEP_SUMMARY, formatUsageSummary(usage.recorder, ledger, result));
      } catch {
        log("TraceHound: job summary could not be written.");
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.env);
}
