import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BENCHMARK_TABLES } from "@/lib/benchmark";
import { isSecondary, orderedRows, reviewerOf } from "@/lib/benchmark-view";
import { ReviewerMark } from "./ReviewerMark";

type T = (typeof BENCHMARK_TABLES)[number];
const PROSE = new Set(["verdict", "idea", "bar", "sentence the rule allows"]);
const prose = (header: string) => PROSE.has(header) || header.startsWith("result");

function Verdict({ text }: { text: string }) {
  const tone = /^Adopted/.test(text) ? "adopted" : /^(Loss|No gain)/.test(text) ? "loss" : /did not move|^Report only|^Inconclusive/.test(text) ? "flat" : null;
  if (!tone) return <>{text}</>;
  return <span className="verdict" data-tone={tone}>{text}</span>;
}

/** One report table, as a real table: rows ranked where the page ranks them, logos on reviewer rows, the report's note as fine print. */
export function BenchTable({ t, id }: { t: T; id: string }) {
  const headers = t.headers as readonly string[];
  const rows = orderedRows(t);
  const firstSecondary = rows.findIndex((r) => isSecondary(r[0]!));
  return <section aria-labelledby={id} className="bench-section">
    <h2 id={id} className="bench-table-title">{t.title}</h2>
    <Table className="bench-table" containerProps={{ tabIndex: 0, role: "region", "aria-label": `${t.title} table, scroll horizontally on small screens`, className: "bench-table-scroll" }}>
      <TableCaption className="sr-only">{t.title}</TableCaption>
      <TableHeader><TableRow className="hover:bg-transparent">{headers.map((h) => <TableHead key={h} scope="col">{h}</TableHead>)}</TableRow></TableHeader>
      <TableBody>
        {rows.map((row, i) => {
          const ours = row[0]!.startsWith("TraceHound v2");
          return <TableRow key={`${i}-${row[0]}`} data-ours={ours || undefined} data-secondary={isSecondary(row[0]!) || undefined} data-break={i === firstSecondary || undefined}>
            {row.map((cell, c) => c === 0
              ? <TableHead key={c} scope="row" className="bench-row-head">{reviewerOf(cell) ? <span className="bench-who"><ReviewerMark name={cell} />{cell}</span> : cell}</TableHead>
              : <TableCell key={c} data-prose={prose(headers[c]!) || undefined}>{headers[c] === "verdict" ? <Verdict text={cell} /> : cell}</TableCell>)}
          </TableRow>;
        })}
      </TableBody>
    </Table>
    <p className="bench-note">{t.note}</p>
  </section>;
}
