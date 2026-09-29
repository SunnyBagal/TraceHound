import type { Node } from "ts-morph";
import type { Evidence, ExtractorName } from "../schema.ts";

const CONTEXT_LINES = 2;
const MAX_SNIPPET_LINES = 14;

export interface EvidenceInput {
  file: string; // repo-relative
  startLine: number;
  endLine: number;
  extractor: ExtractorName;
  confidence: number;
  detail: string;
  symbol?: string;
}

/** Collects evidence for one analysis run. Ids are deterministic: file#Lstart-end:extractor[:n]. */
export class EvidenceStore {
  #items = new Map<string, Evidence>();
  #fileLines = new Map<string, string[]>();

  /** Register file text so snippets can be cut from it. */
  setFileText(file: string, text: string): void {
    this.#fileLines.set(file, text.split(/\r?\n/));
  }

  add(input: EvidenceInput): string {
    const base = `${input.file}#L${input.startLine}-${input.endLine}:${input.extractor}`;
    let id = base;
    for (let n = 2; this.#items.has(id); n++) id = `${base}:${n}`;
    this.#items.set(id, {
      id,
      file: input.file,
      symbol: input.symbol,
      range: { startLine: input.startLine, endLine: input.endLine },
      extractor: input.extractor,
      confidence: input.confidence,
      detail: input.detail,
      snippet: this.#snippet(input.file, input.startLine, input.endLine),
    });
    return id;
  }

  /** Evidence spanning a ts-morph node. */
  addNode(node: Node, file: string, rest: Omit<EvidenceInput, "file" | "startLine" | "endLine">): string {
    return this.add({ ...rest, file, startLine: node.getStartLineNumber(), endLine: node.getEndLineNumber() });
  }

  get(id: string): Evidence | undefined {
    return this.#items.get(id);
  }

  all(): Evidence[] {
    return [...this.#items.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  #snippet(file: string, startLine: number, endLine: number): Evidence["snippet"] {
    const lines = this.#fileLines.get(file);
    if (!lines) return { startLine, lines: [] };
    const from = Math.max(1, startLine - CONTEXT_LINES);
    const to = Math.min(lines.length, endLine + CONTEXT_LINES, from + MAX_SNIPPET_LINES - 1);
    return { startLine: from, lines: lines.slice(from - 1, to) };
  }
}

export interface ExtractContext {
  /** Repo-relative path of a ts-morph file path. */
  rel(absPath: string): string;
  evidence: EvidenceStore;
}
