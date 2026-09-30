# Decisions

One entry per non-obvious choice, with the alternative we rejected.

## 001 · Run TypeScript with Node's native type stripping
**Choice:** Node 24 runs `.ts` directly (`node src/cli.ts`). The code uses `.ts` import extensions
and `erasableSyntaxOnly`.
**Rejected:** `tsx`/`ts-node`. Each is one more dependency and a second TS semantics to keep in sync
with. The cost of our choice is no enums or parameter properties, which we don't need.

## 002 · TypeScript 6.x for type-checking, not 7.x
**Choice:** `typescript ~6.0` for `tsc --noEmit` and Next.js. ts-morph bundles its own compiler,
so the analyzer's parsing does not depend on this version.
**Rejected:** TS 7 (the native Go port). It is the npm `latest`, but Next.js and other tooling
still expect the JS compiler API.

## 003 · Group by anchor reachability, not by directory or community detection
**Choice:** Anchors are files that mark a responsibility: entry points, modules that register
routes, and modules that wrap an infra client. Each anchor claims the files that only it can
reach through resolved imports. A file shared by several anchors goes to the one whose name it
matches, or else to a per-package Shared component. Each file records why it landed where it
did (`membership.reason`).
**Rejected:** (a) Directory grouping. Layered repos (`routes/`, `controllers/`, `utils/`) cut
across features, so it would output "Controllers", not "Exchange API". (b) Louvain/label
propagation. It is unstable on 20-file graphs, hard to explain, and it can't say *why* a file
belongs where it does.

## 004 · One Redis node per connection, keys listed on the node
**Choice:** Redis clients are grouped by connection (the env var or URL they connect with). Queue
keys appear as edge labels and node metadata.
**Rejected:** One node per key. The response queue key is `response-queue-${uuid}` on the
backend and `message.responseQueue` (runtime data) in the engine. Joining those statically
would take dataflow we can't back with evidence, and a node per key would scatter one Redis
across the canvas.

## 005 · Queue edges follow data flow; everything else follows dependency
**Choice:** producer → queue → consumer (`produces`/`consumes`). Imports, KV reads/writes and DB
queries point from the dependent component to its dependency.
**Rejected:** Pure dependency direction everywhere (consumer → queue). The canvas would lose the
request/response pipeline, which is the most useful thing it shows about a queue-based system.

## 006 · Embed code snippets in the snapshot
**Choice:** Each evidence item carries its line range plus ±2 lines of context, capped at 14
lines. A snapshot is self-contained and immutable per (commit SHA, analyzer version).
**Rejected:** Reading files at request time. The API would need a checkout of every analyzed
commit, and a snapshot could drift from its snippets.

## 007 · Resolve static values with decaying confidence
**Choice:** A small evaluator follows const variables, const object properties, env-helper calls
and `x ?? "default"` across imports. Confidence is 1.0 for literals, 0.9 for provenance-backed
patterns, 0.7 through fallbacks/indirection, and 0.5 when the value is dynamic. Dynamic operands
still produce a fact (and an edge to the resource) with 0.5 confidence, because the op is real.
**Rejected:** Dropping unresolved ops. The engine's `lPush(message.responseQueue)` is how
responses reach the backend, and hiding it would erase half the round trip.

## 008 · Client-only modules fold into their resource node
**Choice:** A module whose exported values are all client instances (`db.ts` exporting
`prisma`) belongs to the DB/Redis node. Modules that wrap a client in behavior
(`engine-client.ts`) are their own service component.
**Rejected:** Always a separate component per client module. It creates a "db.ts" box that only
duplicates the database node.

## 009 · Static snapshot files + manifest instead of an API (hackathon scope)
**Choice:** The analyzer writes `snapshots/<sha>/<analyzerVersion>.json` and upserts
`snapshots/index.json`, which lists every snapshot (repo, sha, analyzerVersion, path, createdAt)
and has a `latest` pointer. The viewer fetches the manifest, then the snapshot, as plain static
files. Re-analyzing the same (repo, sha, version) replaces its manifest entry.
**Rejected:** A Fastify `GET /snapshot/:sha` server. It adds a process to run, CORS or rewrite
plumbing, and a deploy target, and gives nothing a static file doesn't while snapshots are
immutable and produced offline. It comes back when analysis runs on demand (roadmap step 2).

## 010 · tracehound.json overrides pin files and then act like anchors
**Choice:** The config maps a component id to file globs (or `{ name, kind, files }`). Matched
files are pinned before any heuristic runs. The key becomes the component id verbatim. Pinned
components are never merged, split or renamed. When a file matches two overrides, the first key
wins and the membership reason records it. The pinned files also seed the reachability pass, so
an unmatched helper used only by an override component follows it. An override that matches
nothing becomes an `override-unmatched` warning. Overrides live in the analyzed repo's root, or
come from `--config` (the demo's is in `configs/`, since the fixture isn't ours).
**Rejected:** (a) Overrides that only rename heuristic components. Renames can't split or merge,
and the ids would still depend on heuristics. (b) Pin-only overrides with no reach. Pinning an
anchor file would push its private helpers into "Shared".

## 011 · Categorical confidence labels on edges; numbers stay internal
**Choice:** Each evidence item records how its operand was established: `proven` (a literal or
compiler-resolved target), `resolved-default` (taken from a `?? "default"` fallback, e.g.
`process.env.INCOMING_QUEUE ?? "backend-to-engine-broker"`), or `dynamic` (only known at
runtime: parameters, message fields, template keys with runtime holes, bare env vars). The label
is set by the resolver from *what it did*, not by thresholding the number. An edge's
`confidenceLabel` is the strongest label among its evidence, since one literal call site proves
the edge. The UI shows the label; the numeric `confidence` stays for sorting and later tuning.
**Rejected:** (a) Showing the number. "0.7" means nothing to a reader, and the numbers mix two
axes (provenance strength vs. value resolution). (b) Deriving labels from numeric bands. A
template key (`response-queue-${uuid}`) scores 0.7 but is runtime-only, so bands would mislabel
it as `resolved-default`. (c) Weakest-evidence labels. One dynamic call site would downgrade an
edge that other sites prove.

## 012 · LLM naming is a separate, facts-only, fail-safe pass
**Choice:** After deterministic analysis, `nameComponentsWithLlm` sends each component's
extracted facts to Nemotron Nano (`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, Nebius Token
Factory, OpenAI-compatible `/chat/completions`, temperature 0). The facts are the heuristic name,
kind, files, routes, entry points, env vars, resource info, and neighbours with edge labels. The
model returns `{name, summary}`, which is validated with Zod (short title, not a filename, no
duplicate). It is applied only to `name`/`summary`/`naming`. Edges, evidence and ids are passed
through by reference, and a test proves an `"edges"` key in the reply is ignored. Any failure
(HTTP, network, timeout, junk reply) keeps the heuristic name. Components named by a
tracehound.json override are never sent. Each call's model, latency and token usage is printed
and stored in `snapshot.llmCalls`. Without `NEBIUS_API_KEY` (or with `--naming heuristic`) the
pass is skipped, which is how tests and CI stay deterministic.
**Rejected:** (a) Sending source code or snippets. That costs more tokens, invites the model to
"discover" relationships, and leaks code to a third party for little naming gain. (b) Letting
the model propose groupings or edges. That breaks the product rule. (c) Naming inside
`analyzeRepo`. It would make the core pipeline async and non-deterministic; it stays a
post-pass the CLI opts into.

## 013 · Hard budget caps enforced before each call, priced pessimistically
**Choice:** Every model call goes through `TokenFactoryClient`, which does the following:
- **Estimate before sending.** It prices a worst case: ~3 chars/token for the prompt plus the
  full `max_tokens` of output, from `config/prices.json`.
- **Reserve against both caps.** The estimate is reserved against `TRACEHOUND_BUDGET_RUN_USD`
  (default $1) and `TRACEHOUND_BUDGET_TOTAL_USD` (default $45 of the $59 hackathon credit; the
  total is summed from the ledger). In-flight reservations count, so parallel calls can't
  jointly overshoot.
- **Refuse loudly.** A refused call throws `BudgetExceededError`. The naming pass never swallows
  it: the CLI exits non-zero and writes no snapshot.
- **Never price at zero.** Placeholder or unknown prices use a deliberately high fallback
  ($5 / $15 per 1M in/out, above the published Nemotron Ultra price).
- **Ledger every real call** in `.tracehound/spend.jsonl`. Reported usage is charged as-is.
  Without usage, a 4xx counts as 0 tokens (rejected before inference) and a 5xx, network error
  or timeout counts as the upper bound. The ledger may over-count but never under-count.
- **Check the model id for free first.** `GET /models` runs before any paid call, so a bad id
  costs nothing.
- **Nano by default.** Other models only through an explicit `--model`. The env override for
  the model was removed.

**Rejected:** (a) Checking spend only after calls. By then the money is gone, and with 4
concurrent calls the overshoot is 4×. (b) Silently falling back to heuristic names when the
budget is hit. The user would not notice the guard tripped, and a bug that burns credit would
look like a quiet naming failure. (c) Pricing unknown models at 0 until the table is filled in,
which is exactly how an uncapped spend happens.

## 014 · Content-addressed response cache
**Choice:** Successful completions are stored in `.tracehound/cache/<sha256(model + full
request JSON)>.json`. The key covers the system prompt, the facts payload, temperature and
max_tokens. Hits make no request, write no ledger entry and cost $0. Re-running analyze on an
unchanged commit therefore costs nothing and yields identical names. When facts change (new
commit, new override, new prompt), the key changes and only affected components are re-asked.
`--no-cache` skips reads but still refreshes entries. Failures are never cached, so a transient
error is retried on the next run. Writes are atomic (temp file + rename). The cache lives
outside the repo and is gitignored.
**Rejected:** (a) A cache keyed by commit SHA + component id. It serves stale names after a
prompt or grouping change. (b) Storing names in the snapshot and reusing them. It couples the
cache to one analyzer version and hides that an answer came from an old prompt. (c) No cache,
relying on temperature 0. Every dev re-run would cost money, and determinism across calls isn't
guaranteed anyway.

## 015 · Left-to-right layered layout (ELK `layered`, direction RIGHT)
**Choice:** ELK's layered algorithm, flowing left to right with 140px between layers. Requests
enter at the left (server entry → APIs), cross the middle (RPC bridge, Redis) and reach the
worker and data stores on the right, which is how people read a request path. Laptop screens
are wider than tall, and the demo has 4–5 layers, so LR fits without zooming out. On phones the
canvas pans; the layout doesn't change.
**Rejected:** (a) Top-to-bottom. It is taller than the viewport on laptops, and the edge labels
("produces · resolved-default") are wide and collide more when stacked vertically. (b) A
force-directed layout. It isn't deterministic between loads, so nodes would jump, and saved
positions would fight the simulation.

## 016 · Floating edges instead of fixed left/right handles
**Choice:** Each edge leaves from whichever side of its source faces the target and enters the
facing side of the target, as a cubic bezier. Edges between the same two nodes (in either
direction) get their own lane, 30px apart along that side.
**Rejected:** Fixed source-right / target-left handles, the React Flow default. The graph has
real cycles (Redis RPC Bridge ↔ Redis ↔ Engine Worker, Bridge ↔ Pending-Response Registry), so
every backward edge looped around the outside of the canvas. That was visible in the first
screenshot.

## 017 · Confidence is a dash pattern plus text, never style alone
**Choice:** proven = solid, resolved-default = dashed (7 5), dynamic = dotted (round caps). Every
edge label reads `kind · label` ("consumes · dynamic"). The inspector and the top-bar legend
show the same line sample next to the word.
**Rejected:** Colour-coding confidence. It fails for colour-blind users and in greyscale
screenshots, and colour is already used for hover/selection.

## 018 · Viewer serves copied snapshots; the repo's `snapshots/` stays the source of truth
**Choice:** `snapshots/` is committed at the repo root, where the analyzer writes. The viewer's
`build`/`dev` scripts copy `index.json` plus only the snapshot files it references into
`viewer/public/snapshots` (gitignored), so the static export fetches them with relative URLs.
The copy is an explicit first step of `build`, not a `prebuild` hook: pnpm 8 silently skips
`pre*` scripts, and the first Vercel deploy went green while serving no data (see 019). Any
missing piece fails the build: no `../snapshots`, no `latest`, a missing referenced file, or
missing `out/snapshots` after export. `next.config.ts` also refuses a bare `next build` without
the data. CI builds the viewer and asserts `out/snapshots/index.json` and the latest file exist.
No symlinks: Vercel and `next export` copy `public/` by value, and a dangling link would ship
silently.
**Rejected:** (a) Importing the snapshot JSON into the JS bundle. Adding a snapshot would need a
rebuild of the code rather than just the data, and the manifest indirection would be pointless.
(b) Writing snapshots straight into `viewer/public`. That couples the analyzer to one consumer.

## 019 · Vercel Root Directory = `viewer`, with files outside the root included in the build
**Choice:** The Vercel project builds from `viewer/` and reads `../snapshots` and
`../packages/analyzer` at build time. That relies on Vercel's "Include files outside the root
directory in the Build Step" (Project Settings → Build and Deployment → Root Directory). The
first deploy shows it is on: the viewer imports `@tracehound/analyzer/schema` from `../packages`,
and that build succeeded. If it's ever turned off, the snapshot copy fails with a message naming
the setting, instead of deploying a viewer that 404s. Confirmed by the build log for
`dpl_EgyJ66vZbvmK4aYHP4HH855wvkrg`: the copy and export check succeeded on Vercel. That deploy
failed only because `viewer/vercel.json` set `outputDirectory: "out"`. Vercel's Next.js builder
needs its default (`.next`, where `routes-manifest.json` lives) even for `output: "export"`, so
the output directory is left unset.
**Rejected:** (a) Committing a second copy of the snapshots inside `viewer/public/`. That
duplicates data in git, and the two copies drift. (b) Fetching snapshots from
raw.githubusercontent.com at runtime. It adds a runtime dependency on GitHub, and the viewer
would show `main`'s data rather than the deployed commit's. (c) Symlinking `viewer/public/snapshots`
→ `../../snapshots`. Link handling in upload and export is platform-dependent, and a broken
link fails silently.

## 020 · Naming runs with reasoning off (`chat_template_kwargs.enable_thinking=false`)
**Choice:** Naming requests send `chat_template_kwargs: {"enable_thinking": false}`. `--reasoning on`
restores the model default. On the demo's 7 components (same facts, Nano) this cut completion
tokens from 2,021 to 229 (8.8×), cut per-call latency from 1.4–2.8 s to 0.9–1.5 s, and cut cost
from $0.00062 to $0.00019 per run. All 7 replies still passed the naming checks (021 below
covers the checks).
**Rejected:** (a) `reasoning_effort: "none"`, the parameter the Token Factory OpenAPI spec
documents. On Nano it returned `content: null` with the JSON answer inside `message.reasoning`,
which breaks standard OpenAI-style parsing. (b) `reasoning_effort: "low"`: 215 completion tokens
and 1.4 s, a smaller saving. (c) Keeping reasoning on and raising `max_tokens`: it costs more
for no measurable naming gain on facts-only prompts. `enable_thinking` is not in the official
spec. If Nebius drops support, the check layer still rejects bad replies, and the per-call log
would show completion tokens jumping back up.

## 021 · Deterministic checks on model names before they're stored
**Choice:** Every reply is Unicode-normalized to ASCII punctuation, then must pass two checks:
identifier-like tokens in the summary must exactly match extracted facts, and the name must not
describe just one route or file of a multi-part component. A rejected reply falls back to the
heuristic name, and the reason goes into `llmCalls[].rejectReason`.
**Rejected:** A second model call to judge the first. It doubles cost, it's non-deterministic,
and it can hallucinate too. Rules are cheaper and testable against the real bad outputs.
**Known gap:** Plain-English claims aren't checked: "cryptocurrency" (run 1), "validates
credentials" (run 3, where `signin` is a TODO stub). Only identifier-like tokens are verified.
**Update (2026-09-30):** Joined tokens are split on `/ , | +`. Each piece that is identifier-like,
ALL-CAPS, or a case variant of a fact identifier must match a fact exactly (case-sensitive), so
Super's "BRPOP/LPUSH" now fails against `brPop`/`lPush`. A token that is itself a fact (a route
like `/depth/:symbol`) isn't split. Re-checking the 21 cached replies for the current facts
offline changed one verdict (that Super reply); all 7 published Nano names still pass. Prose stays
unchecked, so the viewer labels every model-written name/summary "Model-written (Nemotron
Nano), prose not verified". Naming is closed: no more prompt tweaks or model comparisons.

## 022 · Drive Nebius Sandboxes from TypeScript over REST, no Python bridge
**Choice:** Sandboxes (Contree) have a documented REST API with a published OpenAPI 3 spec
(`https://eu-north.nebius.computer/static/api.yaml`, base
`https://api.tokenfactory.nebius.com/sandboxes/v1`):
- `POST /instances` spawns a run, with `disposable`, `timeout`, `networking.enabled`, `env` and
  `files`.
- `GET /operations/{id}` polls; `?inflight=1` returns live stdout.
- `DELETE /operations/{id}` cancels.
- `POST /operations/{id}/subprocesses` execs into a running instance.
- There are also image import, tag and inspect endpoints.

Auth is `Authorization: Bearer <NEBIUS_API_KEY>` plus a `Project: <project id>` header. The
repair harness will call this with `fetch` from TypeScript, the same way `TokenFactoryClient`
does, and can generate types from the spec later if the surface grows.
`scripts/sandbox-spike.ts` is the first client.
**Rejected:** A thin Python bridge around `contree-sdk` / `contree-client`. The SDK adds only
convenience (image objects, branching helpers) over the same REST calls. The docs say
`contree_sdk` "performs no auth, transport, or configuration of its own". A bridge would add a
second runtime, packaging and IPC to a Node-only stack for no capability we need.

## 023 · Impact analysis: which way to walk each edge kind
**Choice:** `tracehound impact` maps changed files to components through the **base** commit's
snapshot, then walks component edges breadth-first up to `--depth` (default 2):
- `imports`, `queries`: **reverse**. The edge points from the dependent to its dependency, so a
  change to the target reaches the source ("who depends on the changed component"). These are
  the snapshot's equivalents of IMPORTS / CALLS: the analyzer emits no separate CALLS or
  HANDLES_ROUTE edges (route handling is a file fact inside a component), so none are walked.
- `produces`, `consumes` (PUBLISHES_TO / CONSUMES_FROM), and `reads`, `writes`: **bidirectional**.
  A queue message or stored value is a contract, so changing the consumer's expectations breaks
  producers just as changing the producer breaks consumers. Queues are components of their own
  (`redis:<connection>`), so producer → consumer is two hops.

Deleted and renamed files map by their base path. Added files, or any file not in the base
snapshot, are listed as **unmapped**, never dropped. Each affected component gets one shortest
chain; among equally short chains the one with the strongest weakest hop wins. Every hop shows
kind, `confidenceLabel` and one evidence `file:line`. Chains with a `dynamic` hop are flagged, not
hidden. The base snapshot must be the current analyzer version; if it's missing the CLI fails
and prints how to create one (with `--naming heuristic`, so no model call).
**Rejected:** (a) Forward-only walking (follow imports from the change outward): that answers
"what does this code use", not "what could this break". (b) Treating queue edges as one-way
data flow: a consumer-side payload change would then report nothing on the producer side,
which is exactly the break a queue hides from import graphs. (c) Not counting the queue node as
a hop: depth would stop being "edges walked", and the same `--depth` would mean different
things for different paths. (d) Key-level queue matching (only couple producers and consumers of
the same key): more precise, but dynamic keys (`lPush` with a runtime key) would then silently
drop out. Component-level coupling over-reports; the hop's label shows which key it is.

TESTS: test files (`*.test.ts`, `*.spec.ts`, `__tests__/**`) keep their facts but are excluded
from grouping and orphan warnings. `snapshot.tests` links each test file to the components whose
files it imports (evidence = the import fact). The impact report lists tests linked to changed or
affected components and says "0 linked tests" when there are none. (Analyzer 0.4.0.)

## 024 · Crossing a queue costs one hop of impact depth
**Choice:** Entering a broker component (`queue` or `cache` kind: a Redis resource) costs one
hop; leaving it costs nothing. Producer → broker → consumer is one hop of `--depth`, the same as
an import. The broker still appears in the chain (as an affected component, and as the middle
hop marked "leaves the broker, no extra depth"), so the evidence for both edges stays visible.
`depth` in the report is now the depth used, not the chain length. The walk is cost-ordered;
ties are broken by the strongest weakest hop, then the shorter chain.
**Why:** With 023's plain counting, a queue cost two hops. On `seed/impact-queue-consumer`
(engine stops reading `responseQueue`), the default depth 2 stopped at `redis-rpc-bridge` and
never reached `backend:exchange-api`, where the user-visible timeout happens. A broker is a
transport, not a place where a change can break. It only relays the contract between the two
real components.
**Rejected:** (a) Raising the default depth to 3: every import chain would get one hop longer
to fix a queue-only problem. (b) Dropping broker nodes from the chain: it would hide which queue
couples the two sides, and the edge evidence would lose its middle. This supersedes 023's
rejected option (c).

## 025 · Agent context packets: deterministic lexical ranking v1, heuristic confidence
**Choice:** `tracehound context`, `tracehound query` and `tracehound mcp` read one snapshot file
and nothing else: no network, no model. The ranking was written down before running it on any
real issue, and isn't tuned to specific strings.
- **Terms:** the issue text is split on camelCase, snake_case, kebab-case, paths and
  punctuation, then lowercased. A fixed list of English function words is dropped, and so are
  words under 3 characters. What's left gets a light stem (`-ing`, `-ed`, `-es`, `-s`). Two
  terms match if they're equal, or if one is a prefix of the other and the shorter is at least
  4 characters.
- **Facts per component, with weights:**
  - id / heuristic name / override name: 3
  - route paths: 3
  - exported symbols: 2
  - file paths: 2
  - Redis keys: 2
  - error-message literals (0.6.0: `new Error`/`throw`/`reject`/HTTP `{ error }`): 2
  - env vars: 1

  Model-written names and summaries are **not** used, since their prose is unverified.
- **Score (rarity-weighted, since 0.6.0):** `score(c) = Σ_t w(t, c) × idf(t)`. The sum runs over
  distinct issue terms `t`. `w(t, c)` is the highest field weight among `c`'s facts that match
  `t` (0 if none).
  - `idf(t) = ln(1 + N/df(t)) / ln(1 + N)`, where `N` is the number of (component, fact) values
    in the snapshot and `df(t)` is how many of them contain a term matching `t`.
  - A term found in exactly one fact gets idf 1.0, so a unique name or route match still scores
    3, and the confidence thresholds below keep their meaning. Common terms ("error", "order" in
    CEX) fall toward 0. A term that matches no fact gets idf 0.
  - Scores are rounded to 2 decimals. `reason` shows `weight×idf` per matched term.
- **Packet:**
  1. Take the top components with score > 0: at most 3, each at least half the top score.
     **At LOW or NONE confidence the packet shrinks:** fallback advice plus at most the top 2
     candidates, with no expansion (steps 2–3 are skipped).
  2. Expand one hop along every edge touching them.
  3. **Queue partners:** any included component's queue edges (`produces`/`consumes`/`reads`/
     `writes` to a queue/cache broker) bring in the broker and every component on its other
     side. The message contract couples both sides (023/024). Without this, "an order times out"
     would stop at the producer and never show the consumer.
  4. List the edges among included components with up to 2 evidence `file:line` refs each, plus
     linked tests.
  5. If the packet's estimated size is over `--budget` (default 2000), trim in this order:
     evidence per edge → neighbor file lists → neighbor components. Each step taken is reported.
- **Confidence** (a heuristic, labelled as one, never a probability). Since 0.6.0 it's on a
  normalized scale that doesn't depend on corpus size:
  - `maxAchievable = Σ 3·idf(t)` over the issue terms that match *any* fact in the snapshot.
  - `normalizedTop = s1 / maxAchievable`, from 0 to 1.
  - `lead = 1 − s2/s1`.

  Levels:
  - **none** if nothing matches
  - **high** if `normalizedTop ≥ 0.6` and `lead ≥ 0.5` (the top at least doubles #2)
  - **medium** if `normalizedTop ≥ 0.4`
  - **low** otherwise

  The thresholds come from the field weights and are pinned by synthetic tests, not by the dev
  issues. A lone env-var match (weight 1 of 3) normalizes to 0.33, which is low. A lone
  symbol/file/key/error match normalizes to 0.67, a lone name/route match to 1.0. Scaling every
  idf keeps the level. The pre-IDF absolute thresholds (≥6 / ≥3) were retired because IDF
  shrank all scores and every issue became LOW.
  **Consequence:** issue words that match nothing in the snapshot don't lower confidence. If the
  only matchable term matches fully, the level is high even when the rest of the issue is
  unmatched ("An order is timing out" in the queue fixture is HIGH).
  On low or none, the packet tells the agent to fall back to normal code search.
- **Tokens:** estimated as characters / 4, of the JSON packet and of the repo's source files.
  The per-file `chars` fact was added in analyzer 0.5.0 for this. The word "estimated" appears
  everywhere a count is shown.

**Identifier splitting:** camelCase, PascalCase, snake_case, SCREAMING_CASE and acronym runs
are split into words (`ENGINE_TIMEOUT_MS` → engine, timeout; `HTTPServerError` → http, server,
error). **Known limit:** there are no synonym lists and no special cases. "timed out" (→ `tim`,
`out`) and "timeout" stay different terms, so an issue saying "timeout" doesn't match the error
literal "Engine response timed out".
**Test limit:** the fixture test for "both sides of the queue" uses issue text that names a symbol
exactly (`handleOrder`). It proves the queue-partner expansion for such issues only, not for
vaguer wording.
**Dev issues:** the three issues used while building this ("Placing an order hangs…", "Signin
accepts any password", "The app feels slow sometimes") are development inputs. Their results are
not evaluation results; a held-out set is written separately. With the normalized confidence:
- issue 1 is LOW (0.38; top pick `backend:shared` is wrong, and `pending-response-registry` is
  still missed because of timed out vs timeout)
- issue 2 is HIGH (`backend:auth-api` via `/signin`, correct)
- issue 3 is HIGH, a false high: "app" matches the `appRouter` symbol, and the rest of the text
  matches nothing (see "Consequence" above)

No rules were added for any of them.
**Rejected:** (a) Embeddings or an LLM re-ranker: not deterministic, needs network and spend, and
can't explain its ranking. (b) Using model-written summaries as ranking text: they contain
unverified claims ("validates credentials"). (c) A calibrated probability: there's no labelled
data to calibrate on, so a number that looks like a probability would be misleading. (d) BM25 /
TF-IDF: needs corpus statistics that a 9-component repo can't provide in any meaningful way.

## 026 · Repair harness core: provider interface, harness-owned verification, Docker first
**Choice:** Feature 6 starts with the harness, not the agent.
- **Provider interface:** `SandboxProvider` is deliberately small: `create({ image, source,
  network? })`, `exec(handle, cmd, { timeoutMs })`, `writeFile`, `readFile`, `destroy`.
  - `source` is `{ gitUrl, sha }` or `{ localPath }` (localPath is for test fixtures only).
  - The harness calls `destroy` in a `finally` on every exit path, including errors, timeouts
    and cancellation. The CLI's SIGINT/SIGTERM handler also removes live containers.
- **`LocalDockerProvider`:**
  - The image is `tracehound-sandbox:bun1.4.2-ts5.9.3-1`, built from `harness/sandbox.Dockerfile`:
    - `buildpack-deps:bookworm-scm@sha256:b42f74a5…cb92` (official; git 2.39.5)
    - the bun 1.4.2 binary from `oven/bun:1.4.2@sha256:9114c058…6895`
    - `typescript@5.9.3` installed at build time
  - Both bases are pinned by multi-arch index digest, so the same file builds on arm64 and amd64.
  - **Isolation:**
    - Nothing is mounted. The repo goes in as a `git bundle --all` (committed history only, so
      untracked `.env`/keys can't come along) via `docker cp`.
    - No `-e`: the container's environment is exactly `BUN_INSTALL HOME HOSTNAME PATH PWD`.
    - **Network by phase (since 2026-09-30):** on during PREPARING_SANDBOX (clone and
      setup, e.g. `bun install`). The harness then runs `docker network disconnect` and proves
      the network is off with two outbound requests that must fail (a DNS name and a raw IP)
      before REPRODUCING. REPRODUCING, PATCHING and VERIFYING run with no network: the agent
      loop runs on the host, so the sandbox never needs network after setup. If a probe
      succeeds, the run ends FAILED. The old per-task `network` flag is gone.
    - `--cap-drop ALL`, `no-new-privileges`, 2 GB memory, 2 CPUs, 512 pids.
  - **Timeouts:** each command runs under coreutils `timeout` inside the container, with a
    host-side kill as a backstop.
  - Docker tests run where `docker version` works (CI). Elsewhere they're skipped with a message.
- **Contree:** there is no Contree provider yet. It comes after the Sandboxes spike, once beta
  access is granted. The interface is shaped so it can be added without changing the harness.
- **Task spec** (`eval/tasks/<id>/task.json`): source + `baseSha`, setup commands, issue text,
  repro `{ testFile, dest, command }`, regression commands, optional typecheck packages, and
  limits (`steps`, `wallClockMs`, `tokens`, `commandTimeoutMs`). The repro test lives in the task
  dir, never in the target repo.
- **States:** `PREPARING_SANDBOX → REPRODUCING → PATCHING → VERIFYING → RESOLVED | UNRESOLVED |
  FAILED | CANCELLED`.
  - **REPRODUCING:** copy the repro in and run it. It must fail, or the run ends FAILED "repro
    does not reproduce". Then remove it, require a clean tree, and record the baseline:
    regression exit codes, plus `tsc --noEmit` error counts per package.
  - **PATCHING:** the agent gets only `AgentContext`: exec/readFile/writeFile scoped to its
    sandbox, the issue, the limits, `llm.chat` (harness-metered), and optional graph tools. Each operation
    counts as a step. An agent error or a hit limit is recorded, and verification runs anyway.
  - **VERIFYING:** the harness itself extracts `git add -A && git diff --cached <baseSha>`, puts
    the repro back and runs it, then runs regressions and typecheck. **RESOLVED** only if the
    repro passes and nothing fails (or has more TS errors) that passed at baseline. Pre-existing
    failures, like CEX's Prisma import error, are reported as baseline, not regressions. Nothing
    the agent says is read.
- **Terminal states (revised):**
  - **FAILED:** the task or infrastructure is at fault: repro doesn't reproduce, setup fails
    or times out, the network is still reachable after disconnect, a harness/provider error,
    or the wall-clock limit ran out before the agent started.
  - **CANCELLED:** only an external signal (Ctrl-C, SIGTERM, explicit abort).
  - **UNRESOLVED:** the agent ran and verification says the bug isn't fixed or something
    regressed. It's also UNRESOLVED, with the reason `budget exhausted: <limit>`, if the agent
    hit its wall-clock, step or token limit. VERIFYING still runs and is recorded, but a
    budget-exhausted run is never RESOLVED.
- **Token accounting:** the agent's model calls go through `ctx.llm.chat`, which wraps the
  shared `TokenFactoryClient` (cache → budget → request → ledger). The harness counts calls,
  input/output tokens and cost from the usage fields that client returns from the API
  response. There's no channel for an agent to report its own usage, and anything it claims is
  never read. The token limit is enforced on the harness's count.
- Every run writes `runs/<runId>.json`: task, provider, agent, image, state history with
  timestamps, diff, every command (phase, actor, exit code, duration, timeout flag, output
  tails), baseline vs final, tokens/cost (0 for scripted agents), final state + reason, and
  create→destroy time.
- Scripted agents for testing the harness: `oracle` (applies a given patch with `git apply`) and
  `noop`. There's no LLM loop yet.
- **History squash (2026-09-30, closes a leak).** The sandbox used to hold the repo's full history
  at `baseSha`. For a seeded task the bug-introducing commit is HEAD, so `git log -p` or
  `git show` handed the agent the answer (and the toy fixture's commit message named the bug).
  Now, after setup and before the network goes off, the harness runs `SQUASH_HISTORY`:
  - it records `git ls-files`, removes `.git`, runs `git init --template= -b work` (no hook
    samples), re-adds the tracked files with `-f` (so tracked-but-ignored files stay tracked)
    plus everything else not ignored, and commits once as `base` with a fixed author, committer
    and date (`base <base@sandbox.invalid>`, 2000-01-01T00:00:00Z). The same tree always gives
    the same SHA.
  - `core.logAllRefUpdates` is off and `.git/logs` is removed: no reflog. No remotes, no tags,
    no source branch names; the pre-squash SHA doesn't resolve.
  - Setup output that isn't ignored (e.g. a rewritten lockfile) becomes part of the base, so it
    is no longer counted as the agent's change.
  - The run records the squashed commit as `baseCommit`, and VERIFYING diffs against it
    (`git add -A && git diff --cached <baseCommit>`), so agent commits are still included.
  - Other leaks during PATCHING: the repro test and its directories are removed after
    REPRODUCING (as before). The harness now also requires `git status --porcelain --ignored`
    to be identical before and after the repro run, so a repro can't leave ignored artifacts
    behind. Task files, patches and snapshots never enter the sandbox (the oracle's patch goes to
    `/tmp` and is deleted, and only the oracle has one). The clone bundle is deleted after clone.
    `/tmp` holds only `node-compile-cache`, TypeScript's own bytecode cache from the baseline
    `tsc` (no repo content).
  - Tested on the toy task from inside PATCHING (`harness-docker.test.ts`, "history leak
    closed"): one commit, `git remote -v` empty, `git branch -a` = `* work`, empty reflog/tags/
    stash, no dangling objects, pre-squash SHA unresolvable, and no file on disk named like the
    task or containing the repro's test name or the fixture's commit message.
  **Rejected:** (a) `git clone --depth 1`: a shallow clone still carries the real commit, its
  message and author, and `.git/shallow` names the cut. (b) Hiding `.git` altogether: agents
  legitimately use `git diff`/`git status` to review their own change.

**Rejected:** (a) Mounting the repo into the container: that's fast, but it exposes the host
tree (and any `.env`) and lets the sandbox write back to it. (b) Letting the agent report
success, or run its own tests as the verdict: the harness has to re-derive the outcome. (c)
Shipping the repro test inside the repo or leaving it in place during PATCHING: the agent would
see the answer key. (d) `oven/bun` alone: it has no git, which the harness needs for checkout
and diffs. Installing git over apt at build time would leave the package version unpinned.
(e) Building the Contree provider now: its API permissions are unverified (FEEDBACK
2026-09-30), so an untested second provider would just be guesswork.

## 027 · Decider interface; Nemotron localizer over deterministic facts, with a visible fallback
**Choice:** Localization (which components an issue is about) goes through a `Decider`:
`decide({ issue, snapshot, k }) → { ranking: [{ componentId, reason }], decider, usage }`.
- `lexical` is ranking v1 (025), unchanged.
- `nemotron` sends Nemotron Nano, with reasoning off (`enable_thinking: false`) and
  temperature 0, the issue plus deterministic facts per component: id, kind, files, routes,
  exported symbols, Redis keys, error-message literals, and edges (kind, direction, other
  component, label). It never sees model-written names or summaries.
- **Validation:** the reply must be a strict JSON object (`JSON.parse` of the trimmed text; code
  fences count as invalid) with exactly `min(k, #components)` entries. Every id must exist in
  the snapshot, with no duplicates and a one-line reason.
- **Retry and fallback:** on failure it retries once, sending back the previous reply plus the
  exact error. The retry is a different prompt, so the response cache can't just replay the
  bad answer. If the retry also fails, the result is the lexical ranking in full, with
  `decider: "lexical (nemotron fallback)"` and `fallback: "nemotron fallback: <why>"`, logged
  to stderr. The two rankings are never mixed.
- **Spend:** calls go through the shared `TokenFactoryClient`: cache (model + full request
  hash) → budget → request → ledger (purpose `localizer`). Cache hits cost $0 and aren't
  ledgered, since the ledger records spend; the decider's `usage` still counts them.
- `tracehound context --decider lexical|nemotron`. The default stays lexical until the held-out
  evaluation decides.

**Revision (2026-09-30, made after seeing dev results):** the first version's rules caused
two structural problems on the dev issues:
- "Return exactly k" forced padding: dev issue 2's #3 was an unrelated component.
- Free-prose reasons couldn't be checked: one said a component *imports* a symbol it actually
  *exports*.

This is a structural fix, not a prompt tweak aimed at particular issues:
- Every fact in the prompt now has a stable id `<componentId>#f<n>` (fixed order: files,
  routes, exported symbols, Redis keys, error messages, edges).
- The reply is `{"ranking":[{componentId, issuePhrase, factIds, note?}]}` with **at most** k
  entries. `{"ranking":[]}` is a valid abstention when no fact relates to the issue.
- Validation is deterministic: strict JSON and shape; known, unique component ids; `issuePhrase`
  a non-empty **verbatim** substring of the issue; `factIds` non-empty, existing, and belonging
  to that component; any `note` one line of at most 200 characters. It retries once with the
  exact error, then falls back to lexical with the logged reason.
- **Display:** the reason is built from the snapshot's fact text (`"<issuePhrase>" ↔ <fact
  texts>`). The model's note, if any, is appended with the label `model-written note:`.
- **Confidence:** with the nemotron decider, the lexical confidence isn't shown at all. The only
  low-confidence signal is the ranking itself: empty (the packet tells the agent to fall back
  to code search) or shorter than k (reported as `short ranking: n of k`).
**Freeze: decider-v1 (2026-09-30).** One last rule: `issuePhrase` must be at most 6 words
(whitespace-separated) and still verbatim. The model had been copying the whole issue back as
its "phrase", which ties the facts to nothing in particular. The prompt states the limit;
a longer phrase is invalid → retry with the exact error → lexical fallback. This version is
tagged `DECIDER_VERSION = "decider-v1"` in `decider.ts`; it is in every `DeciderResult`, in the
context packet (`ranking.deciderVersion`) and in every repair-run trace (`deciderVersion`).
**No more decider changes until the evaluation is over, whatever the results show.**
Dev issues under decider-v1 (one run each, Nano, reasoning off; development inputs, not
evaluation results):
- "Placing an order hangs and eventually returns a timeout error" → both replies repeated the
  whole 10-word issue → **lexical fallback** (`backend:shared`, `backend:backend-server`;
  `pending-response-registry` still missed). 2 calls.
- "Signin accepts any password" (4 words, so the whole issue is a legal phrase) → nemotron,
  full ranking: `redis-rpc-bridge` #1 (wrong; cited only import edges), `backend:auth-api` #2
  (correct, via `POST /signin`), `engine:engine-worker` #3 (a TODO error message).
- "The app feels slow sometimes" → nemotron, full ranking on "feels slow": `redis-rpc-bridge`,
  `engine:engine-worker`, `redis:redis-url`, citing queue edges. A confident answer to a vague
  issue; no abstention.
**Rejected:** (a) Merging the model's picks with lexical ones: nobody could tell which ranking
produced a given component. (b) Giving the model source code or the naming summaries: that's
more tokens, and the summaries contain unverified prose. (c) Tolerant parsing (stripping fences,
fixing trailing commas): the output contract is strict JSON, and silent repair would hide how
often the model breaks it.

## 028 · Viewer: fact-backed tech icons, overlay inspector with history-backed navigation
**Choice:**
- **Icons come from facts, in the viewer.** `viewer/lib/tech.ts` picks a technology icon only
  from deterministic snapshot facts, never from `name`/`summary`: PostgreSQL when the Prisma
  datasource provider (already a file fact with evidence, `prismaDatasource`) is
  `"postgresql"`; Prisma for Prisma data stores; Redis for the broker node and for components
  whose files construct Redis clients or touch Redis keys; Express for components with routes
  in a file that imports a value from `"express"`; Bun when a `package.json` script runs the
  entry file with `bun`. Everything else keeps the generic kind icon. Hovering an icon shows
  its fact (`PostgreSQL · backend/prisma/schema.prisma:12`). No analyzer change was needed, so
  the analyzer version, snapshot and naming-cache keys are unchanged. SVGs are vendored from
  svgl.app into `viewer/public/icons/` (sources in `CREDITS.md`); nothing is hotlinked.
- **The inspector overlays the canvas** on desktop (`clamp(420px, 34vw, 600px)`), and the canvas
  pans (same zoom) when the overlay would cover the selected node or edge. On phones it is a
  full-screen sheet.
- **Navigation is a stack stored in `history.state`.** Every in-panel step pushes a history
  entry and rewrites `?component=` / `?edge=` (other params such as `?impact=` are kept). The
  back arrow and crumb clicks call `history.back()` / `history.go(-n)`, so the panel and the
  browser back button can't disagree. `popstate` restores the stack stored on the entry it
  lands on. Opening something from outside the panel (canvas, warnings, impact list) starts a
  new one-item breadcrumb. Closing (Esc, empty canvas, ✕) pushes an empty entry, so back
  reopens the panel.

**Rejected:** (a) A `tech` field in the analyzer for all icons: the facts already exist with
evidence, and a schema change would have meant a version bump and regenerating snapshots
and impacts for no new information. (b) Choosing icons from names/summaries or package
dependency lists: names can be model-written, and a dependency doesn't show which component
uses it. (c) Crumb clicks that push a truncated stack: the browser back button would then
return to the deeper view, so the panel's history and the browser's would drift apart.

## 029 · Repair agent loop: host-side TypeScript, native tool calls
**Protocol choice: native OpenAI-style `tool_calls`.** The spike (FEEDBACK 2026-09-30, 3 calls)
showed Nemotron Nano on Token Factory returning `message.tool_calls` with parseable JSON
`arguments`, reasoning on or off, and continuing correctly after `role: "tool"` results. With
reasoning on, the thinking goes to `message.reasoning` and never into the calls. So the loop
sends `tools` and reads `tool_calls`; there's no JSON-in-content protocol.
Malformed output is still handled, and each case counts as a step:
- arguments that don't parse or don't match the tool's schema
- an unknown tool name
- a turn with no tool call at all

The loop answers each with a tool-error message (or a user nudge for a missing call) and
continues. The next model turn decides what happens.
**The loop** (`src/harness/loop.ts`, `RepairLoopAgent`) runs on the host. The model is reached
only via `ctx.llm` (the shared client; the harness counts tokens and $). The sandbox is offline
after setup and reached only via `ctx.exec`.
- **Repo tools:** `list_dir`, `read_file(path, startLine?, endLine?)`, `search(pattern, path?)`
  (grep -E; there's no ripgrep in the image), `edit_file(path, oldText, newText)` (exact, and it
  must match exactly once), `write_file` (new files only), `run(cmd)`, and `finish(summary)`.
  - Each repo tool is exactly **one** provider operation, so one step. The file tools run a
    small bun helper in the sandbox, with arguments base64-encoded in an env var (payload limit
    about 64 KB).
  - Paths are confined twice: normalized on the host, and checked with `realpath` of the nearest
    existing ancestor in the sandbox, which catches symlinks out of `/work`.
  - Results are truncated to 8,000 characters with an explicit note. The run record keeps 1,500
    characters per result.
- **Other steps:** tool calls with no provider op count via `ctx.step()`. That covers `finish`,
  graph tools, malformed/unknown/invalid/path-rejected calls, and a turn with no tool call
  (which also gets a user nudge).
- **Graph tools** (`--graph on`): `context_packet` (lexical or nemotron decider),
  `search_components`, `get_neighbors`, `get_edge_evidence`, `get_related_tests`. They read the
  task's snapshot on the host. A nemotron decider's call also goes through `ctx.llm` and is
  counted.
- **Prompt:** one frozen file, `harness/prompts/agent-v1.md`. The single `GRAPH:` line is
  included only with `--graph on`, so the conditions differ only by that sentence and the tool
  list. The file's sha256 and the rendered prompt's sha256 go in every run record.
- **Model settings:** Nano, temperature 0, reasoning off (`enable_thinking: false`) or on
  (model default), `tool_choice: "auto"`, `max_tokens` 2048 (4096 with reasoning on). Response
  cache reads are **off** for repair runs, so each run makes real calls. Cache writes still
  happen.
- **Limits:** steps, tokens, wall-clock, and the per-run $ cap (`limits.costUSD`, plus the
  shared client's `TRACEHOUND_BUDGET_RUN_USD`/`TOTAL_USD`). Hitting any of them ends UNRESOLVED
  `budget exhausted: <limit>`.
- **Run record** (`agentRun.trace`):
  - model, reasoning, temperature, prompt file + hashes, graph on/off, decider, tool list
  - every turn: tokens, $, latency, finish reason, content, tool calls, truncated results
  - distinct files read, graph calls, finish summary (recorded, never used)
  - `usage.calls` is the harness's per-call count
**Rejected:** (a) A JSON-action protocol in `content`: that means more parsing code and more
failure modes, for no benefit once native calls work. (b) An agent framework (LangChain, the
OpenAI Agents SDK, OpenCode): the loop is small, and the harness has to own step counting,
token counting and verification without a framework in between.

## 030 · Base agent competence: agent-v2 (same in both graph conditions)
**Context:** the first toy-cart transcripts (agent-v1, 10 runs in `runs/session*`, 5 of them
UNRESOLVED at the 40-step limit) failed for generic reasons, not for lack of architecture
knowledge: the model repeated near-identical calls (about 30 invented `bun test --trace-*`
flags; about 30 `find`/`ls` searches for node, some byte-identical), looked for node/npx/npm,
sent edit_file oldText with the wrong indentation six times in its last 11 steps, called tools that don't exist
(`str_replace_editor`, `explore`) or passed invented arguments (`command`), and could finish
without an edit. A baseline that can't fix a one-line bug makes any with/without-graph
comparison meaningless, so v2 fixes these in the base agent. **Every change applies
identically with and without the graph; none of them reads, mentions or special-cases a graph
tool.** The graph condition still differs only by its one `GRAPH:` sentence and its tool list.
**Choice** (`harness/prompts/agent-v2.md` is the default; `agent-v1.md` is kept unchanged;
trace field `loopVersion: "agent-v2"`, prompt file + rendered-prompt sha256 as before):
- **(a) Environment facts in the system prompt.** What is installed (bun 1.4.2 with how to use
  it for tests/scripts/one-liners, tsc 5.9.3, git, grep, sed, find), what is not (node, npm,
  npx, yarn, ts-node, ripgrep), that there is no network, and the task's test commands:
  `regression` plus `typecheck` from task.json (`{{TEST_COMMANDS}}`, filled by the harness via
  `AgentContext.testCommands`; the repro command is never included). The install list is
  static text that matches the pinned image `tracehound-sandbox:bun1.4.2-ts5.9.3-1`; a new
  image needs a new prompt version. The rule "don't repeat a failing call" became "an identical
  call on an unchanged repository returns the same result, so change the call", and step 5
  says the bug is only fixed if the code changed. *Why:* of the 5 v1 step-limit failures, 2 went
  to probing for node/npm, 1 to invented bun flags and 2 to repeated greps.
- **(b) Repeat guard.** Key = tool name + arguments as canonical JSON (sorted keys). Repo state =
  sha256 over `git diff --binary <baseCommit>` plus the untracked, non-ignored files' content
  hashes, read by a harness probe (`AgentContext.repoState()`, logged as a harness command, not
  a step) at the start and after every call that can change the repo (`edit_file`,
  `write_file`, `run`). A call whose key was already made twice at the current state is not
  executed: it returns "not run - … the result won't change. Do something different." and still
  costs a step. Re-running tests after an edit is a new state, so it's not a repeat. *Why:* the
  v1 step-limit failures were loops of identical calls.
- **(c) edit_file whitespace fallback.** If the exact match fails, lines are compared with
  leading/trailing whitespace ignored. The edit is applied only if that match is unique, and
  the result says it was a whitespace-normalized match and which lines. newText is re-indented
  only if every matched line is off by the same indentation shift; otherwise it is inserted as
  given, and the result says that too. If there is no unique match, the error returns either
  the start lines of all matches or the closest region (bigram similarity over a same-size
  window) with line numbers. *Why:* one v1 run spent its last steps re-sending an oldText whose
  only error was two spaces of indentation.
- **(d) Unknown tool / unknown argument.** The unknown-tool error already listed the valid tool
  names in v1 (kept, now tested in both conditions). v2 also lists the valid arguments when an
  argument is unknown (`edit_file: unknown argument "command" (valid arguments: path, oldText,
  newText)`). *Why:* same class of failure, one level down.
- **(e) finish on an unchanged repo.** The first `finish` while the diff is empty is answered
  "not finished: no changes were made … call finish again to confirm" (a step); any second
  `finish` is accepted. *Why:* a no-edit finish is almost always premature, but a correct "no
  change needed" must stay possible.
- **Harness:** a repo-state probe that fails is an infrastructure fault (run FAILED), not an
  agent error. The trace records `guards: { repeatsBlocked, emptyFinishRejected,
  editWhitespaceFallbacks }` and `testCommands`.
**Rejected:** (a) Detecting the environment at run time (`which …`): that is more commands per
run for a fixed, pinned image. (b) Blocking the 2nd identical call: re-reading a file once is
normal. (c) Fuzzy matching beyond whitespace (edit distance): it could silently edit code the
model didn't mean. (d) Hard-rejecting every empty finish: legitimate no-op answers would become
impossible. (e) Graph-specific hints ("start with context_packet"): the graph condition must
differ only by the tools and their one sentence.

**Addendum (2026-10-01): the gate failed.** agent-v2 on toy-discount (Nano, reasoning off, 5
runs graph off then 5 graph on): graph off resolved **2 of 5**, and the gate needed 4 of 5.
Per its rule, the session stopped without further fixes. Table, failure modes and the
decider-v1 dev results are in `eval/dev-log/2026-09-30-toy-gate.md`.
- What the guards did: the repeat guard fired (31 refusals in one run) but the model ignored
  the refusals. The whitespace fallback applied in 3 runs, and the empty-finish check in 2.
- What remained: `bun run -e` misuse, whose usage-text output (about 1,900 tokens, exit 0)
  exhausted the token budget; near-duplicate grep loops; no edit in any failed run.
What followed: agent-v3 (decision 033): a tool-output cap, a stuck stop after consecutive
refusals, one no-edit nudge, and a single way to run scratch code. Then diagnostic runs with
graph off only, reasoning off vs on.

## 031 · Viewer: capped zoom, a header icon rule, transient panel↔canvas highlight, left rail
**Choice:**
- **Zoom is capped at 0.4–1.5 on an unbounded canvas** (Railway-style): panning is free, zoom is
  not. The limits live in `viewer/lib/zoom.ts` and apply to the React Flow props, both fit views
  (after layout, and the Fit view button), the warnings focus pan and the keep-selection-visible
  pan (`keepInView`, which pans at the current zoom and never zooms to make something fit).
  **Consequence:** fit view never goes below 0.4, so on a larger repo, or on a phone, it may not
  show everything. The 9-component demo fits on desktop (≈0.78 at 1440×900), but at 390×844 fit
  view stops at 0.4 and crops the right-hand column (it used to fit at 0.22, which was
  unreadable anyway). The user pans to see the rest.
- **Update: phones (viewport < 640px) use minZoom 0.2**, so fit view shows the whole demo graph at 390×844 again; desktop stays 0.4–1.5.
- **Header icon rule.** A technology logo goes in a node or panel header only when a fact shows
  the component *is* that technology (the Redis broker node, a PostgreSQL/Prisma data store) or
  that it is the component's framework or runtime (Express, Bun). Every fact in `lib/tech.ts`
  now carries a `role` (`is` · `framework` · `runtime` · `uses`), and `headerFact()` takes the
  first that isn't `uses`. A component that merely constructs a Redis client or touches Redis
  keys gets its framework/runtime icon or its kind icon; Redis stays in its "Stack · from facts"
  list. Demo result: Redis Queue → Redis, User Data Store → PostgreSQL, Engine Worker → Bun,
  Backend Server / Authentication Service / Exchange API → Express, Redis RPC Bridge → service
  kind icon, Backend Shared / Pending-Response Registry → kind icons.
- **Panel↔canvas highlight is transient state, not navigation.** Hovering or keyboard-focusing
  a Connections row lights the row, its edge and the node at the other end; a Files row lights
  every edge with evidence in that file (only the row if none); an edge's FROM/TO card lights
  that node. The state is a small reducer (`lib/highlight.ts`): hover wins over focus, a
  leave/blur only clears its own row, and it is cleared whenever the panel shows something else
  (unmounting a row fires no leave). It never touches the URL or history. It is drawn in its own
  colour (`--highlight`, lavender: an offset outline on nodes, a thicker stroke on edges) so it
  can't be confused with the amber selection.
- **Warnings are a compact count button**, vertically centred on the canvas's right edge (moved
  left by the inspector's width while it is open, never under it) and bottom right above the
  safe area on phones. The list opens as a popover that grows leftward. The minimap is gone.
- **Left rail** (56px, hidden below 640px): logo at the top linking to the default canvas view,
  and at the bottom an author credit (vendored GitHub avatar → github.com/SunnyBagal, tooltip
  "Built by Sunny Bagal", with a small ↗ badge). There is no login, so it has no menu. The
  analyzer version moved from its own header chip into the commit chip's tooltip.

**Rejected:** (a) The old 0.2–2 range: node text is unreadable well before 0.2 (the phone fit
landed at 0.22), and at 2 one node fills most of a laptop screen. (b) Picking the header icon by precedence alone
(first fact wins, as in 028): that gave Redis Queue, Engine Worker and Redis RPC Bridge the
same Redis logo, which says "these are Redis" about two components that only talk to it.
(c) Keeping the highlight in the navigation stack or the URL: hover is not a place you can go
back to, and every mouse movement would create a history entry. (d) Reusing the selection
style for hover: then you can't tell what is selected from what the pointer is over.

## 032 · Git env hygiene: every git spawn drops the repo-selecting GIT_* variables
**Incident (2026-09-30):** the UI session ran the test gate inside `git rebase --exec` in its
worktree. Git exports `GIT_DIR` there, and `GIT_DIR` overrides `git -C <dir>` in every child
process. So `eval/fixtures/build-toy-repo.ts` and the test helpers' `git init/add/commit` (in
`test/fixture-repo.ts` and `test/impact.test.ts`) wrote into that worktree's git dir instead of
their temp repos. That produced two commits whose trees replaced the whole repository with
fixture files (4 and 10 files), plus `core.bare = true` in the shared `.git/config`. Nothing
was pushed.
**Choice:**
- `packages/analyzer/src/git-env.ts` (no imports; also exported as
  `@tracehound/analyzer/git-env`): `cleanGitEnv(env)` returns a copy without `GIT_DIR`,
  `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`,
  `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_COMMON_DIR`, `GIT_NAMESPACE`, `GIT_PREFIX`,
  `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`, and every `GIT_CONFIG_KEY_<n>` /
  `GIT_CONFIG_VALUE_<n>`. `scrubGitEnv(env)` deletes the same variables in place.
- Every git spawn in `packages/`, `eval/` and `viewer/` passes `env: cleanGitEnv()`,
  production code included: `analyze.ts` (commit SHA and remote of the analyzed repo),
  `impact/cli.ts` (`impact --diff` from a hook would otherwise diff the wrong repo),
  `harness/docker.ts` (the host-side `git clone` / `cat-file` / `bundle`), `build-toy-repo.ts`,
  `test/fixture-repo.ts` and `test/impact.test.ts`. The viewer spawns no git.
- Both vitest setup files (`packages/analyzer/test/setup.ts`, `viewer/test/setup.ts`) call
  `scrubGitEnv()` at startup.
- `test/git-env.test.ts`: GIT_DIR (alone, and with GIT_WORK_TREE) points at a sentinel repo
  while build-toy-repo and the fixture-repo helper run. The sentinel's local config, refs, index
  and HEAD must be unchanged, and the toy repo must be valid. With the helper bypassed, the
  GIT_DIR-only case reproduces the incident: the sentinel's `main` moves to a fixture commit and
  its index becomes the fixture's files.
- CLAUDE.md: gates run in a plain shell, never via `rebase --exec` or hooks, and the env check
  above must print nothing first.
**Rejected:** (a) Fixing only the test helpers: `impact --diff` and `analyze` from a hook would
still read the wrong repo. (b) Passing `--git-dir`/`--work-tree` explicitly everywhere: it's
easy to forget on one call, and `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY` and
`GIT_CONFIG_PARAMETERS` would still leak. (c) Dropping every `GIT_*` variable: `GIT_ASKPASS`,
`GIT_SSH_COMMAND` and similar are legitimate for clones.

## 033 · agent-v3: output cap, stuck stop, one no-edit nudge, one way to run scratch code
**Context:** agent-v2 failed the toy gate (graph off 2/5; decision 030 addendum,
`eval/dev-log/2026-09-30-toy-gate.md`). The failed runs were dominated by `bun run -e`, whose
~1,900-token usage text filled the context; by the model re-sending a refused call for up to
31 turns; and by never editing. v3 changes only these. **Every change applies identically with
and without the graph; none reads, mentions or special-cases a graph tool.** `agent-v1.md` and
`agent-v2.md` are kept; `agent-v3.md` is the default, and the trace records `loopVersion:
"agent-v3"` plus the prompt hashes as before.
- **(a) Output cap.** Every tool result the model sees (repo tools, graph tools, errors) that
  is over 4,000 characters keeps its first 2,000 and last 1,500 characters, joined by the line
  `[harness: N characters omitted]`. This replaces v2's 8,000-character head-only cut, which
  dropped the end of test output. The trace counts `outputTruncations { count, charsOmitted }`.
- **(b) Stuck stop.** A refused call is one the repeat guard declined to run (030 b). After 3
  refused calls in a row, the loop throws `AgentStopped("stuck")`. The harness still runs
  VERIFYING and records the run as UNRESOLVED with reason `stuck` (never RESOLVED, like an
  exhausted budget). Any call that isn't refused resets the count. The trace records
  `stuckStop`.
- **(c) No-edit nudge.** After a turn, if at least 15 steps are used and the diff against the
  base commit is still empty, the loop adds one user message, once per run: "Step 15 of 40 and
  no file has been changed. If you have found the bug, fix it now with edit_file." (the 40 is
  the task's step limit). The trace records `noEditNudge { fired, atStep }`. The step count is
  the harness's own (`AgentContext.stepsUsed()`).
- **(d) Environment facts.** Exactly one way to run scratch code: write a .ts file with
  `write_file`, then `bun run <file.ts>`. The `bun -e` mention is gone, from the bullet and from
  "How to work" step 2. **Known side effect:** a scratch file is a change, so it shows up in the
  diff and suppresses (c) and the empty-finish check. Verification is unaffected unless the file
  is inside a typechecked or tested path.
- **(e) Nothing else:** no new tools, no near-duplicate detection, no aliases for invented tool
  names.
- **Reasoning on is now explicit (2026-10-01, before the diagnostic runs).** `--reasoning on`
  sends `chat_template_kwargs: { enable_thinking: true }` instead of relying on the model
  default (029 said "model default"). This makes the run configuration exactly what
  `scripts/reasoning-tool-smoke.ts` validated: one Nano call with thinking on and the agent's
  tool definitions returned `finish_reason: "tool_calls"`, a valid `list_dir` call, `content:
  null`, and the thinking in `message.reasoning`. Token Factory does not report
  `completion_tokens_details.reasoning_tokens`, so traces keep `reasoningChars` per turn, and
  `reasoningTokens` only if it's ever reported.
**Rejected:** (a) Stopping on the first refusal: the model sometimes recovers after one
refusal. (b) Repeating the nudge: a nudge every N steps becomes noise, and v3 is meant to
measure one intervention. (c) Hiding `bun run`'s usage text: that special-cases one command.
The generic cap bounds every noisy output instead.
