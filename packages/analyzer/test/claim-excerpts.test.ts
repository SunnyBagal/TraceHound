// A claim's optional `excerpts` (decision 052): shown to the agent only when present. A claim
// without them gives the agent byte-identical messages to main before 052 (pinned on an existing
// eval/claims file), and the run ends the same way.
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ChatRequest, ChatResult, ToolCall } from "../src/llm/client.ts";
import type { ExecResult, SandboxHandle, SandboxProvider } from "../src/harness/provider.ts";
import { RepairLoopAgent } from "../src/harness/loop.ts";
import { repoStateCommand, SQUASH_HISTORY } from "../src/harness/run.ts";
import { claimText, loadClaim, REPRO_PROMPT_FILE, runReproduce } from "../src/harness/reproduce.ts";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../..");
const EXISTING_CLAIM = path.join(WORKSPACE_ROOT, "eval/claims/recall-dev-chat-recent-control.json");

const ok = (stdout = ""): ExecResult => ({ exitCode: 0, stdout, stderr: "", durationMs: 1, timedOut: false });
class FakeProvider implements SandboxProvider {
  readonly name = "fake";
  async create(): Promise<SandboxHandle> {
    return { id: "fake", provider: this.name };
  }
  async disableNetwork() {}
  async exec(_h: SandboxHandle, cmd: string): Promise<ExecResult> {
    if (cmd === SQUASH_HISTORY) return ok(`${"b".repeat(40)}\n`);
    if (cmd === repoStateCommand("b".repeat(40))) return ok(`${"0".repeat(64)}\n0\n0\n`);
    if (cmd.startsWith("git ls-tree")) return ok("package.json\0src/cart.ts\0");
    if (cmd.includes("if [ -f node_modules/typescript/bin/tsc ]")) return ok("image\nVersion 5.9.3\n");
    if (cmd.startsWith("curl")) return { ...ok(), exitCode: 1 }; // the network-off probe
    return ok();
  }
  async writeFile() {}
  async readFile() {
    return "";
  }
  async destroy() {}
}
const finishCall: ToolCall = { id: "c1", type: "function", function: { name: "finish", arguments: JSON.stringify({ summary: "x" }) } };
const finishing = (): ChatResult => ({ content: "", cached: false, latencyMs: 1, inputTokens: 10, outputTokens: 1, costUSD: 0, toolCalls: [finishCall], finishReason: "tool_calls" });
const sha = (s: unknown) => createHash("sha256").update(typeof s === "string" ? s : JSON.stringify(s)).digest("hex");

async function firstRequest(claimFile: string) {
  const requests: ChatRequest[] = [];
  const llm = { chat: async (req: ChatRequest) => (requests.push(structuredClone(req)), finishing()) };
  const record = await runReproduce({ claim: loadClaim(claimFile), agent: new RepairLoopAgent({ promptFile: REPRO_PROMPT_FILE }), provider: new FakeProvider(), image: "img", llm });
  return { request: requests[0]!, record };
}

describe("a claim without excerpts is shown to the agent exactly as before decision 052", () => {
  it("eval/claims/recall-dev-chat-recent-control.json: issue text, first request and run outcome pinned at main 075d645", async () => {
    const claim = loadClaim(EXISTING_CLAIM);
    expect("excerpts" in claim.spec).toBe(false);
    expect(sha(claimText(claim.spec))).toBe("32b32376776dcded47facf08c0c754d51e526e842ee65ff0e9655738f7f2c7ae");
    const { request, record } = await firstRequest(EXISTING_CLAIM);
    expect(sha(request.messages)).toBe("2d1e47e60455f9b2727b4b9f0d1be16520c8452b04d55f77ad5a7de7bae81be3");
    expect(sha({ ...request, messages: undefined })).toBe("dadc92793344a1b01e9a519021d76ff51607e3a5232f83175d2498c6bc15bb19");
    expect(record).toMatchObject({ state: "NOT_REPRODUCED", reason: "no qualifying file: the agent added no file", endReason: "finish" });
  });
});

describe("a claim with excerpts", () => {
  const withExcerpts = (excerpts: unknown) => {
    const spec = JSON.parse(readFileSync(EXISTING_CLAIM, "utf8"));
    const dir = mkdtempSync(path.join(tmpdir(), "th-claim-"));
    const file = path.join(dir, "claim.json");
    writeFileSync(file, JSON.stringify({ ...spec, profile: path.resolve(path.dirname(EXISTING_CLAIM), spec.profile), excerpts }));
    return file;
  };
  it("shows them after the claim text, each with its file and line range; nothing else in the issue changes", async () => {
    const file = withExcerpts([{ file: "src/a.ts", startLine: 3, endLine: 4, lines: ["const x = 1;", "export { x };"] }]);
    const before = claimText(loadClaim(EXISTING_CLAIM).spec);
    const text = claimText(loadClaim(file).spec);
    expect(text).toBe(`${before}\n\nCode excerpts:\n\nsrc/a.ts:3-4\n\`\`\`ts\nconst x = 1;\nexport { x };\n\`\`\``);
    const { request } = await firstRequest(file);
    expect(request.messages[1]!.content).toContain(text);
  });
  it("rejects an empty list, unknown keys, and lines that don't cover the range", () => {
    expect(() => loadClaim(withExcerpts([]))).toThrow();
    expect(() => loadClaim(withExcerpts([{ file: "a.ts", startLine: 1, endLine: 1, lines: ["x"], why: "y" }]))).toThrow(/Unrecognized key/);
    expect(() => loadClaim(withExcerpts([{ file: "a.ts", startLine: 1, endLine: 2, lines: ["x"] }]))).toThrow(/cover startLine/);
  });
});
