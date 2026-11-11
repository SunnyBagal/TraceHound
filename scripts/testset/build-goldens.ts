#!/usr/bin/env node
/**
 * build-goldens.ts (B2): one golden per case from the labels of record, the multi-file overlay and the case manifest.
 *
 *   node scripts/testset/build-goldens.ts --side dev --manifest <cases manifest> --labels <jsonl>[,<jsonl>…]
 *     --repos <dir with one git dir per repo> --out <dir> [--overlay <json>] [--heldout-ok] [--git-bin git]
 *
 * Rules (decision 076 S0.1; docs/eval/ts-protocol.md §2):
 * - The label of record for a case is the first `--labels` file with a row for it whose introducing commit is the
 *   manifest's head_sha: a `clean` row, or one bug row with `role: "primary"` (its fix is the case's one scored defect).
 * - Overlay, the assigned form: schema-v2 JSONL rows (`labels/<side>/multifile.jsonl`): per bug case one `role:
 *   "primary"` row and any `role: "alternate"` rows of the same fix and introducing commit, `file` the path at the case
 *   head, `fix_file` its path in the fix (a historical rename alias). These rows are the targets and their roles are
 *   canonical: the build checks that the primary is first of them in git's path order of the fix (via `fix_file`) and
 *   refuses otherwise; it never re-chooses. Every bug case must have overlay rows; clean cases must have none.
 * - Older form: alternates come only from `--overlay` ({v: 1, alternates: [{case, file, lines_at_head, fix_sha, reason}]}), never
 *   inferred: every alternate names the same fix. The primary among the defect's rows is the first file in
 *   `git show --no-renames --name-only --format= <fix>` order (by rule, never by hand); the others are alternates.
 *   Labels name paths at the case head: a file renamed before the fix is followed by rename detection (case head →
 *   the fix's parent). A defect with a single row needs no lookup in the fix.
 * - Preflight: every target file must exist at the case head and its range must lie inside the file; a case without a
 *   label of record, an ambiguous primary, a duplicate target or a duplicate PR title refuses the build (exit 2,
 *   nothing written).
 * Output: <out>/goldens.json (the kit's format), <out>/bench-golden.json (one High golden per bug case, keyed by PR
 * title, none for clean cases: `tracehound bench score --golden` reads it), <out>/build.json (counts and input hashes).
 * stdout: counts, and the case id of each preflight error. Never overwrites. No network (git runs with lazy fetch off).
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { checkSide, readJson, readJsonl, RefusalError, sha256, writeNew, type GoldenCase, type Goldens, type Target } from "./kit.ts";

interface ManifestCase { id: string; repo: string; title: string; base_sha: string; case_head_sha: string; head_sha: string }
interface Row { id?: unknown; label?: unknown; role?: unknown; file?: unknown; lines_at_head?: unknown; fix_sha?: unknown; introducing_sha?: unknown; description?: unknown; fix_file?: unknown }
interface OverlayAlt { case: string; file: string; lines_at_head: [number, number]; fix_sha: string; reason: string }

const GIT_ENV = (): NodeJS.ProcessEnv => ({ PATH: process.env.PATH, HOME: process.env.HOME, GIT_NO_LAZY_FETCH: "1",
  GIT_ALLOW_PROTOCOL: "file", GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" });
const SHA = /^[0-9a-f]{7,40}$/;
const samePrefix = (a: string, b: string) => a.length >= 7 && b.length >= 7 && (a.startsWith(b) || b.startsWith(a));
const range = (v: unknown): [number, number] | null =>
  Array.isArray(v) && v.length === 2 && v.every((n) => Number.isSafeInteger(n) && n >= 1) && v[0] <= v[1] ? [v[0], v[1]] : null;

export interface BuildResult { goldens: Goldens; bench: { pr_title: string; comments: { comment: string; severity: "High" }[] }[]; errors: string[] }

export function buildGoldens(o: {
  side: "dev" | "heldout"; manifest: ManifestCase[]; labels: { name: string; rows: Row[] }[]; overlay: OverlayAlt[];
  /** schema-v2 overlay rows (role primary | alternate per bug case); when given, they are every bug case's targets */
  roleRows?: Row[];
  git: (repo: string, args: string[]) => { ok: boolean; out: string };
}): BuildResult {
  const errors: string[] = [];
  const cases: GoldenCase[] = [];
  const titles = new Map<string, string>();
  for (const alt of o.overlay) if (!o.manifest.some((c) => c.id === alt.case)) errors.push(`${alt.case}: overlay names a case not in the manifest`);
  for (const id of new Set((o.roleRows ?? []).map((r) => String(r.id)))) if (!o.manifest.some((c) => c.id === id)) errors.push(`${id}: overlay names a case not in the manifest`);
  for (const c of o.manifest) {
    if (titles.has(c.title)) errors.push(`${c.id}: same PR title as ${titles.get(c.title)} (goldens are keyed by title)`);
    titles.set(c.title, c.id);
    // label of record: the first labels file with a matching row
    let record: { name: string; rows: Row[] } | null = null;
    for (const l of o.labels) {
      const rows = l.rows.filter((r) => r.id === c.id && (r.label === "clean"
        || (r.label === "bug" && r.role === "primary" && typeof r.introducing_sha === "string" && samePrefix(r.introducing_sha, c.head_sha))));
      if (rows.length) { record = { name: l.name, rows }; break; }
    }
    if (!record) { errors.push(`${c.id}: no label of record (no clean row and no primary for this introducing commit)`); continue; }
    if (record.rows.length !== 1) { errors.push(`${c.id}: ${record.rows.length} label rows of record in ${record.name} (need exactly one)`); continue; }
    const row = record.rows[0]!;
    const alts = o.overlay.filter((a) => a.case === c.id);
    if (row.label === "clean") {
      if (alts.length || o.roleRows?.some((r) => r.id === c.id)) errors.push(`${c.id}: overlay rows on a clean case`);
      cases.push({ case: c.id, pr_title: c.title, label: "clean", targets: [] });
      continue;
    }
    const fix = String(row.fix_sha ?? "");
    const r0 = range(row.lines_at_head);
    if (!SHA.test(fix) || typeof row.file !== "string" || !row.file || !r0) { errors.push(`${c.id}: primary row lacks fix_sha, file or a valid range`); continue; }
    let rows: { file: string; lines: [number, number]; fixFile?: string; given?: "primary" | "alternate" }[] = [{ file: row.file, lines: r0 }];
    let description = typeof row.description === "string" ? row.description : undefined;
    if (o.roleRows) {
      // schema-v2 overlay: its rows are the defect's targets, with canonical roles (checked, never re-chosen)
      const mine = o.roleRows.filter((r) => r.id === c.id);
      if (!mine.length) { errors.push(`${c.id}: bug case has no rows in the overlay`); continue; }
      const bad = mine.find((r) => r.label !== "bug" || (r.role !== "primary" && r.role !== "alternate") || typeof r.file !== "string" || !r.file
        || !range(r.lines_at_head) || !samePrefix(String(r.fix_sha ?? ""), fix) || !samePrefix(String(r.introducing_sha ?? ""), c.head_sha)
        || (r.fix_file !== undefined && (typeof r.fix_file !== "string" || !r.fix_file)));
      if (bad) { errors.push(`${c.id}: an overlay row is not a bug row of this case's fix and introducing commit with a role, file and range`); continue; }
      const primaries = mine.filter((r) => r.role === "primary");
      if (primaries.length !== 1) { errors.push(`${c.id}: the overlay has ${primaries.length} primary rows (need exactly one)`); continue; }
      const p = primaries[0]!;
      rows = [p, ...mine.filter((r) => r !== p)].map((r) => ({ file: r.file as string, lines: range(r.lines_at_head)!,
        ...(typeof r.fix_file === "string" && { fixFile: r.fix_file }), given: r.role as "primary" | "alternate" }));
      if (typeof p.description === "string") description = p.description;
      const dup = rows.find((x, i) => rows.some((y, j) => j < i && y.file === x.file && y.lines[0] <= x.lines[1] && x.lines[0] <= y.lines[1]));
      if (dup) { errors.push(`${c.id}: duplicate target ${dup.file} (same file, overlapping range)`); continue; }
    }
    for (const a of o.roleRows ? [] : alts) {
      const r = range(a.lines_at_head);
      if (!r || typeof a.file !== "string" || !a.file) { errors.push(`${c.id}: overlay alternate lacks a file or a valid range`); continue; }
      if (!samePrefix(String(a.fix_sha ?? ""), fix)) { errors.push(`${c.id}: overlay alternate names another fix (alternates are the same defect)`); continue; }
      if (typeof a.reason !== "string" || !a.reason.trim()) { errors.push(`${c.id}: overlay alternate without a reason`); continue; }
      if (rows.some((x) => x.file === a.file && x.lines[0] <= r[1] && r[0] <= x.lines[1])) { errors.push(`${c.id}: duplicate target ${a.file} (same file, overlapping range)`); continue; }
      rows.push({ file: a.file, lines: r });
    }
    // primary by rule: first in git's path order of the fix (only needed when the defect has several rows). Labels name
    // paths at the case head; a file renamed between the head and the fix is followed by rename detection
    // (head → the fix's parent) before its place in the fix's list is looked up.
    if (rows.length > 1) {
      const order = o.git(c.repo, ["show", "--no-renames", "--name-only", "--format=", fix]);
      if (!order.ok) { errors.push(`${c.id}: fix ${fix.slice(0, 7)} not readable in the ${c.repo} clone`); continue; }
      const fixFiles = order.out.split("\n").filter(Boolean);
      const renames = new Map<string, string>();
      if (rows.some((x) => !fixFiles.includes(x.file))) {
        const moved = o.git(c.repo, ["diff", "--find-renames", "--name-status", "--no-color", c.case_head_sha, `${fix}^`]);
        if (moved.ok) for (const line of moved.out.split("\n")) {
          const [st, from, to] = line.split("\t");
          if (st?.startsWith("R") && from && to) renames.set(from, to);
        }
      }
      // the overlay's fix_file (the path in the fix; a historical rename alias) first, then the head path and renames
      const place = (x: { file: string; fixFile?: string }) => {
        if (x.fixFile && fixFiles.includes(x.fixFile)) return fixFiles.indexOf(x.fixFile);
        return fixFiles.indexOf(fixFiles.includes(x.file) ? x.file : renames.get(x.file) ?? x.file);
      };
      const missing = rows.filter((x) => place(x) < 0);
      if (missing.length) { errors.push(`${c.id}: ${missing.length} target file(s) not touched by the fix (after following renames)`); continue; }
      const given = rows[0]!.given === "primary" ? rows[0] : undefined;
      rows.sort((x, y) => place(x) - place(y));
      if (given && rows[0] !== given) { errors.push(`${c.id}: the overlay's primary is not the first of its files in git's path order of the fix`); continue; }
    }
    // preflight against the case head
    let bad = false;
    for (const x of rows) {
      const blob = o.git(c.repo, ["show", `${c.case_head_sha}:${x.file}`]);
      if (!blob.ok) { errors.push(`${c.id}: target file missing at the case head`); bad = true; continue; }
      const lines = blob.out.endsWith("\n") ? blob.out.split("\n").length - 1 : blob.out.split("\n").length;
      if (x.lines[1] > lines) { errors.push(`${c.id}: target range past the end of the file at the case head`); bad = true; }
    }
    if (bad) continue;
    const targets: Target[] = rows.map((x, i) => ({ file: x.file, lines: x.lines, role: i === 0 ? "primary" : "alternate" }));
    cases.push({ case: c.id, pr_title: c.title, label: "bug", fix_sha: fix, introducing_sha: String(row.introducing_sha),
      targets, ...(description !== undefined && { description }) });
  }
  const bench = cases.map((g) => ({ pr_title: g.pr_title, comments: g.label === "clean" ? [] : [{ severity: "High" as const,
    comment: `${g.description ?? "(no description)"}\nLocations (a comment at any one of them is about this bug): `
      + g.targets.map((t) => `${t.file}:${t.lines[0]}-${t.lines[1]}`).join("; ") }] }));
  return { goldens: { v: 1, side: o.side, cases }, bench, errors };
}

export function main(argv: string[], log: (line: string) => void = console.log): number {
  try {
    const { values } = parseArgs({ args: argv, strict: true, allowPositionals: false, options: {
      side: { type: "string" }, "heldout-ok": { type: "boolean", default: false }, manifest: { type: "string" },
      labels: { type: "string" }, overlay: { type: "string" }, repos: { type: "string" }, out: { type: "string" },
      "git-bin": { type: "string", default: "git" },
    } });
    const labelFiles = (values.labels ?? "").split(",").filter(Boolean);
    const side = checkSide(values.side, values["heldout-ok"]!, [values.manifest, values.overlay, values.repos, values.out, ...labelFiles]);
    if (!values.manifest || !labelFiles.length || !values.repos || !values.out) {
      throw new RefusalError("usage: build-goldens.ts --side dev --manifest <file> --labels <jsonl>[,…] --repos <dir> --out <dir> [--overlay <json>]");
    }
    for (const f of ["goldens.json", "bench-golden.json", "build.json"]) {
      if (fs.existsSync(path.join(values.out, f))) throw new RefusalError(`${path.join(values.out, f)} exists; never overwritten`);
    }
    const manifest = readJson(values.manifest) as ManifestCase[];
    // --overlay: the schema-v2 multi-file rows (.jsonl: primary + alternates per bug case, the assigned format), or the
    // older {v: 1, alternates: [...]} JSON listing alternates only
    const roleRows = values.overlay?.endsWith(".jsonl") ? readJsonl(values.overlay) as Row[] : undefined;
    const overlayRaw = !values.overlay || roleRows ? { v: 1, alternates: [] as OverlayAlt[] } : readJson(values.overlay) as { v?: number; alternates?: OverlayAlt[] };
    if (overlayRaw.v !== 1 || !Array.isArray(overlayRaw.alternates)) throw new RefusalError("--overlay must be schema-v2 rows (.jsonl) or {v: 1, alternates: [...]}");
    const git = (repo: string, args: string[]) => {
      if (!/^[A-Za-z0-9._-]+$/.test(repo)) return { ok: false, out: "" };
      const r = spawnSync(values["git-bin"]!, ["-C", path.join(values.repos!, repo), ...args], { encoding: "utf8", env: GIT_ENV(), maxBuffer: 256 * 1024 * 1024 });
      return { ok: r.status === 0, out: r.stdout ?? "" };
    };
    const result = buildGoldens({ side, manifest, overlay: overlayRaw.alternates, ...(roleRows && { roleRows }),
      labels: labelFiles.map((f) => ({ name: path.basename(f), rows: readJsonl(f) as Row[] })), git });
    if (result.errors.length) {
      for (const e of result.errors) log(`preflight error: ${e}`);
      log(`refused: ${result.errors.length} preflight error(s); nothing written`);
      return 2;
    }
    const goldensText = JSON.stringify(result.goldens, null, 1) + "\n";
    const benchText = JSON.stringify(result.bench, null, 1) + "\n";
    const bug = result.goldens.cases.filter((c) => c.label === "bug");
    const counts = { cases: result.goldens.cases.length, bug: bug.length, clean: result.goldens.cases.length - bug.length,
      alternates: bug.reduce((n, c) => n + c.targets.length - 1, 0), casesWithAlternates: bug.filter((c) => c.targets.length > 1).length };
    const hashes = Object.fromEntries([values.manifest, ...labelFiles, ...(values.overlay ? [values.overlay] : [])]
      .map((f) => [path.basename(f), sha256(fs.readFileSync(f))]));
    writeNew(path.join(values.out, "goldens.json"), goldensText);
    writeNew(path.join(values.out, "bench-golden.json"), benchText);
    writeNew(path.join(values.out, "build.json"), JSON.stringify({ v: 1, side, counts, inputs: hashes,
      outputs: { "goldens.json": sha256(goldensText), "bench-golden.json": sha256(benchText) } }, null, 1) + "\n");
    log(`goldens: ${counts.cases} cases (${counts.bug} bug, ${counts.clean} clean), ${counts.alternates} alternate target(s) in ${counts.casesWithAlternates} case(s) -> ${values.out}`);
    return 0;
  } catch (e) {
    log(`refused: ${e instanceof RefusalError || (e as { code?: string }).code === "ERR_PARSE_ARGS_UNKNOWN_OPTION" ? (e as Error).message : "an input could not be read"}`);
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
