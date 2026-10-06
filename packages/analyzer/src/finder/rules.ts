// The finder's rules (decision 051): a pure function of a snapshot and its probes. No model, no
// I/O. Each rule emits narrow questions for the reproduce stage; none of them says "this is a bug".
import type { Snapshot } from "../schema.ts";
import { FINDER_VERSION, type Excerpt, type FinderReport, type Hypothesis, type RuleFamily } from "./hypothesis.ts";
import type { Probes, RouteProbe } from "./probe.ts";

export const RULES: Record<RuleFamily, { id: string; text: string }> = {
  "route-without-auth": {
    id: "route-without-auth@1",
    text:
      "A route with no auth signal on any mount chain (route middleware, use() on its router or a parent before it, " +
      "the mount call, or the handler body and one function the handler passes the request to), in a repo where at " +
      "least one other route has one. OPTIONS/HEAD and public-looking paths (health, login, signup, webhooks, …) are skipped.",
  },
  "payload-field-missing": {
    id: "payload-field-missing@1",
    text:
      "A BullMQ processor reads job.data.<field> without a fallback, and a producer of the same queue adds a payload " +
      "whose type has no such field. Producers whose payload type is unknown are skipped; when the processor branches " +
      "on job.name, it fires only if no producer sends the field.",
  },
  "request-to-fetch": {
    id: "request-to-fetch@1",
    text:
      "A value from a request's body, query or route params reaches the first argument of an outbound HTTP call " +
      "(fetch, axios, got, ky, undici, node-fetch, superagent, http(s).request/get), through local variables, up to " +
      "two function calls and at most one BullMQ queue (then up to two calls in its processor).",
  },
};

/** Path segments that are public by design. */
const PUBLIC_SEGMENT = /^(health|healthz|healthcheck|status|ping|ready|readyz|live|livez|metrics|version|login|signin|sign-in|logout|signout|sign-out|signup|sign-up|register|callback|webhooks?|public|docs|openapi(\.json)?|swagger|favicon\.ico|auth|oauth)$/i;

const isPublicPath = (p: string) => p === "/" || p.split("/").some((seg) => PUBLIC_SEGMENT.test(seg));

const componentOf = (snapshot: Snapshot) => {
  const byFile = new Map(snapshot.components.flatMap((c) => c.files.map((f) => [f, c.id] as const)));
  return (file: string) => byFile.get(file);
};

const uniq = <T>(xs: (T | undefined)[]) => [...new Set(xs.filter((x): x is T => x !== undefined))];

/** The graph a hypothesis stands on: edges citing its evidence, their ends, and the components of its files. */
function graphRefs(snapshot: Snapshot, component: (f: string) => string | undefined, evidenceIds: string[], files: string[]): Hypothesis["graph"] {
  const edges = snapshot.edges.filter((e) => e.evidenceIds.some((id) => evidenceIds.includes(id)));
  return {
    componentIds: uniq([...files.map(component), ...edges.flatMap((e) => [e.source, e.target])]),
    edgeIds: edges.map((e) => e.id),
    evidenceIds,
  };
}

function routeWithoutAuth(snapshot: Snapshot, probes: Probes, component: (f: string) => string | undefined, notes: string[]): Hypothesis[] {
  const guarded = probes.routes.filter((r) => r.ownGuards.length || r.chains.some((c) => c.guards.length));
  if (!guarded.length) {
    if (probes.routes.length) notes.push("route-without-auth: no route has an auth signal, so the rule is silent (it compares routes with each other).");
    return [];
  }
  const out: Hypothesis[] = [];
  for (const r of probes.routes) {
    if (r.ownGuards.length || ["OPTIONS", "HEAD"].includes(r.method)) continue;
    const open = r.chains.filter((c) => !c.guards.length && !isPublicPath(c.fullPath));
    const chain = open[0];
    if (!chain) continue;
    const excerpts: Excerpt[] = [r.routeExcerpt, ...(r.handlerExcerpt ? [r.handlerExcerpt] : [])];
    const ids = [r.evidenceId, ...chain.mountEvidenceIds];
    out.push({
      id: `route-without-auth:${r.evidenceId}`,
      family: "route-without-auth",
      rule: RULES["route-without-auth"],
      question: `Does ${r.method} ${chain.fullPath} respond with data or perform its action for a caller who sends no credentials?`,
      statedInput: `${r.method === "ALL" ? "GET" : r.method} ${chain.fullPath} with no Authorization header, no cookies and no API key` +
        (r.requestFields.length ? `; request fields the handler reads: ${r.requestFields.join(", ")}` : ""),
      graph: graphRefs(snapshot, component, ids, [r.file]),
      excerpts,
    });
  }
  return out;
}

function payloadFieldMissing(snapshot: Snapshot, probes: Probes, component: (f: string) => string | undefined): Hypothesis[] {
  const out: Hypothesis[] = [];
  const evidence = new Map(snapshot.evidence.map((e) => [e.id, e]));
  for (const c of probes.consumers) {
    const producers = probes.producers.filter((p) => p.queue === c.queue);
    if (!producers.length) continue;
    // one read per field: the first unguarded one; a field read only with fallbacks is skipped
    const fields = new Map<string, (typeof c.reads)[number]>();
    for (const read of c.reads) if (!read.guarded && !fields.has(read.field)) fields.set(read.field, read);
    for (const [field, read] of fields) {
      const lacking = producers.filter((p) => p.keys !== null && !p.keys.includes(field));
      if (!lacking.length) continue;
      // a processor that branches on job.name may read this field only for another job's payload
      if (c.filtersJobName && (lacking.length < producers.length || producers.some((p) => p.keys === null))) continue;
      const groups = c.filtersJobName ? [lacking] : lacking.map((p) => [p]);
      for (const ps of groups) {
        const ids = [...ps.map((p) => p.evidenceId), c.evidenceId];
        const sent = ps.map((p) => `{ ${p.keys!.join(", ")} }`).join(" or ");
        const where = ps.map((p) => `${evidence.get(p.evidenceId)!.file}:${p.excerpt.startLine}`).join(", ");
        out.push({
          id: `payload-field-missing:${c.evidenceId}:${field}:${ps.map((p) => p.evidenceId).join("+")}`,
          family: "payload-field-missing",
          rule: RULES["payload-field-missing"],
          question: `When the job added at ${where} reaches the processor of queue "${c.queue}", which reads job.data.${field}, does the processor behave correctly with that field absent?`,
          statedInput: `A job on queue "${c.queue}"${ps[0]!.jobName ? ` named "${ps[0]!.jobName}"` : ""} whose data has the producer's keys ${sent} and no "${field}"`,
          graph: graphRefs(snapshot, component, ids, [...ps.map((p) => p.excerpt.file), c.excerpt.file]),
          excerpts: [...ps.map((p) => p.excerpt), c.excerpt, read.excerpt],
        });
      }
    }
  }
  return out;
}

function requestToFetch(snapshot: Snapshot, probes: Probes, component: (f: string) => string | undefined): Hypothesis[] {
  const out: Hypothesis[] = [];
  const pathOf = (r: RouteProbe) => r.chains[0]?.fullPath ?? r.path;
  for (const r of probes.routes) {
    r.sinks.forEach((s, n) => {
      const ids = uniq([r.evidenceId, ...(r.chains[0]?.mountEvidenceIds ?? []), s.queue?.produceEvidenceId, s.queue?.consumeEvidenceId]);
      const via = s.queue ? ` through queue "${s.queue.name}" (job data ${s.queue.fields.join(", ")})` : "";
      out.push({
        id: `request-to-fetch:${r.evidenceId}:${n}`,
        family: "request-to-fetch",
        rule: RULES["request-to-fetch"],
        question: `Can a caller of ${r.method} ${pathOf(r)} choose the URL or host of the outbound ${s.callee} call${via}?`,
        statedInput: `${r.method === "ALL" ? "GET" : r.method} ${pathOf(r)} with a request value set to a URL whose host the caller chooses (for example http://127.0.0.1:9/)` +
          (r.requestFields.length ? `; request fields the handler reads: ${r.requestFields.join(", ")}` : ""),
        graph: graphRefs(snapshot, component, ids, [r.file, ...s.trail.map((t) => t.file), s.excerpt.file]),
        excerpts: [r.routeExcerpt, ...s.trail, s.excerpt],
      });
    });
  }
  return out;
}

/** All rules over one snapshot and its probes. Pure: the same inputs give the same report. */
export function applyRules(snapshot: Snapshot, probes: Probes, meta: { generatedAt: string; config?: string }): FinderReport {
  const component = componentOf(snapshot);
  const notes: string[] = [];
  const hypotheses = [
    ...routeWithoutAuth(snapshot, probes, component, notes),
    ...payloadFieldMissing(snapshot, probes, component),
    ...requestToFetch(snapshot, probes, component),
  ];
  const counts = Object.fromEntries(Object.keys(RULES).map((f) => [f, hypotheses.filter((h) => h.family === f).length])) as FinderReport["counts"];
  return {
    finderVersion: FINDER_VERSION,
    analyzerVersion: snapshot.analyzerVersion,
    repo: { name: snapshot.repo.name, commitSha: snapshot.repo.commitSha },
    ...(meta.config && { config: meta.config }),
    generatedAt: meta.generatedAt,
    counts,
    notes,
    hypotheses,
  };
}
