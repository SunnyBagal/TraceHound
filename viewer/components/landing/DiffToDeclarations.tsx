import { ADDED_EDGE, CHANGE_COMPONENTS, COMMIT, COMMIT_DECLARATIONS, COMMIT_FILES, COMMIT_LINES, DECLARATIONS, fmt } from "@/lib/landing";

/**
 * Recall commit 7943212 in four beats, with a counter on top:
 *   1. the pull request: its 15 files with their +/- counts ("2,040 lines · 15 files");
 *   2. the 11 files with no declaration are struck out (bench/ is ignored by Recall's config, the
 *      other two are not TypeScript): "312 lines · 4 files";
 *   3. they drop away, and the 4 files left open into the 8 declarations they changed;
 *   4. the declarations' components frame them, and the one new edge draws between two of them.
 * Pure SVG; the timing lives in the --t / --d custom properties (globals.css, .lp-anim).
 */

const at = (t: number, d?: number) => ({ "--t": `${t}ms`, ...(d ? { "--d": `${d}ms` } : {}) }) as React.CSSProperties;
const short = (path: string) => path.replace(/^recall-backend\//, "");

const ROW = 20;
const LIST_TOP = 52;
const kept = COMMIT_FILES.filter((f) => f.declarations);
const keptLines = kept.reduce((n, f) => n + f.added + f.removed, 0);

/** The final layout: per component a frame with a title row, then each file and its declarations. */
interface Line {
  kind: "file" | "decl";
  y: number;
  file: string;
  decl?: (typeof DECLARATIONS)[number];
}
// the new edge's target file first in its frame, so the edge runs upward inside one frame
const TARGET_FILE = "recall-backend/services/searchService.ts";
const FRAMES = (() => {
  let y = LIST_TOP;
  return CHANGE_COMPONENTS.map((c) => {
    const top = y;
    const lines: Line[] = [];
    let row = top + 28;
    const files = [...new Set(DECLARATIONS.filter((d) => d.component === c.id).map((d) => d.file))];
    files.sort((a, b) => Number(b === TARGET_FILE) - Number(a === TARGET_FILE));
    for (const file of files) {
      lines.push({ kind: "file", y: row, file });
      row += ROW;
      for (const decl of DECLARATIONS.filter((d) => d.file === file)) {
        lines.push({ kind: "decl", y: row, file, decl });
        row += ROW;
      }
    }
    const bottom = row + 6;
    y = bottom + 12;
    const added = DECLARATIONS.filter((d) => d.component === c.id && d.status === "added").length;
    const modified = DECLARATIONS.filter((d) => d.component === c.id && d.status === "modified").length;
    const counts = [added && `${added} added`, modified && `${modified} modified`].filter(Boolean).join(" · ");
    return { ...c, top, bottom, lines, counts };
  });
})();
const HEIGHT = Math.max(FRAMES[FRAMES.length - 1]!.bottom, LIST_TOP + COMMIT_FILES.length * ROW) + 8;
const LINES = FRAMES.flatMap((f) => f.lines);
const fileY = (file: string) => LINES.find((l) => l.kind === "file" && l.file === file)!.y;
const declY = (name: string) => LINES.find((l) => l.decl?.name === name)!.y;

/** A rounded rectangle as a path, so it can be drawn with a dash. */
const roundRect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;

// beats (ms)
const B2 = 1700;
const B3 = 3200;
const B4 = 4700;

export function DiffToDeclarations() {
  let dropped = 0;
  let movedFile = 0;
  // the new edge: from the route's row up to hybridSearch's, bulging right
  const y1 = declY(ADDED_EDGE.from) + 10;
  const y2 = declY(ADDED_EDGE.to) + 10;
  const [x1, x2, cx] = [236, 150, 326];
  const mid = { x: (x1 + 6 * cx + x2) / 8, y: (y1 + y2) / 2 };
  return (
    <svg viewBox={`0 0 360 ${HEIGHT}`} className="block h-auto w-full" aria-hidden data-testid="diff-to-declarations">
      {/* the counter: lines and files, then the lines left, then declarations */}
      <g className="lp-gone" data-anim="out" style={at(B2 - 200, 600)}>
        <text x={8} y={30} className="mono" fontSize={19} fontWeight={700} data-anim="fade" style={{ ...at(0, 400), fill: "var(--text)" }}>
          {fmt(COMMIT_LINES)} lines
          <tspan dx={10} fontSize={12} fontWeight={400} style={{ fill: "var(--faint)" }}>
            {COMMIT.files} files
          </tspan>
        </text>
      </g>
      <g className="lp-gone" data-anim="out" style={at(B3 + 300, 600)}>
        <text x={8} y={30} className="mono" fontSize={19} fontWeight={700} data-anim="fade" style={{ ...at(B2 + 500, 400), fill: "var(--text)" }}>
          {fmt(keptLines)} lines
          <tspan dx={10} fontSize={12} fontWeight={400} style={{ fill: "var(--faint)" }}>
            {kept.length} files
          </tspan>
        </text>
      </g>
      <text x={8} y={30} className="mono" fontSize={19} fontWeight={700} data-anim="fade" style={{ ...at(B3 + 900, 450), fill: "var(--accent)" }} data-testid="diff-counter">
        {COMMIT_DECLARATIONS} declarations
      </text>

      {/* beats 1–3: the pull request's files */}
      {COMMIT_FILES.map((f, i) => {
        const y = LIST_TOP + i * ROW;
        const name = (
          <>
            <text x={12} y={y + 14} className="mono" fontSize={11} fontWeight={700} style={{ fill: f.status === "added" ? "var(--diff-added)" : "var(--diff-modified)" }}>
              {f.status === "added" ? "A" : "M"}
            </text>
            <text x={28} y={y + 14} className="mono" fontSize={11.5} style={{ fill: "var(--muted)" }}>
              {short(f.path)}
            </text>
          </>
        );
        const counts = (
          <text x={352} y={y + 14} textAnchor="end" className="mono" fontSize={11}>
            <tspan style={{ fill: "var(--diff-added)" }}>+{f.added}</tspan>
            {f.removed > 0 && (
              <tspan dx={6} style={{ fill: "var(--diff-removed)" }}>
                −{f.removed}
              </tspan>
            )}
          </text>
        );
        if (!f.declarations) {
          const k = dropped++;
          return (
            // out (beat 3) › dimmed and struck (beat 2) › in (beat 1)
            <g key={f.path} className="lp-gone" data-anim="out" style={at(B3 + k * 25, 500)} data-testid="dropped-file">
              <g className="lp-dimmed" data-anim="dim" style={at(B2 + 150 + k * 70, 400)}>
                <g data-anim="fade" style={at(100 + i * 55, 300)}>
                  {name}
                  {counts}
                </g>
              </g>
              <path className="lp-path" data-anim="draw" style={{ ...at(B2 + k * 70, 300), stroke: "var(--faint)" }} pathLength={1} strokeWidth={1.25} d={`M8 ${y + 10} H356`} />
            </g>
          );
        }
        const j = movedFile++;
        const to = fileY(f.path);
        return (
          // moves from its place in the list to its place in its component (beat 3)
          <g key={f.path} data-anim="move" style={{ ...at(B3 + 300 + j * 90, 650), "--from": `${y - to}px` } as React.CSSProperties} data-testid="kept-file">
            <g transform={`translate(0 ${to - y})`}>
              <g data-anim="fade" style={at(100 + i * 55, 300)}>
                {name}
                <g className="lp-gone" data-anim="out" style={at(B3, 400)}>
                  {counts}
                </g>
              </g>
            </g>
          </g>
        );
      })}

      {/* beat 3: the declarations */}
      {LINES.filter((l) => l.kind === "decl").map((l, k) => {
        const added = l.decl!.status === "added";
        return (
          <g key={`${l.file}#${l.decl!.name}`} data-anim="in" style={at(B3 + 1000 + k * 80, 380)} data-testid="declaration-row">
            <text x={38} y={l.y + 14} textAnchor="middle" className="mono" fontSize={12} fontWeight={700} style={{ fill: added ? "var(--diff-added)" : "var(--diff-modified)" }}>
              {added ? "+" : "~"}
            </text>
            <text x={50} y={l.y + 14} className="mono" fontSize={12.5} style={{ fill: "var(--text)" }}>
              {l.decl!.name}
            </text>
          </g>
        );
      })}

      {/* beat 4: the components */}
      {FRAMES.map((frame, k) => (
        <g key={frame.id} data-testid="change-component">
          <path
            className="lp-path"
            data-anim="draw"
            style={{ ...at(B4 + k * 200, 700), fill: "none", stroke: "var(--accent)" }}
            pathLength={1}
            strokeWidth={1.5}
            d={roundRect(3, frame.top, 354, frame.bottom - frame.top, 10)}
          />
          <g data-anim="in" style={at(B4 + 300 + k * 200, 400)}>
            <text x={12} y={frame.top + 19} fontSize={14} fontWeight={600} style={{ fill: "var(--text)" }} data-testid="change-component-name">
              {frame.name}
            </text>
            <text x={348} y={frame.top + 19} textAnchor="end" className="mono" fontSize={11} style={{ fill: "var(--muted)" }}>
              {frame.counts}
            </text>
          </g>
        </g>
      ))}

      {/* beat 4: the new edge and its evidence */}
      <path
        className="lp-path"
        data-anim="draw"
        style={{ ...at(B4 + 800, 600), fill: "none", stroke: "var(--highlight)" }}
        pathLength={1}
        strokeWidth={1.5}
        d={`M${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2 + 6} ${y2}`}
      />
      <path data-anim="fade" style={{ ...at(B4 + 1350, 200), fill: "var(--highlight)" }} d={`M${x2} ${y2} l9 -4.5 v9 Z`} />
      <g data-anim="in" style={at(B4 + 1300, 400)} data-testid="new-edge">
        <rect x={mid.x - 138} y={mid.y - 12} width={130} height={19} rx={4} style={{ fill: "var(--panel)" }} />
        <text x={mid.x - 12} y={mid.y + 2} textAnchor="end" className="mono" fontSize={11} style={{ fill: "var(--highlight)" }}>
          {ADDED_EDGE.kind} · {short(ADDED_EDGE.file)}:{ADDED_EDGE.line}
        </text>
      </g>
    </svg>
  );
}
