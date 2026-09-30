// Context packet v1: what an agent should read first for an issue, from the snapshot alone.
// Ranking and confidence are deterministic heuristics (docs/decisions.md 025), not probabilities.
import type { ComponentEdge, Snapshot } from "../schema.ts";
import { estimateTokens, rankComponents, repoTokens, type Ranked } from "./rank.ts";

const BROKER_KINDS = new Set(["queue", "cache"]);
const QUEUE_EDGE_KINDS = new Set(["produces", "consumes", "reads", "writes"]);
const MAX_MATCHES = 3;

export type ConfidenceLevel = "high" | "medium" | "low" | "none";

export interface ContextPacket {
  issue: string;
  snapshot: { repo: string; commitSha: string; analyzerVersion: string };
  ranking: { method: string; terms: string[] };
  confidence: { level: ConfidenceLevel; topScore: number; secondScore: number; margin: number; rule: string; note: string };
  advice?: string;
  components: {
    id: string;
    name: string;
    kind: string;
    role: "match" | "neighbor";
    score: number;
    reason: string;
    files?: string[];
    fileCount: number;
  }[];
  edges: { id: string; kind: string; source: string; target: string; confidenceLabel: string; label: string; evidence: string[] }[];
  tests: { file: string; componentId: string; importAt: string }[];
  testsNote: string;
  tokens: { packetEstimated: number; repoEstimated?: number; percentOfRepoEstimated?: number; budget: number; method: string };
  trimmed: string[];
}

export const CONFIDENCE_RULE =
  "heuristic, not a probability: none if top score = 0; high if top score >= 6 and it leads #2 by >= 2; medium if top score >= 3; otherwise low";

export function confidenceOf(ranked: Ranked[]): ContextPacket["confidence"] {
  const topScore = ranked[0]?.score ?? 0;
  const secondScore = ranked[1]?.score ?? 0;
  const margin = topScore - secondScore;
  const level: ConfidenceLevel = topScore === 0 ? "none" : topScore >= 6 && margin >= 2 ? "high" : topScore >= 3 ? "medium" : "low";
  const note = {
    high: "one component matches the issue's terms clearly better than the rest",
    medium: topScore >= 6 ? "strong matches, but several components score about the same; the packet includes them" : "at least one name or route matched",
    low: "only weak matches (a file, symbol or env var); the ranking is close to guessing",
    none: "no component name, route, file, symbol, Redis key or env var matches the issue text",
  }[level];
  return { level, topScore, secondScore, margin, rule: CONFIDENCE_RULE, note };
}

const FALLBACK =
  "Confidence is LOW. Do not rely on this packet: fall back to normal code search (grep/ripgrep for the issue's key terms, read entry points) and use the graph only to check what you find.";

export function buildContext(snapshot: Snapshot, issue: string, opts: { budget?: number; evidencePerEdge?: number } = {}): ContextPacket {
  const budget = opts.budget ?? 2000;
  const { terms, ranked } = rankComponents(snapshot, issue);
  const confidence = confidenceOf(ranked);
  const byId = new Map(snapshot.components.map((c) => [c.id, c]));
  const evidence = new Map(snapshot.evidence.map((e) => [e.id, e]));

  // 1. matches: top components with score > 0, at most 3, each at least half the top score
  const top = ranked[0]?.score ?? 0;
  const matches = ranked.filter((r) => r.score > 0 && r.score >= top / 2).slice(0, MAX_MATCHES);
  const included = new Map<string, { role: "match" | "neighbor"; score: number; reason: string }>(matches.map((m) => [m.id, { role: "match", score: m.score, reason: m.reason }]));
  const edgeIds = new Set<string>();

  // 2. one hop out from each match, along every edge touching it (either direction)
  const touching = (id: string) => snapshot.edges.filter((e) => e.source === id || e.target === id);
  const other = (e: ComponentEdge, id: string) => (e.source === id ? e.target : e.source);
  const isBroker = (id: string) => BROKER_KINDS.has(byId.get(id)!.kind);
  for (const m of matches) {
    for (const e of touching(m.id)) {
      const n = other(e, m.id);
      edgeIds.add(e.id);
      if (!included.has(n)) included.set(n, { role: "neighbor", score: 0, reason: `1 hop from ${m.id}: ${e.kind} "${e.label}" [${e.confidenceLabel}]` });
    }
  }
  // 3. queue partners: a message contract couples both sides of a broker (decisions 023, 024), so
  //    any included component's queue edges bring in the broker and the components across it
  for (const id of [...included.keys()]) {
    for (const e of touching(id).filter((x) => QUEUE_EDGE_KINDS.has(x.kind))) {
      const broker = isBroker(id) ? id : other(e, id);
      if (!isBroker(broker)) continue;
      edgeIds.add(e.id);
      if (!included.has(broker)) included.set(broker, { role: "neighbor", score: 0, reason: `queue broker of ${id}: ${e.kind} "${e.label}" [${e.confidenceLabel}]` });
      for (const e2 of touching(broker).filter((x) => QUEUE_EDGE_KINDS.has(x.kind))) {
        const far = other(e2, broker);
        edgeIds.add(e2.id);
        if (!included.has(far)) included.set(far, { role: "neighbor", score: 0, reason: `queue partner of ${id} across ${broker}: ${e2.kind} "${e2.label}" [${e2.confidenceLabel}]` });
      }
    }
  }

  let evidencePerEdge = opts.evidencePerEdge ?? 2;
  const trimmed: string[] = [];
  let neighborFiles = true;
  let neighbors = true;

  const assemble = (): ContextPacket => {
    const components = [...included.entries()]
      .filter(([, v]) => neighbors || v.role === "match")
      .map(([id, v]) => {
        const c = byId.get(id)!;
        const showFiles = v.role === "match" || neighborFiles;
        return {
          id,
          name: c.naming.source === "llm" ? `${c.name} (model-written name)` : c.name,
          kind: c.kind,
          role: v.role,
          score: v.score,
          reason: v.reason,
          ...(showFiles && { files: c.files }),
          fileCount: c.files.length,
        };
      });
    const ids = new Set(components.map((c) => c.id));
    const edges = snapshot.edges
      .filter((e) => edgeIds.has(e.id) && ids.has(e.source) && ids.has(e.target))
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        source: e.source,
        target: e.target,
        confidenceLabel: e.confidenceLabel,
        label: e.label,
        evidence: e.evidenceIds.slice(0, evidencePerEdge).map((id) => {
          const ev = evidence.get(id)!;
          return `${ev.file}:${ev.range.startLine}`;
        }),
      }));
    const tests = snapshot.tests
      .filter((t) => ids.has(t.componentId))
      .map((t) => {
        const ev = evidence.get(t.evidenceIds[0]!)!;
        return { file: t.file, componentId: t.componentId, importAt: `${ev.file}:${ev.range.startLine}` };
      });
    const repo = repoTokens(snapshot);
    const packet: ContextPacket = {
      issue,
      snapshot: { repo: snapshot.repo.name, commitSha: snapshot.repo.commitSha, analyzerVersion: snapshot.analyzerVersion },
      ranking: { method: "v1 lexical: issue terms vs ids/names, routes, exported symbols, files, Redis keys, env vars (docs/decisions.md 025)", terms },
      confidence,
      ...(confidence.level === "low" || confidence.level === "none" ? { advice: FALLBACK } : {}),
      components,
      edges,
      tests,
      testsNote: `${tests.length} linked test${tests.length === 1 ? "" : "s"}${tests.length ? "" : " (no test file imports these components)"}`,
      tokens: { packetEstimated: 0, repoEstimated: repo, budget, method: "estimated: characters / 4 of the JSON packet (and of the repo's source files)" },
      trimmed: [...trimmed],
    };
    // two passes so the token count includes its own digits
    for (let i = 0; i < 2; i++) {
      packet.tokens.packetEstimated = estimateTokens(JSON.stringify(packet).length);
      if (repo) packet.tokens.percentOfRepoEstimated = Math.round((packet.tokens.packetEstimated / repo) * 1000) / 10;
    }
    return packet;
  };

  // 4. fit the budget: fewer evidence refs, then drop neighbor file lists, then drop neighbors
  let packet = assemble();
  const steps: [string, () => void][] = [
    ["evidence per edge 2 -> 1", () => (evidencePerEdge = 1)],
    ["neighbor file lists dropped (counts kept)", () => (neighborFiles = false)],
    ["neighbor components dropped (matches kept)", () => (neighbors = false)],
  ];
  for (const [label, apply] of steps) {
    if (packet.tokens.packetEstimated <= budget) break;
    apply();
    trimmed.push(label);
    packet = assemble();
  }
  if (packet.tokens.packetEstimated > budget) packet.trimmed.push(`still over budget (${packet.tokens.packetEstimated} > ${budget} estimated tokens)`);
  return packet;
}

export function formatContext(p: ContextPacket): string {
  const out: string[] = [];
  out.push(`tracehound context · ${p.snapshot.repo}@${p.snapshot.commitSha.slice(0, 7)} · analyzer ${p.snapshot.analyzerVersion}`);
  out.push(`issue: ${JSON.stringify(p.issue)}`);
  out.push(`terms: ${p.ranking.terms.join(", ") || "(none)"}`);
  out.push(`confidence: ${p.confidence.level.toUpperCase()} (heuristic, not a probability) · top ${p.confidence.topScore}, #2 ${p.confidence.secondScore}, margin ${p.confidence.margin} · ${p.confidence.note}`);
  if (p.advice) out.push(`⚠ ${p.advice}`);
  out.push("");
  out.push(`Components (${p.components.length})`);
  for (const c of p.components) {
    out.push(`  ${c.role === "match" ? `[${c.score}]` : "[hop]"} ${c.id}  ${c.name}  (${c.kind})`);
    out.push(`      ${c.reason}`);
    if (c.files) out.push(`      files: ${c.files.join(", ")}`);
    else out.push(`      files: ${c.fileCount} (list trimmed for budget)`);
  }
  out.push("");
  out.push(`Edges (${p.edges.length})`);
  for (const e of p.edges) out.push(`  ${e.source} -${e.kind}-> ${e.target}  [${e.confidenceLabel === "dynamic" ? "DYNAMIC ⚠" : e.confidenceLabel}]  "${e.label}"  ${e.evidence.join(", ")}`);
  out.push("");
  out.push(`Tests: ${p.testsNote}`);
  for (const t of p.tests) out.push(`  ${t.file} -> ${t.componentId}  (${t.importAt})`);
  out.push("");
  const pct = p.tokens.percentOfRepoEstimated !== undefined ? ` · ${p.tokens.percentOfRepoEstimated}% of the repo's ~${p.tokens.repoEstimated} estimated tokens` : "";
  out.push(`Size: ~${p.tokens.packetEstimated} estimated tokens (chars/4 of the JSON packet; budget ${p.tokens.budget})${pct}`);
  if (p.trimmed.length) out.push(`Trimmed: ${p.trimmed.join("; ")}`);
  return out.join("\n");
}
