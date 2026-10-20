import { execFile, spawnSync } from "node:child_process";
import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { cleanGitEnv } from "../../analyzer/src/git-env.ts";
import { runContracts, type ContractsExecute } from "../src/contracts.ts";

it("runs the real checker at the merge base, finds an untouched consumer, and never executes target scripts", async () => {
  const repo = await mkdtemp(path.join(tmpdir(), "tracehound-contracts-local-"));
  const env = { ...cleanGitEnv(), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
  const git = (...args: string[]) => {
    const result = spawnSync("git", ["-C", repo, ...args], { env, encoding: "utf8" });
    expect(result.status, "local fixture git failed").toBe(0);
    return result.stdout.trim();
  };
  try {
    git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    await mkdir(path.join(repo, "src"));
    await writeFile(path.join(repo, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, include: ["src/**/*.ts"] }));
    await writeFile(path.join(repo, "package.json"), JSON.stringify({ scripts: { preinstall: "touch TARGET_SCRIPT_RAN",
      typecheck: "touch TARGET_SCRIPT_RAN", test: "touch TARGET_SCRIPT_RAN" } }));
    await writeFile(path.join(repo, "src/api.ts"), 'throw new Error("TARGET_MODULE_EXECUTED");\nexport function oldName() { return 1; }\n');
    await writeFile(path.join(repo, "src/consumer.ts"), 'import { oldName } from "./api";\nexport const result = oldName();\n');
    git("add", "tsconfig.json", "package.json", "src/api.ts", "src/consumer.ts"); git("commit", "-qm", "base");
    const fork = git("rev-parse", "HEAD");
    git("switch", "-qc", "feature");
    await writeFile(path.join(repo, "src/api.ts"), 'throw new Error("TARGET_MODULE_EXECUTED");\nexport function newName() { return 1; }\n');
    git("add", "src/api.ts"); git("commit", "-qm", "rename export");
    const head = git("rev-parse", "HEAD");
    git("switch", "-qc", "advanced-base", fork);
    await writeFile(path.join(repo, "base-only.txt"), "base branch advanced\n");
    git("add", "base-only.txt"); git("commit", "-qm", "advance base tip");
    const baseTip = git("rev-parse", "HEAD"); git("switch", "-q", "feature");
    const calls: string[][] = [];
    const execute = promisify(execFile);
    const exec: ContractsExecute = async (file, args, options) => { calls.push([file, ...args]); return execute(file, args, options); };
    const result = await runContracts(repo, baseTip, head, env, exec);
    expect(result.status).toBe("ok");
    expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ path: "src/consumer.ts", line: 1 })]));
    const command = calls.find(([, , name]) => name === "contracts")!;
    expect(command[command.indexOf("--base") + 1]).toBe(fork);
    expect(git("diff", "--name-only", fork, head)).toBe("src/api.ts");
    await expect(access(path.join(repo, "TARGET_SCRIPT_RAN"))).rejects.toThrow();
    expect(calls.every(([file]) => file === "git" || file === process.execPath)).toBe(true);
    expect(git("status", "--porcelain")).toBe("");
  } finally { await rm(repo, { recursive: true, force: true }); }
}, 30_000);
