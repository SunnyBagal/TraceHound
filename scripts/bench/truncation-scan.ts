// Truncation scan (docs/post-freeze-fixes.md): counts finish_reason over the cached response bodies
// of one model, and splits the "length" ones into empty content, content that today's strict
// parsers reject, and content they accept (as a reviewer or a verifier reply). Counts only: no
// reply text is printed, nothing is written, no network. The model is read from each body's
// `model` field; bodies for other models and unreadable files are counted and skipped.
//   node scripts/bench/truncation-scan.ts --cache <dir> --model <id>
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parseReviewReply } from "../../packages/analyzer/src/review/review.ts";
import { parseVerdictReply } from "../../packages/analyzer/src/review/verify-ctx.ts";

export const NOTE = [
  "note: packages/analyzer/src/llm/client.ts never caches a reply with empty content (the cache?.put guard,",
  "client.ts:296 on main), so empty-content truncations are undercounted here; the spend ledger's count",
  "of calls at 32,000 output tokens is the other half.",
];

interface Body { model?: string; choices?: { finish_reason?: string | null; message?: { content?: string | null } }[] }

export interface ScanCounts {
  total: number;
  otherModels: number;
  unreadable: number;
  byFinishReason: Record<string, number>;
  length: { contentEmpty: number; unparseable: number; parseable: number };
}

export function scan(dir: string, model: string): ScanCounts {
  const counts: ScanCounts = { total: 0, otherModels: 0, unreadable: 0, byFinishReason: {}, length: { contentEmpty: 0, unparseable: 0, parseable: 0 } };
  for (const name of readdirSync(dir).filter(n => n.endsWith(".json")).sort()) {
    let body: Body;
    try {
      body = JSON.parse(readFileSync(join(dir, name), "utf8")) as Body;
    } catch {
      counts.unreadable++;
      continue;
    }
    if (body?.model !== model) {
      counts.otherModels++;
      continue;
    }
    counts.total++;
    const choice = body.choices?.[0];
    const reason = choice?.finish_reason ?? "(none)";
    counts.byFinishReason[reason] = (counts.byFinishReason[reason] ?? 0) + 1;
    if (reason !== "length") continue;
    const content = choice?.message?.content ?? "";
    if (!content.trim()) counts.length.contentEmpty++;
    else if (parseReviewReply(content).ok || parseVerdictReply(content).ok) counts.length.parseable++;
    else counts.length.unparseable++;
  }
  return counts;
}

export function format(c: ScanCounts, model: string): string[] {
  return [
    ...NOTE,
    `model ${model}: ${c.total} cached responses (${c.otherModels} for other models, ${c.unreadable} unreadable, skipped)`,
    ...Object.entries(c.byFinishReason).sort(([a], [b]) => a.localeCompare(b)).map(([reason, n]) => `finish_reason ${reason}: ${n}`),
    `length: content empty ${c.length.contentEmpty}, content present but unparseable ${c.length.unparseable}, parseable ${c.length.parseable}`,
  ];
}

export function main(argv: string[], log: (line: string) => void = console.log): number {
  const { values } = parseArgs({ args: argv, options: { cache: { type: "string" }, model: { type: "string" } } });
  if (!values.cache || !values.model) {
    log("usage: node scripts/bench/truncation-scan.ts --cache <dir> --model <id>");
    return 2;
  }
  if (!existsSync(values.cache) || !statSync(values.cache).isDirectory()) {
    log(`no cache directory at ${values.cache}`);
    return 2;
  }
  for (const line of format(scan(values.cache, values.model), values.model)) log(line);
  return 0;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
