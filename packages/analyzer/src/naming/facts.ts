// What the naming model is allowed to see about one component: structure and identifiers only,
// never source text or snippets. Every string here comes from an extracted fact.
import type { Component, FileFacts, Snapshot } from "../schema.ts";

export interface NamingFacts {
  currentName: string;
  kind: Component["kind"];
  fileCount: number;
  files: string[];
  routeCount: number;
  routes: string[];
  entryPoint?: {
    reason: string;
    servesHttp: boolean;
    mountsRouters: string[]; // "authRouter (Auth API)"
    startupCalls: string[]; // "connectRedis() from Redis RPC Bridge", "app.listen()"
    summary: string; // "mounts routers authRouter (Auth API), exchangeRouter (Exchange API); starts connectRedis() …"
  };
  redis: { produces: string[]; consumes: string[]; keys?: string[] };
  prismaModels: string[];
  envVars: string[];
  outgoing: { to: string; relationship: string; via: string; confidence: string }[];
  incoming: { from: string; relationship: string; via: string; confidence: string }[];
  warnings: string[];
}

const keyLabel = (o: FileFacts["redisOps"][number]) => o.key?.value ?? `<dynamic: ${o.key?.raw ?? "?"}>`;

export function componentFacts(snapshot: Snapshot, component: Component): NamingFacts {
  const nameOf = (id: string | undefined) => (id ? (snapshot.components.find((c) => c.id === id)?.naming.heuristicName ?? id) : "?");
  const componentOfFile = new Map(snapshot.components.flatMap((c) => c.files.map((f) => [f, c.id] as const)));
  const own = new Set(component.files);
  const files = snapshot.files.filter((f) => own.has(f.path));

  // Entry-point facts: which routers from other components it mounts, what it calls on load.
  let entryPoint: NamingFacts["entryPoint"];
  const entryFile = files.find((f) => f.isEntry);
  if (entryFile) {
    const mountsRouters = [
      ...new Set(
        files.flatMap((f) =>
          f.mounts
            .map((m) => ({ file: m.router.split("#")[0]!, variable: m.router.split("#")[1] ?? m.router }))
            .filter((r) => !own.has(r.file))
            .map((r) => `${r.variable} (${nameOf(componentOfFile.get(r.file))})`),
        ),
      ),
    ];
    // Only calls into other components; route/middleware wiring (app.use/get) is already
    // covered by routes and mounts, and listen() by servesHttp.
    const startupCalls = files.flatMap((f) =>
      f.startupCalls.flatMap((c) => {
        const root = c.callee.split(".")[0]!;
        const from = f.imports.find((i) => i.target && i.names.includes(root));
        const owner = from?.target ? componentOfFile.get(from.target) : undefined;
        return owner && owner !== component.id ? [`${c.callee}() from ${nameOf(owner)}`] : [];
      }),
    );
    const servesHttp = files.some((f) => f.listens.length > 0);
    const parts = [
      mountsRouters.length ? `mounts routers ${mountsRouters.join(", ")}` : "",
      startupCalls.length ? `on startup calls ${startupCalls.join(", ")}` : "",
      servesHttp ? "listens for HTTP" : "",
    ].filter(Boolean);
    entryPoint = { reason: entryFile.entryReason ?? "entry point", servesHttp, mountsRouters, startupCalls, summary: parts.join("; ") || "process entry point" };
  }

  const ops = files.flatMap((f) => f.redisOps);
  const edgeFacts = <K extends "to" | "from">(dir: K) =>
    snapshot.edges
      .filter((e) => (dir === "to" ? e.source : e.target) === component.id)
      .map((e) => ({ [dir]: nameOf(dir === "to" ? e.target : e.source), relationship: e.kind, via: e.label, confidence: e.confidenceLabel }) as { [P in K]: string } & { relationship: string; via: string; confidence: string });

  return {
    currentName: component.naming.heuristicName,
    kind: component.kind,
    fileCount: component.files.length,
    files: component.files,
    routeCount: component.routes.length,
    routes: component.routes.map((r) => `${r.method} ${r.path}`),
    entryPoint,
    redis: {
      produces: [...new Set(ops.filter((o) => o.role === "produce").map(keyLabel))],
      consumes: [...new Set(ops.filter((o) => o.role === "consume").map(keyLabel))],
      ...(component.resource?.tech === "redis" ? { keys: component.resource.keys } : {}),
    },
    prismaModels: component.resource?.models ?? [],
    envVars: component.envVars,
    outgoing: edgeFacts("to"),
    incoming: edgeFacts("from"),
    warnings: snapshot.warnings.filter((w) => w.componentId === component.id).map((w) => w.message),
  };
}
