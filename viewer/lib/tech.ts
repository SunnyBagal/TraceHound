import type { Component, Snapshot } from "./types";

/**
 * Technology icons, chosen from deterministic snapshot facts only (never from model-written
 * names or summaries). Each fact names the file (and line, when the analyzer recorded one) that
 * proves it; a component without a fact keeps its generic kind icon.
 */
export type Tech = "postgresql" | "prisma" | "redis" | "express" | "bun";

export const TECH_META: Record<Tech, { label: string; icon: string }> = {
  postgresql: { label: "PostgreSQL", icon: "postgresql.svg" },
  prisma: { label: "Prisma", icon: "prisma.svg" },
  redis: { label: "Redis", icon: "redis.svg" },
  express: { label: "Express", icon: "express.svg" },
  bun: { label: "Bun", icon: "bun.svg" },
};

/**
 * How the component relates to the technology. Only the first three may put a logo in a header
 * (decision 031): a component that merely uses a Redis client keeps its framework/runtime or kind
 * icon, and Redis stays in its stack list.
 */
export type TechRole = "is" | "framework" | "runtime" | "uses";

export interface TechFact {
  tech: Tech;
  role: TechRole;
  file: string;
  line?: number; // absent when the fact has no line (package.json scripts)
  /** what the fact is, in words */
  detail: string;
}

/** The fact behind the node/panel header icon: the first one that isn't a mere "uses". */
export function headerFact(facts: TechFact[]): TechFact | undefined {
  return facts.find((f) => f.role !== "uses");
}

/** "PostgreSQL · backend/prisma/schema.prisma:12" */
export function techTitle(fact: TechFact): string {
  return `${TECH_META[fact.tech].label} · ${fact.file}${fact.line ? `:${fact.line}` : ""}`;
}

const BUN_SCRIPT = /^package\.json script "([^"]+)": (bun\b.*)$/;

/** Every tech fact for a component: what it is (data store, broker), framework, clients it uses, runtime. */
export function techFacts(snapshot: Snapshot, component: Component): TechFact[] {
  const evidence = new Map(snapshot.evidence.map((e) => [e.id, e]));
  const at = (evidenceId: string) => {
    const ev = evidence.get(evidenceId);
    return ev ? { file: ev.file, line: ev.range.startLine } : undefined;
  };
  const own = new Set(component.files);
  const files = snapshot.files.filter((f) => own.has(f.path));
  const facts: TechFact[] = [];

  // Data stores: the Prisma datasource provider decides PostgreSQL; the resource itself is Prisma.
  if (component.resource?.tech === "prisma") {
    const pkgFiles = snapshot.files.filter((f) => own.has(f.path) || (component.package !== undefined && f.package === component.package));
    const ds = pkgFiles.find((f) => f.prismaDatasource)?.prismaDatasource;
    const dsAt = ds && at(ds.evidenceId);
    if (ds?.provider === "postgresql" && dsAt) facts.push({ tech: "postgresql", role: "is", ...dsAt, detail: `prisma datasource provider "postgresql"` });
    const client = files.flatMap((f) => f.clients).find((c) => c.tech === "prisma");
    const clientAt = client && at(client.evidenceId);
    if (clientAt) facts.push({ tech: "prisma", role: "is", ...clientAt, detail: `Prisma client ${client.variable}` });
    else if (dsAt) facts.push({ tech: "prisma", role: "is", ...dsAt, detail: "Prisma schema datasource" });
  }

  // The Redis broker node: its connection is opened by some client in the repo.
  if (component.resource?.tech === "redis") {
    const conn = component.resource.connection;
    const client = snapshot.files.flatMap((f) => f.clients).find((c) => c.tech === "redis" && c.connection === conn);
    const clientAt = client && at(client.evidenceId);
    if (clientAt) facts.push({ tech: "redis", role: "is", ...clientAt, detail: `Redis client ${client.variable} on ${conn}` });
  }

  // Express: a route of this component, registered in a file that imports a value from "express".
  for (const route of component.routes) {
    const file = snapshot.files.find((f) => f.path === route.file);
    const imp = file?.imports.find((i) => i.specifier === "express" && !i.typeOnly);
    const impAt = imp && at(imp.evidenceId);
    if (impAt) {
      facts.push({ tech: "express", role: "framework", ...impAt, detail: `import { ${imp.names.join(", ")} } from "express"; routes registered in ${route.file}` });
      break;
    }
  }

  // Redis clients or keys in the component's own files.
  if (component.resource?.tech !== "redis") {
    const client = files.flatMap((f) => f.clients).find((c) => c.tech === "redis");
    const op = files.flatMap((f) => f.redisOps).find((o) => o.key);
    const clientAt = client && at(client.evidenceId);
    const opAt = op && at(op.evidenceId);
    if (clientAt) facts.push({ tech: "redis", role: "uses", ...clientAt, detail: `Redis client ${client.variable}` });
    else if (opAt) facts.push({ tech: "redis", role: "uses", ...opAt, detail: `Redis ${op.op} ${op.key?.value ?? op.key?.raw ?? ""}`.trim() });
  }

  // Runtime: only when a package.json script runs the entry file with bun.
  for (const f of files) {
    const script = f.entryReason && BUN_SCRIPT.exec(f.entryReason);
    if (script) {
      facts.push({ tech: "bun", role: "runtime", file: f.package === "." ? "package.json" : `${f.package}/package.json`, detail: `script "${script[1]}": ${script[2]}` });
      break;
    }
  }
  return facts;
}
