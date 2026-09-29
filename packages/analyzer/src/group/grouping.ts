// Responsibility-based grouping of files into components. Pure: FileFacts in, components out.
import type { Component, ComponentKind, FileFacts } from "../schema.ts";
import { packageTitle, responsibilityTokens, slug, stem, titleCase, tokens } from "./naming.ts";

export interface GroupingPackage {
  root: string;
  name: string;
}

export interface GroupingOptions {
  min: number;
  max: number;
}

export interface GroupingResult {
  components: Component[];
  fileToComponent: Map<string, string>;
  redisResourceByConnection: Map<string, string>;
  prismaResourceByPackage: Map<string, string>;
}

interface Cluster {
  id: string;
  name: string;
  kind: ComponentKind;
  package?: string;
  anchor?: string;
  matchTokens: string[];
  files: string[];
  reasons: Map<string, string>;
  resource?: NonNullable<Component["resource"]>;
  note?: string; // resource subtitle, computed from ops across the repo
}

const DEFAULT_OPTIONS: GroupingOptions = { min: 5, max: 10 };
const QUEUE_OPS = /^(l|r|bl|br)(push|pop|pushx|move|poplpush)$|^(s|p)?(publish|subscribe)$|^x(add|read|readgroup)$/i;
const PRISMA_ENGINES: Record<string, string> = { postgresql: "Postgres", mysql: "MySQL", sqlite: "SQLite", sqlserver: "SQL Server", mongodb: "MongoDB", cockroachdb: "CockroachDB" };

export function groupComponents(files: FileFacts[], packages: GroupingPackage[], options: GroupingOptions = DEFAULT_OPTIONS): GroupingResult {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const byPath = new Map(sorted.map((f) => [f.path, f]));
  const pkgName = (root: string) => packages.find((p) => p.root === root)?.name ?? root;
  const clusters: Cluster[] = [];
  const usedIds = new Set<string>();
  const uniqueId = (base: string) => {
    let id = base;
    for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
    usedIds.add(id);
    return id;
  };
  const assign = (cluster: Cluster, file: string, reason: string) => {
    cluster.files.push(file);
    cluster.reasons.set(file, reason);
  };

  // 1. Infrastructure resources: one Redis node per connection, one Prisma DB per package.
  const redisResourceByConnection = new Map<string, string>();
  const redisConnections = [...new Set(sorted.flatMap((f) => [...f.clients.filter((c) => c.tech === "redis").map((c) => c.connection), ...f.redisOps.map((o) => o.connection)]))].sort();
  for (const connection of redisConnections) {
    const ops = sorted.flatMap((f) => f.redisOps.filter((o) => o.connection === connection));
    const isQueue = ops.some((o) => QUEUE_OPS.test(o.op));
    const keys = [...new Set(ops.filter((o) => o.key).map((o) => o.key!.value ?? "<dynamic>"))].sort();
    const styles = [
      ops.some((o) => /^(l|r|bl|br)/i.test(o.op) && /(push|pop|move)/i.test(o.op)) ? "lists" : "",
      ops.some((o) => /(publish|subscribe)$/i.test(o.op)) ? "pub/sub" : "",
      ops.some((o) => /^x/i.test(o.op)) ? "streams" : "",
    ].filter(Boolean);
    const cluster: Cluster = {
      id: uniqueId(`redis:${slug(connection)}`),
      name: redisConnections.length > 1 ? `Redis (${connection})` : "Redis",
      kind: isQueue ? "queue" : "cache",
      matchTokens: ["redis"],
      files: [],
      reasons: new Map(),
      resource: { tech: "redis", connection, keys },
      note: `Redis ${styles.length ? styles.join(" + ") : "key-value"}${keys.length ? ` · ${keys.join(", ")}` : ""}`,
    };
    clusters.push(cluster);
    redisResourceByConnection.set(connection, cluster.id);
  }

  const prismaResourceByPackage = new Map<string, string>();
  const prismaPackages = [...new Set(sorted.filter((f) => f.language === "prisma" || f.clients.some((c) => c.tech === "prisma")).map((f) => f.package))].sort();
  for (const pkg of prismaPackages) {
    const pkgFiles = sorted.filter((f) => f.package === pkg);
    const provider = pkgFiles.find((f) => f.prismaDatasource)?.prismaDatasource?.provider;
    const engineName = provider ? (PRISMA_ENGINES[provider] ?? titleCase(tokens(provider))) : "Database";
    const connection = pkgFiles.flatMap((f) => f.clients).find((c) => c.tech === "prisma")?.connection ?? "default";
    const cluster: Cluster = {
      id: uniqueId(`db:${slug(pkg === "." ? "root" : pkg)}`),
      name: prismaPackages.length > 1 ? `${engineName} (${packageTitle(pkgName(pkg))})` : engineName,
      kind: "db",
      package: pkg,
      matchTokens: ["prisma", "db", "database", "schema", ...(provider ? [provider] : [])],
      files: [],
      reasons: new Map(),
      resource: { tech: "prisma", engine: provider, connection, models: [...new Set(pkgFiles.flatMap((f) => f.prismaModels.map((m) => m.name)))].sort() },
    };
    for (const f of pkgFiles.filter((f) => f.language === "prisma")) assign(cluster, f.path, "Prisma schema");
    clusters.push(cluster);
    prismaResourceByPackage.set(pkg, cluster.id);
  }

  const resourceForClient = (f: FileFacts): Cluster | undefined => {
    const client = f.clients[0];
    if (!client) return undefined;
    const id = client.tech === "redis" ? redisResourceByConnection.get(client.connection) : prismaResourceByPackage.get(f.package);
    return clusters.find((c) => c.id === id);
  };

  // A module that only exists to construct and export a client belongs to the resource itself.
  const isClientOnlyModule = (f: FileFacts) => {
    if (f.clients.length === 0 || f.routes.length > 0 || f.isEntry) return false;
    const exportedValues = f.symbols.filter((s) => s.exported && s.kind !== "type" && s.kind !== "interface").map((s) => s.name);
    const exportedClients = new Set(f.clients.filter((c) => c.exported).map((c) => c.variable));
    return exportedValues.length > 0 && exportedValues.every((name) => exportedClients.has(name));
  };

  // 2. Per package: anchors → reach sets → assignment.
  for (const pkg of [...new Set(sorted.map((f) => f.package))].sort()) {
    const pkgTs = sorted.filter((f) => f.package === pkg && f.language === "ts");
    if (pkgTs.length === 0) continue;
    const pkgTitle = packageTitle(pkgName(pkg));
    const pkgSlug = slug(pkg === "." ? pkgName(pkg) : pkg);
    const anchors: Cluster[] = [];
    const stoppers = new Set<string>();

    for (const f of pkgTs.filter(isClientOnlyModule)) {
      const resource = resourceForClient(f);
      if (!resource) continue;
      assign(resource, f.path, `only constructs and exports the ${resource.name} client (${f.clients.map((c) => c.variable).join(", ")})`);
      stoppers.add(f.path);
    }

    const addAnchor = (f: FileFacts, name: string, kind: ComponentKind, reason: string, matchTokens: string[]) => {
      const cluster: Cluster = { id: uniqueId(`${pkgSlug}:${slug(name)}`), name, kind, package: pkg, anchor: f.path, matchTokens, files: [], reasons: new Map() };
      assign(cluster, f.path, reason);
      anchors.push(cluster);
      stoppers.add(f.path);
    };
    for (const f of pkgTs) {
      if (stoppers.has(f.path)) continue;
      if (f.isEntry) {
        const serves = f.routes.length > 0 || f.listens.length > 0;
        const consumes = f.redisOps.some((o) => o.role === "consume");
        const kind: ComponentKind = serves ? "api" : consumes ? "worker" : "service";
        const suffix = serves ? "Server" : consumes ? "Worker" : "App";
        addAnchor(f, `${pkgTitle} ${suffix}`, kind, `entry point (${f.entryReason ?? "listens for connections"})`, responsibilityTokens(f.path));
      } else if (f.routes.length > 0) {
        const words = responsibilityTokens(f.path);
        addAnchor(f, words.length ? `${titleCase(words)} API` : `${pkgTitle} API`, "api", `registers ${f.routes.length} HTTP route(s)`, words);
      } else if (f.clients.length > 0) {
        const tech = [...new Set(f.clients.map((c) => c.tech))].join("/");
        addAnchor(f, titleCase(tokens(stem(f.path))), "service", `constructs ${tech} client(s) and wraps them`, responsibilityTokens(f.path));
      }
    }

    // A package with nothing that marks responsibility is one library component.
    if (anchors.length === 0) {
      const cluster: Cluster = { id: uniqueId(`${pkgSlug}:${slug(pkgTitle)}`), name: pkgTitle, kind: "library", package: pkg, matchTokens: [], files: [], reasons: new Map() };
      for (const f of pkgTs.filter((f) => !stoppers.has(f.path))) assign(cluster, f.path, "package has no entry points, routes or clients");
      if (cluster.files.length) clusters.push(cluster);
      continue;
    }

    // Reach: follow resolved same-package imports from each anchor, stopping at other anchors.
    const owners = new Map<string, Cluster[]>();
    for (const anchor of anchors) {
      const queue = [anchor.anchor!];
      const seen = new Set(queue);
      while (queue.length) {
        const current = byPath.get(queue.shift()!);
        for (const imp of current?.imports ?? []) {
          const target = imp.target;
          if (!target || seen.has(target) || stoppers.has(target) || byPath.get(target)?.package !== pkg) continue;
          seen.add(target);
          queue.push(target);
          owners.set(target, [...(owners.get(target) ?? []), anchor]);
        }
      }
    }

    let shared: Cluster | undefined;
    const toShared = (file: string, reason: string) => {
      shared ??= { id: uniqueId(`${pkgSlug}:shared`), name: `${pkgTitle} Shared`, kind: "library", package: pkg, matchTokens: [], files: [], reasons: new Map() };
      assign(shared, file, reason);
    };
    const pkgResources = clusters.filter((c) => c.resource && (c.package === pkg || c.resource.tech === "redis"));
    const affinity = (file: string, candidates: Cluster[]) => {
      const words = new Set(responsibilityTokens(file));
      const matches = candidates.filter((c) => c.matchTokens.some((t) => words.has(t)));
      return matches.length === 1 ? matches[0] : undefined;
    };

    for (const f of pkgTs) {
      if (stoppers.has(f.path)) continue;
      const users = owners.get(f.path) ?? [];
      if (users.length === 1) {
        assign(users[0]!, f.path, `only reachable from ${users[0]!.name} (${users[0]!.anchor})`);
        continue;
      }
      if (users.length > 1) {
        const names = users.map((u) => u.name).join(", ");
        const match = affinity(f.path, users);
        if (match) assign(match, f.path, `used by ${names}; file name matches ${match.name}`);
        else toShared(f.path, `used by ${names}`);
        continue;
      }
      const match = affinity(f.path, [...anchors, ...pkgResources]);
      if (match) assign(match, f.path, `not imported by any entry point; file name matches ${match.name}`);
      else if (anchors.length === 1) assign(anchors[0]!, f.path, `not imported by any entry point; only component in package ${pkgTitle}`);
      else toShared(f.path, "not imported by any entry point; no single owner");
    }

    clusters.push(...anchors);
    if (shared) clusters.push(shared);
  }

  // 3. Keep the canvas readable: 5–10 components.
  enforceBounds(clusters, byPath, options, uniqueId);

  const fileToComponent = new Map<string, string>();
  for (const c of clusters) for (const file of c.files) fileToComponent.set(file, c.id);
  const prefixes = routePrefixes(sorted);
  const components = clusters.filter((c) => c.files.length > 0 || c.resource).map((c) => toComponent(c, byPath, prefixes));
  return { components, fileToComponent, redisResourceByConnection, prismaResourceByPackage };
}

function coupling(a: Cluster, b: Cluster, byPath: Map<string, FileFacts>): number {
  const inA = new Set(a.files);
  const inB = new Set(b.files);
  let n = 0;
  for (const file of a.files) n += byPath.get(file)?.imports.filter((i) => i.target && inB.has(i.target)).length ?? 0;
  for (const file of b.files) n += byPath.get(file)?.imports.filter((i) => i.target && inA.has(i.target)).length ?? 0;
  return n;
}

function enforceBounds(clusters: Cluster[], byPath: Map<string, FileFacts>, { min, max }: GroupingOptions, uniqueId: (base: string) => string) {
  const movable = () => clusters.filter((c) => !c.resource);

  while (clusters.length > max) {
    const [smallest] = movable().sort((a, b) => a.files.length - b.files.length || a.id.localeCompare(b.id));
    if (!smallest) break;
    const siblings = movable().filter((c) => c !== smallest);
    const samePackage = siblings.filter((c) => c.package === smallest.package);
    const pool = samePackage.length ? samePackage : siblings;
    const [target] = pool.sort((a, b) => coupling(smallest, b, byPath) - coupling(smallest, a, byPath) || b.files.length - a.files.length || a.id.localeCompare(b.id));
    if (!target) break;
    for (const file of smallest.files) target.reasons.set(file, `${smallest.reasons.get(file)}; merged from ${smallest.name} (component limit ${max})`);
    target.files.push(...smallest.files);
    clusters.splice(clusters.indexOf(smallest), 1);
  }

  while (clusters.length < min) {
    const candidates = movable()
      .map((c) => ({ c, dirs: new Set(c.files.map(dirOf)) }))
      .filter(({ dirs }) => dirs.size > 1)
      .sort((a, b) => b.c.files.length - a.c.files.length || a.c.id.localeCompare(b.c.id));
    const pick = candidates[0];
    if (!pick) break;
    const keepDir = dirOf(pick.c.anchor ?? pick.c.files[0]!);
    for (const dir of [...pick.dirs].sort()) {
      if (dir === keepDir) continue;
      const moved = pick.c.files.filter((f) => dirOf(f) === dir);
      const words = tokens(dir.split("/").pop() ?? dir);
      const name = `${pick.c.name} ${titleCase(words)}`;
      const split: Cluster = { id: uniqueId(`${pick.c.id}-${slug(dir.split("/").pop() ?? dir)}`), name, kind: "library", package: pick.c.package, matchTokens: words, files: [], reasons: new Map() };
      for (const f of moved) split.reasons.set(f, `${pick.c.reasons.get(f)}; split out of ${pick.c.name} by directory ${dir} (component minimum ${min})`);
      split.files.push(...moved);
      pick.c.files = pick.c.files.filter((f) => dirOf(f) !== dir);
      clusters.push(split);
      if (clusters.length >= min) break;
    }
  }
}

const dirOf = (file: string) => file.split("/").slice(0, -1).join("/") || ".";

/** Router key → full mount prefix, from `parent.use("/prefix", router)` facts. */
function routePrefixes(files: FileFacts[]): Map<string, string> {
  const parentOf = new Map<string, { parent: string; prefix?: string }>();
  for (const f of files) for (const m of f.mounts) parentOf.set(m.router, { parent: m.parent, prefix: m.prefix });
  const result = new Map<string, string>();
  const resolve = (router: string, seen: Set<string>): string => {
    const mount = parentOf.get(router);
    if (!mount || seen.has(router)) return "";
    seen.add(router);
    return joinPath(resolve(mount.parent, seen), mount.prefix ?? "");
  };
  for (const router of parentOf.keys()) result.set(router, resolve(router, new Set()));
  return result;
}

function joinPath(a: string, b: string): string {
  const joined = `${a.replace(/\/$/, "")}/${b.replace(/^\//, "")}`;
  return joined === "/" ? "" : joined.replace(/\/$/, "");
}

function toComponent(c: Cluster, byPath: Map<string, FileFacts>, prefixes: Map<string, string>): Component {
  const files = [...c.files].sort();
  const facts = files.map((f) => byPath.get(f)).filter((f): f is FileFacts => f !== undefined);
  const routes = facts.flatMap((f) =>
    f.routes.map((r) => ({ method: r.method, path: joinPath(prefixes.get(r.router) ?? "", r.path) || "/", file: f.path, evidenceId: r.evidenceId })),
  );
  const envVars = [...new Set(facts.flatMap((f) => f.envReads.map((e) => e.name)))].sort();

  const entryPoints: Component["entryPoints"] = [];
  for (const f of facts) {
    if (f.isEntry) entryPoints.push({ file: f.path, reason: f.entryReason ?? "entry point" });
    for (const op of f.redisOps.filter((o) => o.role === "consume")) {
      entryPoints.push({ file: f.path, symbol: `${op.op} ${op.key?.value ?? op.key?.raw ?? ""}`.trim(), reason: "queue consumer" });
    }
  }
  for (const r of routes) entryPoints.push({ file: r.file, symbol: `${r.method} ${r.path}`, reason: "HTTP route" });
  if (c.kind === "service" && c.anchor) {
    for (const s of byPath.get(c.anchor)?.symbols.filter((s) => s.exported && s.kind === "function") ?? []) {
      entryPoints.push({ file: c.anchor, symbol: s.name, reason: "exported function" });
    }
  }

  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    subtitle: c.note ?? subtitle(c, facts, routes),
    package: c.package,
    files,
    entryPoints,
    membership: files.map((file) => ({ file, reason: c.reasons.get(file) ?? "" })),
    routes,
    envVars,
    counts: { files: files.length, routes: routes.length, envVars: envVars.length },
    resource: c.resource,
  };
}

function subtitle(c: Cluster, facts: FileFacts[], routes: Component["routes"]): string {
  const redisOps = facts.flatMap((f) => f.redisOps);
  const keyList = (ops: typeof redisOps) => [...new Set(ops.map((o) => o.key?.value ?? "dynamic key"))].join(", ");
  switch (c.kind) {
    case "api": {
      const sample = routes.slice(0, 2).map((r) => `${r.method} ${r.path}`).join(", ");
      if (c.anchor && facts.find((f) => f.path === c.anchor)?.isEntry) {
        return `HTTP server entry · ${routes.length ? `${sample}` : "mounts routers"}`;
      }
      return routes.length > 2 ? `${sample} +${routes.length - 2} more` : sample || "HTTP routes";
    }
    case "worker": {
      const consumed = redisOps.filter((o) => o.role === "consume");
      return consumed.length ? `Consumes ${keyList(consumed)}` : "Background process";
    }
    case "service": {
      const produced = redisOps.filter((o) => o.role === "produce");
      const consumed = redisOps.filter((o) => o.role === "consume");
      const parts = [produced.length ? `pushes ${keyList(produced)}` : "", consumed.length ? `awaits ${keyList(consumed)}` : ""].filter(Boolean);
      return parts.length ? capitalize(parts.join(" · ")) : `${facts.length} modules`;
    }
    case "library": {
      return `Shared modules · ${facts.map((f) => stem(f.path)).slice(0, 3).join(", ")}${facts.length > 3 ? "…" : ""}`;
    }
    case "queue":
    case "cache":
      return "Redis";
    case "db": {
      const models = c.resource?.models ?? [];
      return `${c.name} via Prisma${models.length ? ` · models: ${models.join(", ")}` : ""}`;
    }
  }
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
