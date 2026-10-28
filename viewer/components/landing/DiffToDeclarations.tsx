import { HUE } from "./RepoToGraph";
import { ADDED_EDGE, CHANGE_COMPONENTS, COMMIT, COMMIT_DECLARATIONS, COMMIT_FILES, COMMIT_LINES, DECLARATIONS, fmt, IGNORED_BY_CONFIG } from "@/lib/landing";

/**
 * Recall commit 7943212, one idea: 2,040 changed lines are 8 declarations in 2 components.
 *   1. the pull request as one bar: 15 files, each as wide as its lines;
 *   2. the 11 files with no declaration fade out (bench/ is ignored by Recall's config, the other
 *      two are not TypeScript); the 4 left light up;
 *   3. the counter turns from lines into declarations, and the 2 components fill with them;
 *   4. the one new edge: the route now calls hybridSearch, at index.ts:320.
 * HTML (spans only: it sits inside the replay button), timed by --t / --d (globals.css .lp-anim).
 */

export const DIFF_BEATS = [0, 1500, 2800, 4400] as const;
const [, B2, B3, B4] = DIFF_BEATS;
const at = (t: number, d?: number) => ({ "--t": `${t}ms`, ...(d ? { "--d": `${d}ms` } : {}) }) as React.CSSProperties;
const short = (path: string) => path.replace(/^recall-backend\//, "");

const kept = COMMIT_FILES.filter((f) => f.declarations);
const keptLines = kept.reduce((n, f) => n + f.added + f.removed, 0);
const ignored = COMMIT_FILES.filter((f) => f.path.startsWith(IGNORED_BY_CONFIG.replace("**", ""))).length;
const notTs = COMMIT_FILES.length - kept.length - ignored;

/** per component: its files (the new edge's target first), each with its declarations */
const CARDS = CHANGE_COMPONENTS.map((c) => {
  const decls = DECLARATIONS.filter((d) => d.component === c.id);
  const files = [...new Set(decls.map((d) => d.file))].sort((a, b) => Number(b.endsWith("searchService.ts")) - Number(a.endsWith("searchService.ts")));
  const added = decls.filter((d) => d.status === "added").length;
  const modified = decls.length - added;
  return { ...c, files: files.map((file) => ({ file, status: COMMIT_FILES.find((f) => f.path === file)!.status, decls: decls.filter((d) => d.file === file) })), counts: [added && `${added} added`, modified && `${modified} modified`].filter(Boolean).join(" · ") };
});
const EDGE_CARD = CHANGE_COMPONENTS.find((c) => DECLARATIONS.some((d) => d.component === c.id && d.name === ADDED_EDGE.to))!.id;

export function DiffToDeclarations() {
  let dropped = 0;
  let row = 0;
  return (
    <span className="dd dd-shell" data-testid="diff-to-declarations" aria-hidden>
      {/* the counter: lines, then declarations */}
      <span className="dd-head">
        <span className="dd-count">
          <span className="dd-from lp-gone" data-anim="out" style={at(B3 - 300, 600)}>
            {fmt(COMMIT_LINES)} lines
          </span>
          <span className="dd-to" data-anim="fade" style={at(B3 + 100, 500)} data-testid="diff-counter">
            {COMMIT_DECLARATIONS} declarations
          </span>
        </span>
        <span className="dd-sub" data-anim="fade" style={at(0, 400)}>
          commit {COMMIT.short} · {COMMIT.files} files · <span className="text-diff-added">+{fmt(COMMIT.linesAdded)}</span> <span className="text-diff-removed">−{COMMIT.linesRemoved}</span>
        </span>
      </span>

      {/* beats 1–2: the pull request as one bar, a segment per file, as wide as its lines */}
      <span className="dd-bar">
        {COMMIT_FILES.map((f, i) => {
          const grow = { flexGrow: f.added + f.removed } as React.CSSProperties;
          if (!f.declarations) {
            const k = dropped++;
            return (
              <span key={f.path} className="dd-seg dd-drop lp-dimmed" data-anim="dim" style={{ ...grow, ...at(B2 + k * 50, 500) }} data-testid="dropped-file" title={short(f.path)}>
                <span className="dd-fill" data-anim="grow" style={at(120 + i * 60, 420)} />
              </span>
            );
          }
          return (
            <span key={f.path} className="dd-seg dd-keep" style={{ ...grow, "--c": HUE[DECLARATIONS.find((d) => d.file === f.path)!.component] } as React.CSSProperties} data-testid="kept-file" title={short(f.path)}>
              <span className="dd-fill" data-anim="grow" style={at(120 + i * 60, 420)} />
              <span className="dd-lit" data-anim="fade" style={at(B2 + 300, 500)} />
            </span>
          );
        })}
      </span>
      <span className="dd-legend">
        <span className="dd-key" data-anim="in" style={at(B2 + 200, 400)}>
          <i className="dd-swatch dd-swatch-keep" style={{ "--c": HUE[CHANGE_COMPONENTS[0].id] } as React.CSSProperties} />
          <i className="dd-swatch dd-swatch-keep" style={{ "--c": HUE[CHANGE_COMPONENTS[1].id] } as React.CSSProperties} />
          {kept.length} files with a declaration · {keptLines} lines
        </span>
        <span className="dd-key" data-anim="in" style={at(B2 + 400, 400)}>
          <i className="dd-swatch" />
          {COMMIT_FILES.length - kept.length} without: {ignored} under <code>bench/</code>, which Recall&apos;s config ignores; {notTs} not TypeScript
        </span>
      </span>

      {/* beats 3–4: the components and their declarations, then the new edge */}
      <span className="dd-cards">
        {CARDS.map((c, k) => (
          <span key={c.id} className="dd-card" data-anim="in" style={{ ...at(B3 + k * 180, 500), "--c": HUE[c.id] } as React.CSSProperties} data-testid="change-component">
            <span className="dd-card-head">
              <span className="dd-card-name" data-testid="change-component-name">
                {c.name}
              </span>
              <span className="dd-card-counts">{c.counts}</span>
            </span>
            {c.files.map(({ file, status, decls }) => (
              <span key={file} className="dd-file">
                <span className="dd-file-name">
                  <b className={status === "added" ? "text-diff-added" : "text-diff-modified"}>{status === "added" ? "A" : "M"}</b> {short(file)}
                </span>
                {decls.map((d) => (
                  <span key={d.name} className="dd-decl" data-status={d.status} data-anim="in" style={at(B3 + 350 + row++ * 90, 360)} data-testid="declaration-row">
                    <b>{d.status === "added" ? "+" : "~"}</b>
                    {d.name}
                  </span>
                ))}
              </span>
            ))}
            {c.id === EDGE_CARD && (
              <span className="dd-edge" data-anim="in" style={at(B4, 500)}>
                <span className="dd-edge-from">{ADDED_EDGE.from}</span>
                <span className="dd-edge-arrow">
                  <span className="dd-edge-line" data-anim="growy" style={at(B4 + 250, 600)} />
                  <span className="dd-edge-tag" data-testid="new-edge">
                    {ADDED_EDGE.kind} · {short(ADDED_EDGE.file)}:{ADDED_EDGE.line}
                  </span>
                </span>
                <span className="dd-edge-to">{ADDED_EDGE.to}</span>
              </span>
            )}
          </span>
        ))}
      </span>
    </span>
  );
}
