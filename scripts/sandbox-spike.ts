// Nebius Token Factory Sandboxes (Contree) spike: one disposable run, driven from TypeScript over REST.
// Usage: node --env-file=.env scripts/sandbox-spike.ts   (needs NEBIUS_API_KEY and NEBIUS_AI_PROJECT)
// API: https://eu-north.nebius.computer/static/api.yaml — base https://api.tokenfactory.nebius.com/sandboxes/v1,
// auth = `Authorization: Bearer <NEBIUS_API_KEY>` + `Project: <project id>`.

const BASE = process.env.CONTREE_URL ?? "https://api.tokenfactory.nebius.com/sandboxes/v1";
const token = process.env.CONTREE_TOKEN ?? process.env.NEBIUS_API_KEY;
const project = process.env.CONTREE_PROJECT ?? process.env.NEBIUS_AI_PROJECT;
if (!token || !project) {
  console.error("✖ need NEBIUS_API_KEY (or CONTREE_TOKEN) and NEBIUS_AI_PROJECT (or CONTREE_PROJECT); every Sandboxes call 400s without a Project header");
  process.exit(1);
}
const headers = { authorization: `Bearer ${token}`, Project: project, "content-type": "application/json" };

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status}: ${text.slice(0, 400)}`);
  return (text ? JSON.parse(text) : {}) as T;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One shell run answers all spike questions; each probe prints a tagged line and never aborts the rest.
const COMMAND = [
  "echo hello",
  "echo \"[os] $(. /etc/os-release 2>/dev/null && echo $PRETTY_NAME || uname -a)\"",
  "if command -v bun >/dev/null; then echo \"[bun] preinstalled $(bun --version)\"; else echo '[bun] not in image, installing'; " +
    "(command -v curl >/dev/null || (apt-get update -qq && apt-get install -y -qq curl unzip >/dev/null 2>&1)); " +
    "curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1 && echo \"[bun] installed $($HOME/.bun/bin/bun --version)\" || echo '[bun] install FAILED'; fi",
  "echo \"[net] npm registry: $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://registry.npmjs.org/ || echo unreachable)\"",
  "echo \"[redis] $(command -v redis-server >/dev/null && redis-server --version || echo 'redis-server not in image')\"",
].join("; ");

type Operation = { uuid?: string; id?: string; status?: string; metadata?: { result?: InstanceResult } & Record<string, unknown>; error?: unknown } & Record<string, unknown>;
type InstanceResult = { state?: { exit_code?: number; signal?: number }; stdout?: unknown; stderr?: unknown; resources?: Record<string, unknown> } & Record<string, unknown>;

const t0 = performance.now();
const since = () => `${((performance.now() - t0) / 1000).toFixed(1)}s`;

const who = await api<Record<string, unknown>>("GET", "/whoami");
console.log(`[${since()}] whoami ok; permission keys: ${Object.keys((who.permissions as object) ?? {}).slice(0, 12).join(", ")}`);

const images = await api<{ images?: { tag?: string; tags?: string[]; uuid?: string }[] } | { tag?: string }[]>("GET", "/images?limit=200");
const list = (Array.isArray(images) ? images : (images.images ?? [])) as { tag?: string; tags?: string[]; uuid?: string }[];
const tags = list.flatMap((i) => i.tags ?? (i.tag ? [i.tag] : []));
console.log(`[${since()}] ${list.length} public images; tags: ${tags.slice(0, 25).join(", ")}${tags.length > 25 ? " …" : ""}`);
const pick = tags.find((t) => /bun/i.test(t)) ?? tags.find((t) => /^(ubuntu|debian)/i.test(t)) ?? "ubuntu:latest";
const image = `tag:${pick.replace(/^tag:/, "")}`;

const spawned = await api<Operation>("POST", "/instances", {
  image,
  command: COMMAND,
  shell: true,
  disposable: true, // nothing is kept: the sandbox is torn down when the run ends
  timeout: 180,
  networking: { enabled: true },
});
const opId = spawned.uuid ?? spawned.id ?? (spawned as { operation_id?: string }).operation_id;
console.log(`[${since()}] spawned on ${image}; operation ${opId}`);
if (!opId) throw new Error(`no operation id in spawn response: ${JSON.stringify(spawned).slice(0, 300)}`);

let op: Operation = spawned;
try {
  for (let i = 0; i < 120; i++) {
    op = await api<Operation>("GET", `/operations/${opId}`);
    if (op.status && !/^(PENDING|ASSIGNED|EXECUTING|QUEUED|RUNNING)$/i.test(op.status)) break;
    await sleep(2000);
  }
} finally {
  if (op.status && /^(PENDING|ASSIGNED|EXECUTING|QUEUED|RUNNING)$/i.test(op.status)) {
    await api("DELETE", `/operations/${opId}`).catch((e) => console.error("cancel failed:", (e as Error).message));
    console.log(`[${since()}] cancelled operation still in ${op.status}`);
  }
}

const result = op.metadata?.result;
const text = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
console.log(`[${since()}] final status ${op.status}; exit_code ${result?.state?.exit_code}; signal ${result?.state?.signal}`);
console.log("stdout:\n" + text(result?.stdout ?? ""));
if (result?.stderr) console.log("stderr:\n" + text(result.stderr).slice(0, 2000));
console.log("resources:", JSON.stringify(result?.resources ?? {}));
const costish = JSON.stringify(op).match(/"[^"]*(cost|price|billing|credit)[^"]*":[^,}]+/gi);
console.log("cost fields in operation:", costish ?? "none");
console.log(`total wall time ${since()}`);
