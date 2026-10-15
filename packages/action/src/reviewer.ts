import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ReviewerInput } from "./action.ts";

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../../..");

export async function runReviewer(input: ReviewerInput, model: string): Promise<unknown> {
  const directory = await mkdtemp(path.join(tmpdir(), "tracehound-review-"));
  try {
    const inputPath = path.join(directory, "input.json");
    const outputPath = path.join(directory, "output.json");
    await writeFile(inputPath, JSON.stringify(input), { mode: 0o600 });
    await exec(process.execPath, [
      path.join(root, "packages/analyzer/src/bin.ts"), "review",
      "--pr", inputPath, "--out", outputPath,
      ...(model ? ["--model", model] : []),
    ], { cwd: root, env: process.env, maxBuffer: 4 * 1024 * 1024 });
    return JSON.parse(await readFile(outputPath, "utf8"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
