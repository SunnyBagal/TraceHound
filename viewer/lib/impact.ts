import type { ImpactReport } from "@tracehound/analyzer/schema";

export type { ImpactReport };

/** How a component takes part in an impact report. */
export type ImpactRole = { role: "changed" } | { role: "affected"; depth: number; dynamic: boolean };

export function impactRoles(report: ImpactReport): Map<string, ImpactRole> {
  const roles = new Map<string, ImpactRole>();
  for (const a of report.affected) roles.set(a.id, { role: "affected", depth: a.depth, dynamic: a.dynamic });
  for (const c of report.changed) roles.set(c.id, { role: "changed" });
  return roles;
}

/** Edges that appear on some affected component's chain, and whether they're dynamic. */
export function impactEdges(report: ImpactReport): Map<string, { dynamic: boolean }> {
  const edges = new Map<string, { dynamic: boolean }>();
  for (const a of report.affected) for (const h of a.chain) edges.set(h.edgeId, { dynamic: h.confidenceLabel === "dynamic" });
  return edges;
}

/** ?impact=<name>, only when it's a safe file name. */
export function impactParam(search: string): string | null {
  const name = new URLSearchParams(search).get("impact");
  return name && /^[a-z0-9][a-z0-9-]*$/.test(name) ? name : null;
}
