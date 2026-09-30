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
**Rejected:** (a) Merging the model's picks with lexical ones: nobody could tell which ranking
produced a given component. (b) Giving the model source code or the naming summaries: that's
more tokens, and the summaries contain unverified prose. (c) Tolerant parsing (stripping fences,
fixing trailing commas): the output contract is strict JSON, and silent repair would hide how
often the model breaks it.

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
**Rejected:** (a) A JSON-action protocol in `content`: that means more parsing code and more
failure modes, for no benefit once native calls work. (b) An agent framework (LangChain, the
OpenAI Agents SDK, OpenCode): the loop is small, and the harness has to own step counting,
token counting and verification without a framework in between.
