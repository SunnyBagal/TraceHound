import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { runAction, type Dependencies, type PullEvent } from "./action.ts";
import { runReviewer } from "./reviewer.ts";
import { checkRepoHead, MissingHeadError, runPipeline } from "./pipeline.ts";
import { createFixClient, runFixes } from "./fix.ts";
import { parseReviewFooter } from "./data.ts";

export async function main(
  env: NodeJS.ProcessEnv,
  deps: Dependencies = { fetch, runReviewer, checkRepoHead,
    runFixes: (...args) => runFixes(...args, createFixClient()),
    runPipeline: (...args) => runPipeline(...args, console.log), log: console.log },
): Promise<number> {
  const reviewer = env.TRACEHOUND_REVIEWER ?? "pool-verify-v1";
  if (reviewer !== "pool-verify-v1" && reviewer !== "review-diff-v1") {
    deps.log("TraceHound: reviewer must be pool-verify-v1 or review-diff-v1.");
    return 1;
  }
  if (!env.NEBIUS_API_KEY?.trim()) {
    deps.log("TraceHound: NEBIUS_API_KEY is missing. Set the required nebius-api-key action input.");
    return 1;
  }
  if (env.GITHUB_EVENT_NAME !== "pull_request") {
    deps.log("TraceHound: only pull_request events are supported; skipped.");
    return 0;
  }
  if (!env.GITHUB_TOKEN || !env.GITHUB_EVENT_PATH) {
    deps.log("TraceHound: GITHUB_TOKEN and GITHUB_EVENT_PATH are required.");
    return 1;
  }
  const dryRun = env.TRACEHOUND_DRY_RUN ?? "false";
  const fixes = env.TRACEHOUND_FIXES ?? "on";
  if (fixes !== "on" && fixes !== "off") {
    deps.log("TraceHound: fixes must be on or off.");
    return 1;
  }
  if (!["true", "false"].includes(dryRun)) {
    deps.log("TraceHound: dry-run must be true or false.");
    return 1;
  }
  try {
    const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8")) as PullEvent;
    await runAction(event, {
      token: env.GITHUB_TOKEN,
      apiUrl: env.GITHUB_API_URL || "https://api.github.com",
      model: env.TRACEHOUND_MODEL?.trim() ?? "",
      maxComments: Number(env.TRACEHOUND_MAX_COMMENTS ?? "15"),
      dryRun: dryRun === "true",
      reviewer,
      fixes,
      repoDir: env.TRACEHOUND_REPO_DIR ?? "",
    }, { ...deps, ...(env.TRACEHOUND_REVIEW_FILE && { onReview: async (body: string) => {
      const footer = parseReviewFooter(body);
      if (footer) await writeFile(env.TRACEHOUND_REVIEW_FILE!, JSON.stringify(footer));
    } }) });
    return 0;
  } catch (error) {
    if (error instanceof MissingHeadError) {
      deps.log(error.message);
      return 1;
    }
    // Do not echo exception text: HTTP or subprocess errors can contain credentials.
    deps.log("TraceHound: action failed. Check the event payload, inputs, and GitHub token permissions.");
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.env);
}
