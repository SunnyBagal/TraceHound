// PARKED (decision 036, 2026-10-01): Token Factory Sandboxes are not available on this account
// (Nebius support case AISTUDIOSUP-1966), so local Docker is the sandbox of record. Kept for
// history and for a future Sandboxes provider behind the same SandboxProvider interface; it is
// not part of setup, CI or any run. Moved from scripts/sandbox-spike.ts.
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
  "T0=$(date +%s)",
  "echo hello",
  "echo \"[os] $(. /etc/os-release 2>/dev/null && echo $PRETTY_NAME || uname -a)\"",
  "(command -v curl >/dev/null || (apt-get update -qq && apt-get install -y -qq curl unzip ca-certificates >/dev/null 2>&1)); echo \"[curl] $(command -v curl || echo missing) +$(($(date +%s)-T0))s\"",
  "echo \"[net] npm registry: $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://registry.npmjs.org/ || echo unreachable)\"",
  "echo \"[net] bun.sh: $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://bun.sh/install || echo unreachable)\"",
  "BUN=$(command -v bun || echo $HOME/.bun/bin/bun); if [ -x \"$BUN\" ]; then echo \"[bun] preinstalled $($BUN --version)\"; else echo '[bun] not in image, installing'; " +
    "curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1 && echo \"[bun] installed $($BUN --version) +$(($(date +%s)-T0))s\" || echo '[bun] install FAILED'; fi",
  // A real package fetch through bun proves the registry path end to end, not just DNS/TLS.
  "mkdir -p /tmp/bunprobe && cd /tmp/bunprobe && echo '{}' > package.json && ($BUN add is-number >/tmp/bunadd.log 2>&1 && echo \"[bun] add is-number ok +$(($(date +%s)-T0))s\" || (echo '[bun] add FAILED'; tail -5 /tmp/bunadd.log)); cd /",
  "if ! command -v redis-server >/dev/null; then echo '[redis] not in image, apt installing'; (apt-get update -qq && apt-get install -y -qq redis-server >/dev/null 2>&1) || echo '[redis] apt install FAILED'; fi",
  "if command -v redis-server >/dev/null; then echo \"[redis] $(redis-server --version) +$(($(date +%s)-T0))s\"; redis-server --daemonize yes --port 6379 >/dev/null 2>&1; sleep 1; " +
    "echo \"[redis] ping: $(redis-cli -p 6379 ping 2>&1)\"; echo \"[redis] set/get: $(redis-cli set k v >/dev/null 2>&1 && redis-cli get k 2>&1)\"; redis-cli shutdown nosave >/dev/null 2>&1; fi",
  "echo \"[done] +$(($(date +%s)-T0))s\"",
].join("; ");

type Operation = { uuid?: string; id?: string; status?: string; metadata?: { result?: InstanceResult } & Record<string, unknown>; error?: unknown } & Record<string, unknown>;
type InstanceResult = { state?: { exit_code?: number; signal?: number }; stdout?: unknown; stderr?: unknown; resources?: Record<string, unknown> } & Record<string, unknown>;

const t0 = performance.now();
const since = () => `${((performance.now() - t0) / 1000).toFixed(1)}s`;

const who = await api<Record<string, unknown>>("GET", "/whoami");
console.log(`[${since()}] whoami ok; permission keys: ${Object.keys((who.permissions as object) ?? {}).slice(0, 12).join(", ")}`);

console.log(`[${since()}] whoami permissions: ${JSON.stringify(who.permissions)}; token_expiration ${new Date(Number(who.token_expiration) * 1000).toISOString()}`);

// Listing needs the `list` permission; without it, fall back to a guessed tag so the spawn check still runs.
const images = await api<{ images?: { tag?: string; tags?: string[]; uuid?: string }[] } | { tag?: string }[]>("GET", "/images?limit=200").catch((e) => {
  console.log(`[${since()}] image list failed (${(e as Error).message}); falling back to ubuntu:latest`);
  return [];
});
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
  timeout: 300,
  networking: { enabled: true },
});
const opId = spawned.uuid ?? spawned.id ?? (spawned as { operation_id?: string }).operation_id;
console.log(`[${since()}] spawned on ${image}; operation ${opId}`);
if (!opId) throw new Error(`no operation id in spawn response: ${JSON.stringify(spawned).slice(0, 300)}`);

let op: Operation = spawned;
try {
  for (let i = 0; i < 170; i++) {
    op = await api<Operation>("GET", `/operations/${opId}`);
    if (op.status && !/^(PENDING|ASSIGNED|EXECUTING|QUEUED|RUNNING)$/i.test(op.status)) break;
    await sleep(2000);
  }
} finally {
  if (!op.status || /^(PENDING|ASSIGNED|EXECUTING|QUEUED|RUNNING)$/i.test(op.status)) {
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
