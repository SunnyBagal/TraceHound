import type { Hop, ImpactReport, MappedFile } from "./impact.ts";

const STATUS_CODE: Record<MappedFile["status"], string> = { added: "A", modified: "M", deleted: "D", renamed: "R", copied: "C", "type-changed": "T" };
const short = (ref: string) => (/^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref);

function hopLine(h: Hop): string {
  const arrow = `${h.source} -${h.kind}-> ${h.target}`;
  const walk = h.walk === "reverse" ? `reverse: ${h.to} depends on ${h.from}` : "bidirectional: shared message contract";
  const label = h.confidenceLabel === "dynamic" ? "DYNAMIC ⚠" : h.confidenceLabel;
  return `${arrow}  [${label}]  "${h.label}"  ${h.evidence.file}:${h.evidence.line}  (${walk})`;
}

export function formatImpact(r: ImpactReport): string {
  const out: string[] = [];
  const name = (n: string, model: boolean) => `${n}${model ? "*" : ""}`;
  const anyModel = r.changed.some((c) => c.modelWrittenName) || r.affected.some((a) => a.modelWrittenName);

  out.push(`tracehound impact · ${r.repo} · ${short(r.base)}..${short(r.head)} · depth ${r.depth}`);
  out.push(`base snapshot: ${r.snapshot.path ?? "(in memory)"} (analyzer ${r.snapshot.analyzerVersion})`);
  out.push("");

  out.push(`Changed files (${r.files.length})`);
  for (const f of r.files) {
    const where = f.componentId ? `→ ${f.componentId}` : "→ unmapped";
    const rename = f.status === "renamed" ? `${f.basePath} → ${f.path}` : f.path;
    out.push(`  ${STATUS_CODE[f.status]}  ${rename}  ${where}${f.reason ? `  (${f.reason})` : ""}`);
  }
  out.push("");

  out.push(`Changed components (${r.changed.length})`);
  for (const c of r.changed) out.push(`  ${c.id}  ${name(c.name, c.modelWrittenName)}  [${c.files.join(", ")}]`);
  if (!r.changed.length) out.push("  none");
  out.push("");

  const dynamicCount = r.affected.filter((a) => a.dynamic).length;
  out.push(`Affected components (${r.affected.length})${dynamicCount ? ` · ${dynamicCount} reached only via a DYNAMIC ⚠ edge` : ""}`);
  for (const a of r.affected) {
    out.push(`  ${a.id}  ${name(a.name, a.modelWrittenName)}  depth ${a.depth}${a.dynamic ? "  ⚠ chain includes a dynamic edge (operand only known at runtime)" : ""}`);
    a.chain.forEach((h, i) => out.push(`    ${i + 1}. ${hopLine(h)}`));
  }
  if (!r.affected.length) out.push("  none");
  out.push("");

  out.push(`Unmapped files (${r.unmapped.length})`);
  for (const f of r.unmapped) out.push(`  ${STATUS_CODE[f.status]}  ${f.path}  (${f.reason})`);
  if (!r.unmapped.length) out.push("  none");
  out.push("");

  out.push(`Linked tests: ${r.linkedTests.length} linked test${r.linkedTests.length === 1 ? "" : "s"}`);
  for (const t of r.linkedTests) out.push(`  TESTS  ${t.file} -> ${t.componentId}  ${t.evidence.file}:${t.evidence.line}`);
  if (!r.linkedTests.length) out.push("  no *.test.ts, *.spec.ts or __tests__/** file imports a changed or affected component");
  out.push("");

  out.push(`Direction rule (docs/decisions.md 023): ${r.directionRule}`);
  if (anyModel) out.push("* model-written name (Nemotron Nano), prose not verified; ids are deterministic");
  return out.join("\n");
}
