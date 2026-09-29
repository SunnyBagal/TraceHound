import type { Evidence } from "@/lib/types";

/** Plain mono snippet with line numbers; the evidence range is highlighted. */
export function CodeSnippet({ evidence }: { evidence: Evidence }) {
  const { snippet, range } = evidence;
  if (!snippet.lines.length) return null;
  return (
    <pre className="overflow-x-auto rounded-lg border border-line bg-bg py-2 font-mono text-[11px] leading-[1.55]">
      {snippet.lines.map((line, i) => {
        const n = snippet.startLine + i;
        const hit = n >= range.startLine && n <= range.endLine;
        return (
          <div key={n} className={hit ? "bg-accent-soft" : undefined}>
            <span className={`inline-block w-10 select-none pr-3 text-right ${hit ? "text-accent" : "text-faint"}`}>{n}</span>
            <span className={hit ? "text-text" : "text-muted"}>{line || " "}</span>
          </div>
        );
      })}
    </pre>
  );
}
