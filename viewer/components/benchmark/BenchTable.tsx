import { Fragment } from "react";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BENCHMARK_TABLES } from "@/lib/benchmark";
import { bestRows, byReviewer, columnHead, isSecondary, metricLabel, orderedRows, productMark, splitCell } from "@/lib/benchmark-view";
import { ReviewerMark } from "./ReviewerMark";

type T = (typeof BENCHMARK_TABLES)[number];
const PROSE = new Set(["verdict", "idea", "bar", "sentence the rule allows"]);
const prose = (header: string) => PROSE.has(header) || header.startsWith("result");

function Verdict({ text }: { text: string }) {
  const tone = /^Adopted/.test(text) ? "adopted" : /^(Loss|No gain)/.test(text) ? "loss" : /did not move|^Report only|^Inconclusive/.test(text) ? "flat" : null;
  if (!tone) return <>{text}</>;
  return <span className="verdict" data-tone={tone}>{text}</span>;
}

/** Text that may wrap only between words, never inside one ("pool-verify-v1" stays whole). */
function Words({ text }: { text: string }) {
  const words = text.split(" ").reduce<string[]>((ws, w) => (w === "·" && ws.length ? [...ws.slice(0, -1), `${ws.at(-1)} ·`] : [...ws, w]), []);
  return <>{words.map((w, i) => <Fragment key={i}>{i > 0 && " "}<span className="bt-word">{w}</span></Fragment>)}</>;
}

/** A value, with its count or interval in small grey type under it. */
function Value({ cell }: { cell: string }) {
  const { main, detail } = splitCell(cell);
  return <><span className="bt-main">{main}</span>{detail && <span className="bt-detail">{detail.startsWith("[") ? <span className="bt-word">{detail}</span> : <Words text={detail} />}</span>}</>;
}

/**
 * One report table, as a real table in the Opus page's grid: a reviewer table is turned so the
 * reviewers are columns (TraceHound's outlined in amber, the best value in each row bold, pipeline
 * stages apart on the right); the other tables keep their rows and outline the product.
 */
export function BenchTable({ t, id }: { t: T; id: string }) {
  const turned = byReviewer(t);
  // the owner keeps this table exactly as it is; only its header row is centred
  const keep = t.title.startsWith("Precision levers");
  const region = { tabIndex: 0, role: "region", "aria-label": `${t.title} table, scroll horizontally on small screens`, className: "bench-table-scroll" };
  return <section aria-labelledby={id} className="bench-section">
    <h3 id={id} className="bench-table-title">{t.title}</h3>
    <Table className="bench-table" data-turned={turned || undefined} data-keep={keep || undefined} containerProps={region}>
      <TableCaption className="sr-only">{t.title}</TableCaption>
      {turned ? <Turned t={t} /> : <Plain t={t} />}
    </Table>
    <p className="bench-note">{t.note}</p>
  </section>;
}

function Turned({ t }: { t: T }) {
  const headers = t.headers as readonly string[];
  const order = orderedRows(t);
  const all: readonly (readonly string[])[] = t.rows;
  const index = (row: readonly string[]) => all.indexOf(row);
  const ranked = order.filter((r) => !isSecondary(r[0]!));
  const ref = order.filter((r) => isSecondary(r[0]!));
  const primary = ranked.find((r) => r[0]!.startsWith("TraceHound v2"));
  const ours = (row: readonly string[]) => (row === primary ? "primary" : !isSecondary(row[0]!) && columnHead(row[0]!).name.startsWith("TraceHound") ? "tint" : undefined);
  const columns = (render: (row: readonly string[]) => React.ReactNode, gap: React.ReactNode) => [...ranked.map(render), ...(ref.length ? [gap] : []), ...ref.map(render)];
  return <>
    <TableHeader>
      <TableRow className="hover:bg-transparent">
        <TableCell className="bt-corner" />
        {columns((row) => {
          const head = columnHead(row[0]!);
          return <TableHead key={row[0]} scope="col" data-ours={ours(row)} data-ref={isSecondary(row[0]!) || undefined} title={row[0]}>
            <span className="bt-head"><ReviewerMark name={row[0]!} /><span className="bt-name">{head.name}</span></span>
            {head.sub && <span className="bt-detail"><Words text={head.sub} /></span>}
          </TableHead>;
        }, <TableCell key="gap" className="bt-gap" aria-hidden />)}
      </TableRow>
    </TableHeader>
    <TableBody>
      {headers.slice(1).map((h, k) => {
        const c = k + 1;
        const best = bestRows(t, h);
        const [label, sub] = metricLabel(h);
        return <TableRow key={h} className="hover:bg-transparent">
          <TableHead scope="row" className="bt-label" title={h}><span className="bt-name">{label}</span>{sub && <span className="bt-detail"><Words text={sub} /></span>}</TableHead>
          {columns((row) => <TableCell key={row[0]} data-ours={ours(row)} data-ref={isSecondary(row[0]!) || undefined} data-best={best.has(index(row)) || undefined} data-prose={prose(h) || undefined}>
            {prose(h) ? row[c] : <Value cell={row[c]!} />}
          </TableCell>, <TableCell key="gap" className="bt-gap" aria-hidden />)}
        </TableRow>;
      })}
    </TableBody>
  </>;
}

function Plain({ t }: { t: T }) {
  const headers = t.headers as readonly string[];
  const mark = productMark(t);
  return <>
    <TableHeader>
      <TableRow className="hover:bg-transparent">{headers.map((h, c) => <TableHead key={h} scope="col" data-ours={c === mark.col ? "primary" : undefined}>{h}</TableHead>)}</TableRow>
    </TableHeader>
    <TableBody>
      {orderedRows(t).map((row, i) => <TableRow key={`${i}-${row[0]}`} className="hover:bg-transparent" data-ours={i === mark.row ? "primary" : undefined} data-tint={mark.tint.has(i) || undefined}>
        {row.map((cell, c) => c === 0
          ? <TableHead key={c} scope="row" className="bt-label" data-ours={c === mark.col ? "primary" : undefined}><Value cell={cell} /></TableHead>
          : <TableCell key={c} data-ours={c === mark.col ? "primary" : undefined} data-prose={prose(headers[c]!) || undefined}>{headers[c] === "verdict" ? <Verdict text={cell} /> : prose(headers[c]!) ? cell : <Value cell={cell} />}</TableCell>)}
      </TableRow>)}
    </TableBody>
  </>;
}
