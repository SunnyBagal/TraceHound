import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { cleanGitEnv } from "../../analyzer/src/git-env.ts";
import { Budget, capsFromEnv } from "../../analyzer/src/llm/budget.ts";
import { TokenFactoryClient, type ChatRequest } from "../../analyzer/src/llm/client.ts";
import { SpendLedger } from "../../analyzer/src/llm/ledger.ts";
import { loadPriceTable } from "../../analyzer/src/llm/prices.ts";
import { newSideLines, parseDiff } from "../../analyzer/src/review/diff.ts";
import { REASONING_OFF } from "../../analyzer/src/review/review.ts";
import type { Finding } from "./action.ts";
import type { Execute } from "./pipeline.ts";
import { FIX_SYSTEM_PROMPT } from "./fix-prompt.ts";

export const FIX_MODEL = "nvidia/nemotron-3-super-120b-a12b";
export interface Fix { startLine: number; endLine: number; replacement: string; original: string }
export interface FixCounts { attempted: number; valid: number; rejected: number }
export interface FixOutput { suggestions: (Fix | null)[]; counts: FixCounts }
export type FixClient = { chat(request: ChatRequest, meta: { purpose: string }): Promise<{ content: string }> };
const root = path.resolve(import.meta.dirname, "../../..");
const execute = promisify(execFile);

export function createFixClient(): FixClient {
  const ledger = new SpendLedger(path.join(root, ".tracehound/spend.jsonl"));
  return new TokenFactoryClient({
    apiKey: process.env.NEBIUS_API_KEY ?? "",
    prices: loadPriceTable(path.join(root, "config/prices.json")),
    budget: new Budget(capsFromEnv(), ledger.totalUSD()), ledger,
    timeoutMs: 120_000,
  });
}

export function validateFix(value: unknown, current: string[], allowed: Set<number>): Fix | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const f = value as Record<string, unknown>;
  if (Object.keys(f).sort().join(",") !== "endLine,explanation,replacement,startLine"
    || typeof f.explanation !== "string" || !f.explanation.trim()
    || typeof f.startLine !== "number" || !Number.isSafeInteger(f.startLine) || f.startLine < 1
    || typeof f.endLine !== "number" || !Number.isSafeInteger(f.endLine)
    || f.endLine < f.startLine || f.endLine > f.startLine + 14 || f.endLine > current.length
    || typeof f.replacement !== "string" || f.replacement.split("\n").length > 15
    // A nested fence could escape GitHub's suggestion block.
    || /`{3,}/.test(f.replacement)) return null;
  for (let line = f.startLine; line <= f.endLine; line++) if (!allowed.has(line)) return null;
  const original = current.slice(f.startLine - 1, f.endLine).join("\n");
  if (f.replacement === original) return null;
  return { startLine: f.startLine, endLine: f.endLine, replacement: f.replacement, original };
}

/** Findings are already capped. All effects can be replaced by offline test doubles. */
export async function runFixes(
  findings: Finding[], diff: string, repo: string, head: string,
  client: FixClient, exec: Execute = execute,
): Promise<FixOutput> {
  const files = parseDiff(diff);
  const suggestions: (Fix | null)[] = findings.map(() => null);
  let next = 0;
  let attempted = 0;
  const worker = async () => {
    while (next < findings.length) {
      const index = next++;
      const finding = findings[index]!;
      attempted++;
      try {
        if (!repo || !/^[a-f0-9]{7,40}$/i.test(head)) continue;
        const file = files.find(file => file.newPath === finding.path);
        const result = await exec("git", ["-C", repo, "show", `${head}:${finding.path}`], {
          cwd: root, env: cleanGitEnv(), maxBuffer: 4 * 1024 * 1024,
        }) as { stdout: string };
        const current = result.stdout.split("\n");
        if (current.at(-1) === "") current.pop();
        const center = finding.line ?? file?.hunks[0]?.newStart ?? 1;
        const first = Math.max(1, center - 40);
        const window = current.slice(first - 1, center + 40)
          .map((line, i) => `${first + i}: ${line}`).join("\n");
        const request: ChatRequest = {
          model: FIX_MODEL, temperature: 0, max_tokens: 4096,
          ...REASONING_OFF,
          messages: [{ role: "system", content: FIX_SYSTEM_PROMPT }, { role: "user", content: JSON.stringify({
            finding, head, file: window, diff: file?.hunks.map(hunk => hunk.text).join("") ?? "",
          }) }],
        };
        for (let attempt = 0; attempt < 2; attempt++) {
          const response = await client.chat(request, { purpose: "action-fix" });
          let value: unknown;
          try { value = JSON.parse(response.content); } catch {
            if (!attempt) {
              request.messages.push({ role: "user", content: "Your response was invalid JSON. Return strict JSON only in the specified schema." });
              continue;
            }
            break;
          }
          suggestions[index] = validateFix(value, current, file ? newSideLines(file) : new Set());
          break;
        }
      } catch {
        // Fix failures must never suppress the kept finding or expose model/subprocess errors.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, findings.length) }, worker));
  const valid = suggestions.filter(Boolean).length;
  return { suggestions, counts: { attempted, valid, rejected: attempted - valid } };
}
