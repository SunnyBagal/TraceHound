#!/usr/bin/env node
/**
 * handcheck-sheet.ts (B2): the blind hand-check (docs/eval/ts-protocol.md §10).
 *
 * build:   node scripts/testset/handcheck-sheet.ts build --side dev --goldens <goldens.json> --tool <name>=<reviews dir> …
 *            --judge <name>=<v1 detail> … [--judge-x1 <name>=<x1 detail> …] --seed <int> [--strip <json>] --out <dir>
 * resolve: node scripts/testset/handcheck-sheet.ts resolve --side dev --mapping <mapping.json> --decisions <decisions.json>
 *            --out <handcheck.json>
 *
 * Candidates: every eligible comment either judge matched to the case's golden, and every comment within ±10 lines of
 * any target (primary or alternate). A judge disagreement is a comment one judge matched and the other did not, so it
 * is in the set already. Items from every tool and case are shuffled together with the recorded seed, and the sheet
 * shows no tool name and no reason the item is there. Whether it shows a judge cue is policy `sheet_judge_cues`
 * (`--policy`, required: pending Sunny in ts-protocol §13). Bodies lose HTML comments (tool markers) and
 * any `--strip` regexes (a JSON array of patterns, frozen with the sheet); the finding text is otherwise unchanged.
 * Files: sheet.md (for Sunny), decisions.json (blank, item order), mapping.json (private: item → tool, case, comment,
 * reasons; never shown to the checker), hashes.json (sha256 of all three and the recipe: seed and strip patterns).
 * resolve: a case is caught by a tool when the checker marked any of that tool's items for that case `same-bug`; every
 * decision must be filled. Output {decisions: [{tool, case, caught}]} for score-testset.ts --handcheck.
 * Guess column (decision 076c item 7, premortem row 2 ii): every item also takes `guess`, the checker's guess of which
 * tool wrote the comment (a --tool name as the runbook gives it, or `unsure`), written at the end of the sitting, before
 * anything is unblinded. resolve requires it like the decision and adds counts only: {items, guessed, unsure, right,
 * tools, commonestToolItems}; score-testset.ts prints them in one line.
 * stdout: counts only. Never overwrites.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { checkSide, commentHits, pairs, readGoldens, readJson, readPolicy, readReviews, RefusalError, sha256, shuffled, writeNew,
  type Comment, type GoldenCase } from "./kit.ts";

interface DetailFile { detail?: { prTitle: string; status: string; comments: { path: string; line: number | null; body: string; matched: string | null }[] }[] }

/**
 * Comment indexes a judge matched to G1, by case, or "failed" for a JUDGE_FAILED case. Every bug case the tool has a
 * review for must have an entry (a judge that matched nothing is an entry with no matches; no entry is missing
 * evidence and refuses), and a scored entry must have judged exactly the review's comments, in order.
 */
export function judgeMatches(file: string, cases: GoldenCase[], reviews: Map<string, { comments: Comment[] }>): Map<string, Set<number> | "failed"> {
  const d = readJson(file) as DetailFile;
  if (!Array.isArray(d.detail)) throw new RefusalError(`${file} is not a bench score --detail file`);
  const byTitle = new Map(cases.map((c) => [c.pr_title, c.case]));
  const out = new Map<string, Set<number> | "failed">();
  for (const p of d.detail) {
    const id = byTitle.get(p.prTitle);
    if (!id) continue;
    if (out.has(id)) throw new RefusalError(`${file}: two judged entries for one PR title`);
    if (p.status !== "SCORED") { out.set(id, "failed"); continue; }
    const review = reviews.get(id);
    if (!review || review.comments.length !== p.comments.length
      || p.comments.some((c, i) => c.path !== review.comments[i]!.path || c.line !== review.comments[i]!.line || c.body !== review.comments[i]!.body)) {
      throw new RefusalError(`${file}: judged comments for ${id} are not this tool's review file`);
    }
    out.set(id, new Set(p.comments.flatMap((c, i) => (c.matched === "G1" ? [i] : []))));
  }
  const missing = cases.filter((c) => c.label === "bug" && reviews.has(c.case) && !out.has(c.case)).length;
  if (missing) throw new RefusalError(`${file}: no judged entry for ${missing} reviewed bug case(s) (missing evidence is never "no match")`);
  return out;
}

export interface Item { item: string; tool: string; case: string; comment: number; reasons: string[]; review_sha256: string }
/** Every (tool, bug case) the sheet considered, with the sha256 of the review file it read: score-testset checks it. */
export interface Reviewed { tool: string; case: string; review_sha256: string }

export function buildSheet(o: {
  cases: GoldenCase[]; reviews: Map<string, Map<string, { comments: Comment[] }>>; reviewSha: Map<string, Map<string, string>>;
  v1: Map<string, Map<string, Set<number> | "failed">>; x1: Map<string, Map<string, Set<number> | "failed">>; seed: number; strip: RegExp[];
  /** policy sheet_judge_cues (ts-protocol §13, pending): "shown" adds whether a judge proposed a match; "hidden" does not */
  judgeCues: "hidden" | "shown";
}): { sheet: string; decisions: { item: string; decision: null; guess: null; reason: string }[]; mapping: Item[]; reviewed: Reviewed[] } {
  const raw: Omit<Item, "item">[] = [];
  const reviewed: Reviewed[] = [];
  // a JUDGE_FAILED case has no judge evidence, so every comment of it goes on the sheet
  const judged = (m: Map<string, Set<number> | "failed"> | undefined, id: string, i: number, label: string) => {
    const e = m?.get(id);
    return e === "failed" ? [`${label}-failed`] : e?.has(i) ? [label] : [];
  };
  for (const c of o.cases.filter((x) => x.label === "bug")) {
    for (const [tool, reviews] of o.reviews) {
      const review = reviews.get(c.case);
      if (!review) continue;
      const sha = o.reviewSha.get(tool)!.get(c.case)!;
      reviewed.push({ tool, case: c.case, review_sha256: sha });
      review.comments.forEach((cm, i) => {
        const reasons = [...judged(o.v1.get(tool), c.case, i, "judge-v1"), ...judged(o.x1.get(tool), c.case, i, "judge-x1"),
          ...(commentHits(cm, c.targets) ? ["location"] : [])];
        if (reasons.length) raw.push({ tool, case: c.case, comment: i, reasons, review_sha256: sha });
      });
    }
  }
  const order = shuffled(raw, o.seed);
  const width = String(order.length).length;
  const mapping: Item[] = order.map((r, i) => ({ item: `H${String(i + 1).padStart(Math.max(3, width), "0")}`, ...r }));
  const golden = new Map(o.cases.map((c) => [c.case, c]));
  const clean = (body: string) => o.strip.reduce((b, re) => b.replace(re, ""), body.replace(/<!--[\s\S]*?-->/g, "")).trim();
  const parts = ["# Hand-check sheet (blind)", "",
    "For each item: is the comment about the labelled bug? Write `same-bug` or `not` and a short reason in decisions.json.",
    "Which tool wrote a comment, and why an item is listed, are hidden on purpose.",
    "At the end of the sitting, before anything is unblinded, write in `guess` which tool you think wrote each comment (its name as the runbook gives it), or `unsure`.", ""];
  for (const m of mapping) {
    const g = golden.get(m.case)!;
    const cm = o.reviews.get(m.tool)!.get(m.case)!.comments[m.comment]!;
    parts.push(`## ${m.item}`, "", "**Labelled bug:**", "", "```text", g.description ?? "(no description)", "```", "",
      `**Locations:** ${g.targets.map((t) => `${t.file}:${t.lines[0]}-${t.lines[1]}`).join("; ")}`, "",
      `**Comment at** \`${cm.path}:${cm.line ?? "(no line)"}\`:`, "", "```text", clean(cm.body), "```", "",
      ...(o.judgeCues === "shown" ? [`**A judge proposed a match:** ${m.reasons.some((x) => x === "judge-v1" || x === "judge-x1") ? "yes" : "no"}`, ""] : []));
  }
  return { sheet: parts.join("\n") + "\n", decisions: mapping.map((m) => ({ item: m.item, decision: null, guess: null, reason: "" })), mapping, reviewed };
}

/** Counts only: how often the checker's guess named the tool that wrote the item (decision 076c item 7). */
export interface GuessCounts { items: number; guessed: number; unsure: number; right: number; tools: number; commonestToolItems: number }

export function resolve(mapping: Item[], decisions: { item: string; decision: unknown; guess?: unknown; reason?: unknown }[], tools: string[]):
  { decided: { tool: string; case: string; caught: boolean; review_sha256: string }[]; guess: GuessCounts } {
  const byItem = new Map(decisions.map((d) => [d.item, d]));
  if (byItem.size !== decisions.length) throw new RefusalError("decisions name an item twice");
  const out = new Map<string, { tool: string; case: string; caught: boolean; review_sha256: string }>();
  const guess: GuessCounts = { items: mapping.length, guessed: 0, unsure: 0, right: 0, tools: tools.length, commonestToolItems: 0 };
  const perTool = new Map<string, number>();
  for (const m of mapping) {
    const d = byItem.get(m.item);
    if (!d || (d.decision !== "same-bug" && d.decision !== "not")) throw new RefusalError(`${m.item} has no decision (same-bug or not)`);
    const g = typeof d.guess === "string" ? d.guess.trim().toLowerCase() : "";
    if (g !== "unsure" && !tools.includes(g)) throw new RefusalError(`${m.item} has no guess (one of ${[...tools, "unsure"].join(", ")})`);
    if (g === "unsure") guess.unsure++;
    else { guess.guessed++; if (g === m.tool) guess.right++; }
    perTool.set(m.tool, (perTool.get(m.tool) ?? 0) + 1);
    if (typeof m.review_sha256 !== "string") throw new RefusalError(`${m.item}: the mapping does not bind its review file`);
    const key = `${m.tool}\0${m.case}`;
    const prev = out.get(key);
    out.set(key, { tool: m.tool, case: m.case, caught: (prev?.caught ?? false) || d.decision === "same-bug", review_sha256: m.review_sha256 });
  }
  if (decisions.some((d) => !mapping.some((m) => m.item === d.item))) throw new RefusalError("decisions name an item the mapping does not have");
  guess.commonestToolItems = Math.max(0, ...perTool.values());
  return { decided: [...out.values()], guess };
}

export function main(argv: string[], log: (line: string) => void = console.log): number {
  try {
    const [mode, ...rest] = argv;
    if (mode !== "build" && mode !== "resolve") throw new RefusalError("usage: handcheck-sheet.ts build|resolve …");
    const { values } = parseArgs({ args: rest, strict: true, allowPositionals: false, options: {
      side: { type: "string" }, "heldout-ok": { type: "boolean", default: false }, goldens: { type: "string" },
      tool: { type: "string", multiple: true }, judge: { type: "string", multiple: true }, "judge-x1": { type: "string", multiple: true },
      seed: { type: "string" }, strip: { type: "string" }, out: { type: "string" }, mapping: { type: "string" }, decisions: { type: "string" },
      policy: { type: "string" },
    } });
    if (mode === "resolve") {
      checkSide(values.side, values["heldout-ok"]!, [values.mapping, values.decisions, values.out]);
      if (!values.mapping || !values.decisions || !values.out) throw new RefusalError("usage: handcheck-sheet.ts resolve --side dev --mapping <f> --decisions <f> --out <f>");
      if (fs.existsSync(values.out)) throw new RefusalError(`${values.out} exists; never overwritten`);
      const mapFile = readJson(values.mapping) as { items: Item[]; reviewed?: Reviewed[]; tools?: unknown };
      if (!Array.isArray(mapFile.reviewed)) throw new RefusalError("the mapping has no reviewed list (rebuild the sheet)");
      if (!Array.isArray(mapFile.tools) || mapFile.tools.some((t) => typeof t !== "string")) throw new RefusalError("the mapping has no tools list (rebuild the sheet)");
      const mapping = mapFile.items;
      const { decided, guess } = resolve(mapping, readJson(values.decisions) as { item: string; decision: unknown }[], mapFile.tools as string[]);
      writeNew(values.out, JSON.stringify({ v: 1, decisions: decided, reviewed: mapFile.reviewed, guess,
        inputs: { mapping: sha256(fs.readFileSync(values.mapping)), decisions: sha256(fs.readFileSync(values.decisions)) } }, null, 1) + "\n");
      log(`resolved ${mapping.length} item(s) into ${decided.length} (tool, case) decision(s), ${decided.filter((d) => d.caught).length} caught -> ${values.out}`);
      return 0;
    }
    const tools = pairs(values.tool, "--tool"), v1 = pairs(values.judge, "--judge"), x1 = pairs(values["judge-x1"], "--judge-x1");
    const side = checkSide(values.side, values["heldout-ok"]!, [values.goldens, values.strip, values.out, values.policy, ...tools.values(), ...v1.values(), ...x1.values()]);
    const policy = readPolicy(values.policy, ["sheet_judge_cues"]);
    const seed = Number(values.seed);
    if (!values.goldens || !tools.size || !values.out || !Number.isSafeInteger(seed)) throw new RefusalError("usage: handcheck-sheet.ts build --side dev --goldens <f> --tool name=dir … --judge name=detail … --seed <int> --out <dir>");
    for (const m of [v1, x1]) for (const k of m.keys()) if (!tools.has(k)) throw new RefusalError(`${k} is not a --tool`);
    // judge evidence is required: v1 for every tool, and on held-out x1 as well (both judges propose matches there)
    for (const t of tools.keys()) {
      if (!v1.has(t)) throw new RefusalError(`${t} has no --judge (v1) detail`);
      if (side === "heldout" && !x1.has(t)) throw new RefusalError(`${t} has no --judge-x1 detail (held-out uses both judges)`);
    }
    for (const f of ["sheet.md", "decisions.json", "mapping.json", "hashes.json"]) if (fs.existsSync(path.join(values.out, f))) throw new RefusalError(`${path.join(values.out, f)} exists; never overwritten`);
    const g = readGoldens(values.goldens);
    if (g.side !== side) throw new RefusalError(`goldens are for side ${g.side}, not ${side}`);
    const ids = g.cases.map((c) => c.case);
    const reviews = new Map([...tools].map(([t, d]) => [t, readReviews(d, ids)]));
    const reviewSha = new Map([...tools].map(([t, d]) => [t, new Map([...reviews.get(t)!.keys()].map((id) => [id, sha256(fs.readFileSync(path.join(d, `${id}.json`)))]))]));
    const stripSrc = values.strip ? readJson(values.strip) as string[] : [];
    if (!Array.isArray(stripSrc) || stripSrc.some((s) => typeof s !== "string")) throw new RefusalError("--strip must be a JSON array of regex strings");
    const built = buildSheet({ cases: g.cases, reviews, reviewSha, seed, strip: stripSrc.map((s) => new RegExp(s, "g")), judgeCues: policy.sheet_judge_cues!,
      v1: new Map([...v1].map(([t, f]) => [t, judgeMatches(f, g.cases, reviews.get(t)!)])),
      x1: new Map([...x1].map(([t, f]) => [t, judgeMatches(f, g.cases, reviews.get(t)!)])) });
    const sheet = built.sheet, decisions = JSON.stringify(built.decisions, null, 1) + "\n";
    const mapping = JSON.stringify({ v: 1, side, seed, strip: stripSrc, policy, tools: [...tools.keys()], reviewed: built.reviewed, items: built.mapping }, null, 1) + "\n";
    writeNew(path.join(values.out, "sheet.md"), sheet);
    writeNew(path.join(values.out, "decisions.json"), decisions);
    writeNew(path.join(values.out, "mapping.json"), mapping);
    writeNew(path.join(values.out, "hashes.json"), JSON.stringify({ v: 1, "sheet.md": sha256(sheet), "decisions.json": sha256(decisions),
      "mapping.json": sha256(mapping), recipe: sha256(JSON.stringify({ seed, strip: stripSrc, judgeCues: policy.sheet_judge_cues })) }, null, 1) + "\n");
    log(`hand-check sheet: ${built.mapping.length} item(s) from ${tools.size} tool(s), seed ${seed} -> ${values.out} (keep mapping.json away from the checker)`);
    return 0;
  } catch (e) {
    log(`refused: ${e instanceof RefusalError || String((e as { code?: string }).code).startsWith("ERR_PARSE_ARGS") ? (e as Error).message : "an input could not be read"}`);
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
