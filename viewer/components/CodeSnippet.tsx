import type { Evidence } from "@/lib/types";
import { highlightCode } from "@/lib/highlight";

/** Plain mono snippet with line numbers; the evidence range is highlighted. */
export function CodeSnippet({ evidence }: { evidence: Evidence }) {
  return <CodeBlock lines={evidence.snippet.lines} startLine={evidence.snippet.startLine} range={evidence.range} />;
}

/** Shared code renderer for snapshot evidence and public review suggestion diffs. */
export function CodeBlock({ lines, startLine = 1, range, marker }: { lines: string[]; startLine?: number; range?: { startLine: number; endLine: number }; marker?: "+" | "-" }) {
  if (!lines.length) return null;
  return (
    <pre className="max-h-[520px] overflow-auto rounded-lg border border-line bg-bg py-3 font-mono text-sm leading-[1.7]" data-testid="code-snippet">
      {lines.map((line, i) => {
        const n = startLine + i;
        const hit = range && n >= range.startLine && n <= range.endLine;
        return (
          <div key={n} className={marker === "+" ? "bg-diff-added/10" : marker === "-" ? "bg-diff-removed/10" : hit ? "bg-accent-soft" : undefined}>
            <span className={`inline-block w-10 select-none pr-3 text-right ${hit ? "text-accent" : "text-faint"}`}>{n}</span>
            {marker && <span aria-hidden className={`mr-2 select-none ${marker === "+" ? "text-diff-added" : "text-diff-removed"}`}>{marker}</span>}
            <span className={hit ? "text-text" : "text-muted"}>{line ? highlightCode(line).map((token, index) => <span key={index} className={{ plain: "", comment: "text-faint", string: "text-diff-added", keyword: "text-highlight", number: "text-accent" }[token.kind]}>{token.text}</span>) : " "}</span>
          </div>
        );
      })}
    </pre>
  );
}
