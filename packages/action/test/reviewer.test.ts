import { execFile, type ChildProcess } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
import { runReviewer } from "../src/reviewer.ts";

afterEach(() => vi.resetAllMocks());
const input = { title: "Test PR", body: "Test body", number: 1, diff: "synthetic diff" };
const result = { comments: [], review: { model: "fake-nemotron" } };

it.each(["", "explicit-nemotron"])("hands JSON to the reviewer CLI with model %j and cleans temp files", async model => {
  let directory = "";
  vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
    const [executable, argv, options] = args as [string, string[], { cwd: string }];
    const callback = args.at(-1) as (error: Error | null, stdout: string, stderr: string) => void;
    const inputPath = argv[argv.indexOf("--pr") + 1]!;
    const outputPath = argv[argv.indexOf("--out") + 1]!;
    directory = path.dirname(inputPath);
    expect(executable).toBe(process.execPath);
    expect(argv.slice(0, 3)).toEqual([
      path.join(options.cwd, "packages/analyzer/src/bin.ts"), "review", "--pr",
    ]);
    expect(argv.slice(6)).toEqual(model ? ["--model", model] : []);
    void (async () => {
      expect(JSON.parse(await readFile(inputPath, "utf8"))).toEqual(input);
      await writeFile(outputPath, JSON.stringify(result));
    })().then(() => callback(null, "ignored stdout", "ignored stderr"), error => callback(error, "", ""));
    return {} as ChildProcess;
  });
  expect(await runReviewer(input, model)).toEqual(result);
  await expect(access(directory)).rejects.toMatchObject({ code: "ENOENT" });
});

it("cleans temporary input when the reviewer process fails", async () => {
  let directory = "";
  vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
    const argv = args[1] as string[];
    directory = path.dirname(argv[argv.indexOf("--pr") + 1]!);
    const callback = args.at(-1) as (error: Error) => void;
    callback(new Error("fake subprocess failure"));
    return {} as ChildProcess;
  });
  await expect(runReviewer(input, "")).rejects.toThrow("fake subprocess failure");
  await expect(access(directory)).rejects.toMatchObject({ code: "ENOENT" });
});
