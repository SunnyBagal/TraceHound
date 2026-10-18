// contracts-v1, findings: deterministic review candidates from the typed and keyed stages. One per
// new tsc diagnostic in a file the pull request didn't edit, and one per stale use of a removed or
// renamed key. Each cites the change and the stale use with the exact line text. The candidate type
// is local to contracts/; a later integration job unifies it with the reviewer's findings.
import type { KeyedContract, KeyedResult } from "./keyed.ts";
import type { KeyKind } from "./shapes.ts";
import type { TypedDiagnostic, TypedResult } from "./typed.ts";

export interface ContractEvidence {
  path: string;
  line: number;
  quote: string; // the exact line text
  side: "base" | "head"; // which revision `line` refers to
}

export interface ContractCandidate {
  path: string;
  line: number;
  body: string; // What breaks / Where / Evidence, three sentences
  source: "tsc" | "contract";
  evidence: [change: ContractEvidence, staleUse: ContractEvidence];
  severity: "high";
  category: "contract";
}

const KIND_LABEL: Record<KeyKind, string> = { route: "HTTP route", queue: "queue name", "redis-key": "Redis key", env: "env var", event: "event name" };
const QUOTE_CHARS = 120;
/** Code inside a sentence: trimmed, capped, backticks swapped so the span stays one code span. */
const code = (text: string) => {
  const t = text.trim().replace(/`/g, "'");
  return "`" + (t.length > QUOTE_CHARS ? t.slice(0, QUOTE_CHARS - 1) + "…" : t) + "`";
};
/** A compiler message as one clause: its own sentence breaks become semicolons. */
const clause = (message: string) => message.trim().replace(/[.?!]+$/, "").replace(/[.?!]+\s+/g, "; ");
const at = (e: ContractEvidence) => `${e.path}:${e.line}${e.side === "base" ? " (base)" : ""}`;

export function tscCandidate(d: TypedDiagnostic): ContractCandidate | undefined {
  if (!d.cause) return undefined;
  const change: ContractEvidence = { path: d.cause.path, line: d.cause.line, quote: d.cause.text, side: d.cause.side };
  const use: ContractEvidence = { path: d.path, line: d.line, quote: d.text, side: "head" };
  return {
    path: d.path,
    line: d.line,
    body: [`What breaks: TS${d.code} ${clause(d.message)}.`, `Where: ${d.path}:${d.line}, which this pull request did not edit.`, `Evidence: the change at ${at(change)} ${code(change.quote)}; the use at ${at(use)} ${code(use.quote)}.`].join(" "),
    source: "tsc",
    evidence: [change, use],
    severity: "high",
    category: "contract",
  };
}

export function contractCandidates(k: KeyedContract): ContractCandidate[] {
  const label = k.prefix ? `${KIND_LABEL[k.kind]} prefix` : KIND_LABEL[k.kind];
  const what = k.after !== undefined ? `renamed to "${k.after}"` : "removed";
  const change: ContractEvidence = { path: k.changedAt.path, line: k.changedAt.line, quote: k.changedAt.text, side: "base" };
  return k.staleUses.map((u) => {
    const use: ContractEvidence = { path: u.path, line: u.line, quote: u.text, side: "head" };
    return {
      path: u.path,
      line: u.line,
      body: [
        `What breaks: ${u.path} still uses the ${label} "${k.before}", which this pull request ${what} in ${k.changedAt.path}.`,
        `Where: ${u.path}:${u.line}, which this pull request did not edit.`,
        `Evidence: the change at ${at(change)} ${code(change.quote)}; the stale use at ${at(use)} ${code(use.quote)}.`,
      ].join(" "),
      source: "contract",
      evidence: [change, use],
      severity: "high",
      category: "contract",
    };
  });
}

export function buildFindings(typed: TypedResult, keyed: KeyedResult): ContractCandidate[] {
  const tsc = "skipped" in typed ? [] : typed.uneditedFiles.flatMap((d) => tscCandidate(d) ?? []);
  const contract = keyed.keys.flatMap(contractCandidates);
  return [...tsc, ...contract].sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.source.localeCompare(b.source));
}
