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
`scripts/sandbox-spike.ts` is the first client. *(Parked by decision 036: the script now lives in
`scripts/parked/`; Sandboxes aren't available on this account, and Docker is the sandbox of record.)*
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
  access is granted. *(Superseded by decision 036: Docker is the sandbox of record.)* The interface is shaped so it can be added without changing the harness.
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

## 034 · agent-v4: reasoning on by default, /scratch outside the repo, base-file edit accounting, agent tests out of the verdict
**Context:** in the agent-v3 diagnostic runs (dev, toy-discount, graph off), reasoning on
resolved 5/5 and off 4/5. Scratch files written into the repo showed up in the final diff, and
agents added their own test files, which the regression command then ran. v4 fixes the
bookkeeping around that. As always, **every change applies identically with and without the
graph**. `agent-v1..v3.md` are kept; `agent-v4.md` is the default (`loopVersion: "agent-v4"`).
- **(a) Reasoning on is the agent default** (`enable_thinking: true`); `--reasoning off` stays.
  The decider (decider-v1, frozen) and naming keep their own settings (reasoning off).
- **(b) /scratch.** After the history squash the harness runs `rm -rf /scratch && mkdir -p
  /scratch`. The file tools accept paths under `/work` or `/scratch`, with both confinement
  checks (host-side normalization, and sandbox-side realpath, so a symlink out of /scratch is
  still rejected). /scratch is outside the git work tree, so it's never in the diff and never
  verified. Checked first in the toy container: `/scratch/check.ts` importing
  `/work/src/cart.ts` by absolute path runs with `bun run` (exit 0, prints 190), and `git status`
  in /work doesn't see it. Limit: a bare package import written *in* the scratch file resolves
  from /scratch (no node_modules); repo files it imports resolve their own imports normally.
  The prompt's recipe: write the file in /scratch, then `bun run /scratch/<file>.ts`, importing
  repo code by absolute path.
  - The repo-state hash (repeat guard) now also covers /scratch's files, so re-running a scratch
    script after changing it is not a repeat.
- **(c) Edit accounting.** For the no-edit nudge and the empty-finish check, a change counts
  only if it modifies or deletes a file that existed at the base commit
  (`git diff --no-renames --diff-filter=MDT <base>`). New files, in the repo or in /scratch,
  don't count. The finish message now says "no file that existed at the start has been modified
  or deleted".
- **(d) Run record.** `changes { modifiedBase, deletedBase, addedInRepo }` comes from
  `git diff --cached --no-renames --name-status -z <base>`, taken before anything is removed;
  `diff` stays the agent's full diff. The trace splits `filesRead` into `baseFilesRead` (paths
  in `git ls-tree` of the base commit) and `agentFilesRead` (created by the agent, /scratch
  paths absolute). Feature 7 metrics use `baseFilesRead` only.
- **(e) Verification.** Before VERIFYING runs anything, agent-added files (`addedInRepo`) that
  match the task's test discovery pattern are removed with `git rm -f`, and recorded as
  `removedBeforeVerify`. The pattern is `task.json` `testFilePattern` (a regex over
  repo-relative paths); the default is bun test's discovery,
  `(^|/)[^/]+[._](test|spec)\.[cm]?[jt]sx?$`. Typecheck errors are counted as before, wherever
  they occur; only the removed files can no longer contribute any.
  Then VERIFYING runs, in order: the repro (`repro.command`, the single copied-in file); each
  `regression` command (what it runs is up to that command, e.g. `bun test ./tests` discovers
  bun test files under `./tests`); and `typecheck.command` in each package (tsc checks what that
  package's tsconfig includes).
**Rejected:** (a) Deleting scratch files from the repo before verification: the model can't
know which of its new files the harness would keep. A separate directory makes the boundary
explicit. (b) Keeping agent tests and counting them: a test the agent wrote isn't evidence of
the fix, and a wrong one would decide the verdict. (c) Making /scratch a subdirectory of /work
with a .gitignore entry: it would still be visible to the repo's own tools (tsc includes, test
discovery with some configs).

## 035 · BullMQ queues (detector bullmq-queues@0.1), Worker files as entry points, ignore/entryPoints config; analyzer 0.7.0
**Context:** TraceHound's second repo, `SunnyBagal/Recall` @ `5d2165a`, is an Express API plus a
separate BullMQ worker process. The one cross-process link, API → `"content-processing"` queue →
worker, was invisible to 0.6.0: BullMQ hides the Redis calls, and `worker.ts` was an orphan
lumped into a "shared" library with benchmarks and scripts. **Recall is not an unseen repo for
this detector:** it was read (Prompt R) before the detector was written, and its shape (a literal
queue name, a queue variable imported by the producer) shaped the fixtures. A held-out repo is
still needed to say anything about how the detector generalizes.
**Choice:**
- **Facts** (`src/extract/bullmq.ts`, `FileFacts.queueOps`, present only when non-empty so
  snapshots of repos without BullMQ are unchanged):
  - `new Queue(name, …)` → a `define` fact (the variable, and the Redis connection when the
    `connection` option resolves to a known redis client).
  - `<receiver>.add(jobName, …)` / `.addBulk(…)` → a `produce` fact **only** when the receiver
    resolves through ts-morph symbols (imports and re-exports included) to a variable initialized
    with `new Queue(…)` from `"bullmq"`. The queue name is taken from that definition, and the
    fact records `definedAt` (file:line) and the job name. A receiver that is merely *typed* as a
    bullmq `Queue` (e.g. a parameter) is a `produce` fact with no queue → a warning. `.add` on
    anything else (a `Set`, …) is not a fact at all.
  - `new Worker(name, handler, …)` → a `consume` fact with the handler.
  - Constructs the detector doesn't model are `unsupported` facts: any other `new X(…)` from
    `"bullmq"` (QueueEvents, FlowProducer, QueueScheduler, …), and a processor that reads
    `<job>.name` (job-name filtering).
- **Names and labels** (the existing scheme): a string literal → `proven` (0.9, a pattern with
  import provenance); a const, or `process.env.X ?? "default"`, resolved statically →
  `resolved-default` (0.7); built at runtime → `dynamic` (0.5). A template keeps its pattern
  (`emails-*`) and pairs with the same pattern. A name with no static value at all (e.g.
  `process.env.Q!`) gets no node and no edge, only a `queue-unresolved` warning.
- **Edges: no new kinds.** The Redis queue model already expresses this: producer
  `-produces->` broker `-consumes->` consumer. BullMQ gets **one broker node per queue name**
  (`bullmq:<name>`, kind `queue`, `resource.tech: "bullmq"`, `keys: [name]`), which is how
  producers and consumers pair by name. Impact's rules therefore apply unchanged: produces and
  consumes are bidirectional, and leaving a broker costs no extra depth (decisions 023, 024). The
  producer edge cites the `.add` call (its evidence names the job and where the queue is
  defined); the consumer edge cites `new Worker(…)`. The `new Queue` definition draws no edge.
  The broker node is not linked to the Redis connection node: there is no op-level evidence for
  that.
- **Warnings (nothing silently dropped):** `queue-unpaired` (a producer whose queue no Worker
  consumes, a Worker nothing adds to, a defined queue with neither), `queue-unresolved`, and
  `queue-unsupported`. An unpaired producer still gets its edge to the queue: that call is real.
- **Worker files are process entry points.** A file that constructs a BullMQ Worker gets
  `isEntry` with the reason "constructs a BullMQ Worker (process entry point)", so it is never an
  orphan and anchors its own component. Components whose entry consumes a queue (Redis or
  BullMQ) are kind `worker`.
- **tracehound.json** had only `components`. It gains `ignore` (globs left out of facts and
  components, listed in the snapshot's `ignored` with the matching glob; ts-morph still loads the
  files, so symbols through them resolve) and `entryPoints` (globs for entries no package.json
  names, e.g. a Vite `main.tsx`). A glob that matches nothing is an `override-unmatched` warning.
- **Recall config** (`configs/recall.tracehound.json`, 5 lines): ignore `recall-backend/bench/**`
  and `recall-backend/scripts/**`, entry point `recall-frontend/src/main.tsx`, and pin
  `recall-backend/worker.ts` as `recall-backend:worker`. The heuristics already give the worker
  its own component; the pin makes the id stable. The Recall snapshot lives in
  `docs/recall/snapshots/` (its own manifest), not in `snapshots/`, so the viewer doesn't serve
  it.
- **CEX regression** (`da0e3d6`, `--cache-only` names): components, edges, warnings, files,
  evidence and tests are byte-identical to the 0.6.0 snapshot. Only `analyzerVersion`,
  `generatedAt` and one cached naming call's `latencyMs` (1 → 0) differ.
- **Addendum (2026-10-01): names and summaries for Recall.** Nano's names were checked against
  the code, and wrong ones are fixed through the config, not by hand-editing snapshots:
  - Component overrides gain an optional form **without `files`**: `{ "name": "…" }` renames the
    component with that id (heuristic or resource), with `naming.source: "override"` and no model
    call, so it never carries the model-written label. Overrides with `files` and a `name`
    already existed.
  - `"summary": false` (with or without files) drops a model-written summary that is wrong. It
    is never replaced by a hand-written one. A model name that is right is kept and stays
    labelled model-written; `naming.summaryDropped: true` records the drop.
  - An override id that names no component is an `override-unmatched` warning.
  - `kind` still requires `files`, and an override must do something (files, a name, or
    `summary: false`).
  - Recall: "Redis Cache" → **Redis (BullMQ broker)**, "Ask AI Panel" → **Recall Web App**,
    "Queue Service" → **Queue Config**; summaries dropped for the worker, the queue and the API
    (each made a claim the code contradicts). The config is 12 lines, over the 10-line target,
    because each fix is one line.
- **CEX 0.7.0 in `snapshots/`** (2026-10-01): regenerated with `--cache-only`; it is the
  manifest's `latest`, and the 0.6.0 file is kept. Impact's missing-snapshot error now prints
  the real regenerate command (repo path, matching `configs/` file, `--cache-only` when the older
  snapshot had model names); the version check itself is unchanged.
**Rejected:** (a) A new edge kind (`enqueues`/`processes`): produces/consumes through a broker
already says it, and impact would need new direction rules for no new information. (b) A direct
producer → consumer edge: it hides the queue, and the "one hop to cross a broker" rule
(decision 024) would no longer apply the same way to Redis and BullMQ. (c) Routing BullMQ through
the Redis connection node: every queue on one connection would pair with every other queue.
(d) Treating every `.add(…)` as a producer: `Set.add` and friends would become queue edges. The
receiver must resolve to a `new Queue` from bullmq. (e) Pairing names that aren't static by
guesswork (env var names, the handler's job names): that would be an edge nobody can point to.

## 036 · Docker is the sandbox of record
**Why:** Nebius support (case **AISTUDIOSUP-1966**) replied that Token Factory Sandboxes are not
yet ready to be used on this account. Since 2026-09-30 the beta request had left `/whoami` with
every permission `false` and list/spawn returning 403 (FEEDBACK.md). There is no date to plan
around, so the local Docker provider becomes the sandbox for development, evaluation, and for
judges reproducing runs.
**What changes:**
- `scripts/sandbox-spike.ts` moves to `scripts/parked/` with a header pointing here; history is
  kept. `NEBIUS_AI_PROJECT` is gone from `.env.example`: only `NEBIUS_API_KEY` is needed (for
  Nemotron). The repair CLI's "Contree comes after the Sandboxes spike" message now cites this
  decision. Decisions 022 and 026 keep their text, each with a pointer here.
- **Isolation audit and fixes** (image `tracehound-sandbox:bun1.4.2-ts5.9.3-2`,
  `docker-provider@2`). Each row is backed by a test in `harness-docker.test.ts` (runs where
  Docker is available, including CI):

  | Property | Status | Evidence |
  |---|---|---|
  | Network off after setup | **yes** | `docker network disconnect` before REPRODUCING (`run.ts` `prepareSandbox`), proven by two probes that must fail. From inside **PATCHING**: `curl https://registry.npmjs.org/` exit 6 (could not resolve host), `curl http://1.1.1.1/` exit 7 (couldn't connect), `getent hosts registry.npmjs.org` exit 2 |
  | Runs as non-root | **yes (fixed)** | was uid 0. Now the image's `USER sandbox` (uid/gid 1000) plus `--user 1000:1000`. `id -u` → 1000; `touch /etc/x` → Permission denied; only `/work` and `/scratch` are writable |
  | CPU, memory, pids limits | **yes** | `--memory 2g --cpus 2 --pids-limit 512` (`docker.ts`). Inspect: Memory 2147483648, NanoCpus 2000000000, PidsLimit 512 |
  | Capabilities | **yes** | `--cap-drop ALL`, `--security-opt no-new-privileges`, not privileged |
  | Host mounts / Docker socket | **none** | the repo goes in as a `git bundle` via `docker cp`. Inspect: Mounts `[]`, Binds `[]`; `/var/run/docker.sock` doesn't exist inside |
  | Host environment | **none passed** | no `-e`; the env is the image's (`BUN_INSTALL HOME HOSTNAME PATH PWD`) |
  | Untracked host files | **never enter** | the repo goes in as `git bundle --all` (committed history only). Test: a host copy with an untracked `.env` (and `src/untracked.ts`) → neither exists in the sandbox, and their content is found nowhere in it |
  | Removed after the run | **yes, incl. crash (fixed)** | `destroy()` (`docker rm -f`) in the harness's `finally` and the CLI's SIGINT/SIGTERM handler. New: `--rm` plus a bounded `sleep <lifetime>` instead of `sleep infinity`, so a sandbox whose harness died (SIGKILL) stops at its deadline and Docker removes it and its anonymous volumes. Test: created with a 4 s lifetime, never destroyed → gone. The lifetime is the task's wall clock + every verification command at its timeout + 10 min |
  | Base image pinned | **yes** | both `FROM` lines carry `@sha256:` multi-arch index digests (test). Not pinned by digest: the `typescript@5.9.3` npm package (pinned by version) and the built image itself (built locally; its content id is recorded per run) |

- **Not guaranteed by Docker here (gaps left):** containers share the host kernel (no VM
  boundary; a kernel exploit escapes); no seccomp/AppArmor profile beyond Docker's default; the
  root filesystem is writable by the sandbox user in its own dirs (not `--read-only`); no disk
  quota on `/work` or `/tmp`; network isolation depends on Docker's bridge disconnect (proven per
  run, not enforced by a firewall); on macOS everything runs inside Docker Desktop's VM, so the
  numbers above are the VM's.
- **Reproducibility in every run record:** `sandboxEnv { provider, providerVersion,
  engineVersion, image, imageId }` (the image's content id from `docker image inspect`) and
  `snapshot`: for graph-on runs `{ path, analyzerVersion, commitSha, sha256 }` of the snapshot
  file the agent's graph tools read; for graph-off runs `"none"`.
**What doesn't change:** the `SandboxProvider` interface (it gains an optional `describe()`
and an optional `maxLifetimeMs` on `create`); harness-owned verification; network off after
setup; the agent loop on the host. A Token Factory Sandboxes provider can be added later behind
the same interface, once access exists, with the parked spike as its starting point.
- **Fresh-clone check (2026-10-01):** a clone of `main` at `e4023ac` into a temp dir,
  following only the README. Clone 2 s, `pnpm install` 3 s, `pnpm demo` 3 s and `pnpm test`
  36 s, all with a warm pnpm store and base images already pulled. `tracehound repair` could
  start about 1 minute after cloning. The README had no prerequisites, said nothing about the
  repair harness, never mentioned that the toy repo must be built first (without it the run
  ends FAILED, "localPath … is not a git repository"), and its quick start ran `pnpm demo`
  before `pnpm test`: without a key that overwrites the committed snapshot with heuristic names
  and 5 viewer tests fail. The README now has Prerequisites, a Quick start using `pnpm fixture`,
  a Repair harness section and a Sandbox section. The time a truly cold machine needs to pull
  the base images was not measured.
- **Proof run** in that clone: toy-discount, graph off, agent-v4, Nano with reasoning on →
  RESOLVED in 23 steps, 74,285 tokens, $0.00558, 54 s. The record carries `sandboxEnv` (image
  `sha256:857f16d2…`, docker 29.8.0, `docker-provider@2`) and `snapshot: "none"`.
**Rejected:** (a) Waiting for Sandboxes: no date, and the evaluation needs a sandbox now.
(b) gVisor/Firecracker for a stronger boundary: not available on the macOS dev machine or by
default on GitHub runners, and more setup for judges to reproduce.

## 037 · A sandbox that expires or disappears is a harness failure with a named reason
**Context:** decision 036 gave each container a lifetime (`--rm` plus a bounded `sleep`; for
toy-discount 600 s + 8 × 60 s + 10 min = 1,680 s, against an estimated worst case of about
1,216 s for a run that reaches a verdict). If it expired anyway, or the container vanished
otherwise, nothing named it. A failed `docker exec` reached the agent as a tool error (and cost a
step). The run ended FAILED with an unrelated reason ("could not extract the diff (exit 1)").
Worst, a container killed during VERIFYING after the repro made the regression and typecheck
"fail", which recorded **UNRESOLVED** "regression … now fails (exit 1; passed at baseline);
typecheck . failed (exit 1) without TS errors": indistinguishable from an agent breaking the
tests (reproduced by the test below with the fix reverted).
**Choice:**
- **Detection:** `LocalDockerProvider.status()` (`docker inspect --format {{.State.Running}}`
  → running / stopped / gone / unknown). A gone or stopped container raises `SandboxGoneError`,
  which is never a tool result and never a test result:
  - `exec`, `writeFile`, `readFile` and `disableNetwork` raise it when docker's own error says
    "No such container" / "is not running" *and* `status()` confirms. A command that merely
    prints those words doesn't trigger it.
  - The harness's `sh` checks `status()` after **every** failed or timed-out command, in every
    phase. This also catches a container killed *during* a command, where docker reports no
    such text. So before VERIFYING records any failed repro, regression or typecheck result,
    the container is confirmed running.
- **Outcome:** the run ends immediately as **FAILED** with
  `sandbox lifetime expired (<N> s)` when the handle's deadline has passed (`expiresAt`, set
  just before `docker start`; 2 s tolerance), else `sandbox container disappeared`. The agent
  is not given the error, and the call is not counted as a step (the agent's step counter is
  decremented). A dead container can no longer produce UNRESOLVED.
- **Truthful cleanup:** `sandbox.removedBy` is `harness` (the provider's `destroy()` removed a
  container that still existed), `lifetime` (it was gone and its deadline had passed) or
  `unknown`. `destroyed` is true only if `status()` says gone afterwards. `docker rm -f` exits 0
  even for a container that no longer exists, so `destroy()` checks status first. The record
  also keeps `lifetimeMs`.
- **Timeouts for the docker calls that had none:** `docker create` 60 s, `docker start` 60 s,
  `docker cp` of the repo bundle 120 s (`DOCKER_TIMEOUTS`; overridable per provider). A timeout
  names the step: "docker cp of the repo bundle timed out after 120 s". The run ends FAILED and
  the half-made container is removed.
- **Tests** (`harness-expiry.test.ts`, Docker), each failing with its fix reverted:
  - lifetime 40 s, expiring during PATCHING → FAILED "sandbox lifetime expired (40 s)". The
    agent's second call got no result, the model never saw the error, steps = 1, removedBy
    `lifetime`. Reverted: FAILED "could not extract the diff (exit 1)" after the agent saw the
    error.
  - container removed between two VERIFYING regressions → FAILED "sandbox container
    disappeared", no `final` checks recorded. Reverted: UNRESOLVED with the regression/typecheck
    reason above.
  - a `docker cp` that hangs (a wrapper CLI) with a 2 s cp timeout → FAILED "harness error:
    docker cp of the repo bundle timed out after 2 s" within seconds, container gone. Reverted:
    hung 60 s, then failed differently.
**Rejected:** (a) Retrying in a fresh sandbox: the agent's state is gone, and a retry hides an
infrastructure problem the record should show. (b) Detecting by stderr text alone: an agent
command can print "No such container". (c) Extending the lifetime instead: it only moves the
edge; the outcome has to be right when it's hit.

## 038 · Change sets: a declaration-level diff with an architectural rollup (analyzer 0.8.0)
**Goal:** for any diff (two commits, or a repair run's patch), one machine-readable answer to:
which components changed, which declarations changed and how, which call, route and queue
relationships were added or removed, and what could break. Deterministic, from ts-morph and
git only: no model is involved, and nothing is silently dropped.
**Schema** (`ChangeSet` in `src/schema.ts`, zod; written before the code):
```
ChangeSet {
  schemaVersion: 1
  analyzerVersion                     // "0.8.0"
  repo: { name, path }
  base: { ref, sha }
  head: { ref, sha } | { run: { runId, taskId, patchSha256 } }   // --run: the run's patch on its base
  config?: string                     // tracehound.json used for components, if any
  components: ComponentChange[]
  files: FileChange[]
  declarations: DeclarationChange[]   // every non-unchanged declaration, plus unchanged ones that
                                      // a changed edge or a warning points at
  edges: EdgeChange[]                 // every added or removed edge, plus unchanged ones touching a
                                      // changed declaration
  warnings: ChangeWarning[]
  stats: { declarations: {added, removed, modified, unchanged},
           edges: {added, removed, unchanged}, files: {added, removed, modified},
           calls: { base: CallCounts, head: CallCounts }, runtimeMs }
  limitations: string[]               // stated in every change set
}
Declaration ids: "<repo-relative file>#<qualified name>", e.g. "src/cart.ts#applyDiscount",
  "src/store.ts#Store.add", "index.ts#route:POST /api/v1/content", "worker.ts#<module>".
DeclarationChange {
  id, name, file, kind, exported, status: "added" | "removed" | "modified" | "unchanged"
  kind: "function" | "class" | "method" | "property" | "react-component" | "variable"
        (exported module-level) | "route-handler" (an inline handler passed to a route
        registration) | "module" (top-level code outside every other declaration)
  componentId, baseComponentId?       // head's component (base's for removed); both when they differ
  modifications: ("signature" | "returnType" | "body" | "typeAnnotation")[]   // modified only
  lines: { added, removed }           // git -U0 hunk lines inside the span on each side
  base?: { file, startLine, endLine } // absent for added
  head?: { file, startLine, endLine } // absent for removed
}
EdgeChange {
  id: "<from>-><to>:<kind>", from, to, status: "added" | "removed" | "unchanged"
  kind: "calls" | "route" | "produces" | "consumes"
  // calls: declaration → declaration; route: "route:<METHOD> <path>" → handler declaration;
  // produces: declaration → "queue:<tech>:<name>"; consumes: "queue:<tech>:<name>" → declaration
  crossComponent, crossProcess        // produces/consumes cross a broker (process boundary)
  evidence: { side: "base" | "head", file, line, extractor }[]   // removed: base; else head
}
FileChange { path, status: "added" | "removed" | "modified", linesAdded, linesRemoved,
             componentId, calls: { base?: CallCounts, head?: CallCounts } }
CallCounts { resolved, external, dynamic }   // every call expression is in exactly one bucket
ComponentChange { id, name, declarations: {added, modified, removed},
                  edges: { crossComponentAdded, crossComponentRemoved,
                           crossProcessAdded, crossProcessRemoved },
                  componentEdges: { added: string[], removed: string[] } }  // snapshot-level edge ids
ChangeWarning { id, rule, kind: "queue-orphaned-by-diff" | "cross-component-signature-change" |
                "removed-declaration-still-referenced", message, declarationId?,
                evidence: { side, file, line, detail }[] (min 1), alsoCaughtByTypecheck? }
```
**Implementation** (`src/changes/`; `tracehound changes`):
- **Trees:** base and head are checked out as detached git worktrees in temp dirs (every git call
  drops GIT_DIR & co., decision 032). For `--run <record>` the head worktree is the run's base
  with the recorded patch applied; the task's repo comes from `eval/tasks/<taskId>/task.json` (a
  `gitUrl` source is cloned to a temp dir). Each tree is loaded once and analyzed with the normal
  pipeline (`analyzeRepo` now accepts the loaded workspace), so components, routes and queues are
  exactly the snapshot's. The tracehound config is `--config`, else
  `configs/<repo name>.tracehound.json` when it exists. Only files the snapshot analyzes take part
  (config `ignore` applies).
- **Declarations** (ts-morph): module-level functions (overloads folded into the implementation),
  classes, their methods (constructors, accessors and function-valued properties included) and
  properties, `react-component` (a PascalCase function in a .tsx file that contains JSX),
  exported non-function variables, `export default`, `route-handler` (an inline function passed
  last to a route registration the http-routes extractor found), and one `module` per file. The
  module's text is its own top-level statements, with declarations left out, so adding a function
  doesn't modify the module.
- **Modifications:** signature (modifiers, export, type parameters, parameters; a class's header
  and heritage), returnType (the annotation only; inferred return types aren't compared),
  typeAnnotation (properties, variables), body (exact text; a class's body is its text with
  members as markers, so a member change doesn't modify the class). A kind change counts as a
  signature change.
- **+/- lines:** `git diff -U0 --no-renames` hunk lines inside each span on each side; a module
  counts only lines outside its top-level declarations.
- **Calls:** every call/new expression is in exactly one bucket, per file and in total:
  - resolved: the callee's symbol (through aliases and re-exports) is declared in an analyzed
    file. That gives a `calls` edge from the innermost enclosing declaration; a member of a
    module-level value resolves to the declaration that holds it.
  - external: declared in node_modules or the TS lib; or, without types installed, a receiver
    chain rooted at something imported, typed or constructed from a package, or at a runtime
    global from a fixed list.
  - dynamic: anything else (parameters, locals, element access, untyped values).
  Only resolved calls make edges; external and dynamic are counted and labelled.
- **Route / queue edges:** from the existing extractors at declaration level. `route:<METHOD>
  <path>` → handler (an inline route-handler, or the first identifier in the handler argument
  that resolves, e.g. `asyncHandler(createOrder)` → `createOrder`; when none resolves, the
  registering declaration, labelled as such). Producer declaration → `queue:<bullmq|redis>:<name>`
  → consumer declaration, attributed to the innermost declaration around the evidence line.
- **Edge status:** added / removed / unchanged by id. The change set lists every added and
  removed edge, and unchanged edges that touch a changed declaration.
- **Rollup:** per touched component, declaration counts, cross-component and cross-process
  (produces/consumes, which cross a broker) edges added/removed, and the snapshot-level component
  edges added/removed between the base and head snapshots.
**Warnings** (each states its rule and carries evidence):
- `queue-orphaned-by-diff`: a queue with producer and consumer at base has only one side at head.
  Evidence: the remaining side at head, the vanished side at base.
- `cross-component-signature-change`: a modified declaration whose signature or return type
  changed has callers at head in other components. Evidence: every such call site.
- `removed-declaration-still-referenced`: a removed declaration still imported, used by name in
  its file, or accessed as a member of its class at head. Kept, and labelled "also caught by
  typecheck" when tsc reports a diagnostic at every reference.
**Tests** (`test/changes.test.ts`, 12): each status with line counts; a method change inside a
class; signature vs body vs return type; a rename (removed + added); an added call; a removed
call; a dynamic call (counted, no edge); an inline route; a queue orphaned by deleting the
consumer; a cross-component signature change; a removed declaration still referenced; `--run` on
toy-discount with its fix.patch. With its rule disabled (a temporary source patch, then
restored), each of the first 11 fails.
**Real diffs** (dev; numbers reported, nothing tuned to them; head-side call buckets
resolved/external/dynamic):

| Diff | Components | Files +/−/~ | Decl +/−/~ | Edges +/− | Comp. edges +/− | Warnings | Calls (head) | Runtime |
|---|---|---|---|---|---|---|---|---|
| CEX `da0e3d6..seed/impact-queue-consumer` | 1 | 0/0/1 | 0/0/1 (module body) | 0/0 | 0/0 | none | 34/148/7 | ~0.5 s |
| Recall `42ba6f5` (2 TS lines) | 1 | 0/0/1 | 0/0/1 | 0/0 | 0/0 | none | 104/458/192 | ~1.4 s |
| Recall `5d2165a` (148) | 1 | 1/0/1 | 0/0/1 | 0/0 | 0/0 | none | 104/458/192 | ~1.4 s |
| Recall `7943212` (1,773) | 2 | 11/0/4 | 2/0/10 | 1/0 | 0/0 | none | 101/445/181 | ~1.2 s |
| toy-discount run (`--run`) | 1 | 0/0/1 | 0/0/1 | 0/0 | 0/0 | none | 4/8/0 | ~0.5 s |
| Recall, `worker.ts` deleted (scratch) | 5 | 0/1/0 | 0/2/0 | 0/5 | 1/4 | queue-orphaned-by-diff | 100/408/192 | ~1.3 s |

- Of Recall's 754 calls at `5d2165a`, 192 are dynamic. Change sets analyze worktrees without
  `node_modules`, so package-typed values without an annotation stay dynamic. An identical run on
  a clone with `node_modules` installed gave the same counts, because the worktrees still lack
  them.
- In the deleted-worker diff, one component edge is "added": `shared → brainly-server` replaces
  `brainly-server → shared`. With the worker gone, the grouping heuristics reassign files between
  those two components. The code relationship didn't change; the grouping did.
**Limitations:** stated in every change set (`limitations`): no rename detection (removed +
added; files diffed with --no-renames); inferred return types aren't compared; bodies compare as
exact text; types, interfaces and non-exported module-level values are part of their module;
top-level code is one module declaration per file; call resolution is static (dynamic and
external counted, never edges); worktrees carry no node_modules; route and queue edges are only
as good as the existing extractors.
**Version:** analyzer 0.8.0. Extractor and grouping output is unchanged, so snapshots differ
from 0.7.0 only in `analyzerVersion`. `impact` requires a snapshot of the current version: CEX
(`snapshots/`) and Recall (`docs/recall/snapshots/`) need regenerating at 0.8.0 with
`--cache-only` before `impact` runs on them again (not done here: `snapshots/` was out of scope).
**Rejected:** (a) A text diff mapped to files only: it can't say which function changed or which
calls appeared. (b) Rename detection by body similarity: a heuristic that can be wrong silently;
removed + added is honest. (c) Resolving `dynamic` calls by name matching: it would draw edges
nobody can point to (product rule). (d) Symlinking node_modules into the worktrees: wrong when
the diff changes dependencies.

## 039 · Change sets v2, a multi-repo snapshot index, and a version guard (analyzer 0.9.0)
**Step 1 · Why so many calls were "dynamic" (cause proven before any change).** Recall @
`5d2165a`, all 61 files, counted with the 0.8.0 rules: 270 resolved, 844 external, **358
dynamic**. A diagnostic that records why each call was dynamic:
- 138 had no symbol on the property, and the receiver was an unannotated local whose type is
  `any`; 96 the same with an unannotated parameter; 30 with a destructured binding.
- 54 resolved to a parameter or local (genuinely dynamic).
- 9 had receivers that are expressions; 3 were `import()`.
- Typical examples: `a = process.argv.slice(2); a.find((x) => x.startsWith(…))`. `process`
  comes from `@types/bun` (`"types": ["bun"]` in `recall-backend/tsconfig.json`), so without
  `node_modules` it is `any`, and so is everything derived from it. Likewise `new
  URL(url).hostname.replace(…)` (the runtime's `URL`), and `t.embedding.op(…)` (a drizzle
  callback parameter typed by `drizzle-orm`).
- **The repo's tsconfig is loaded** (backend: `moduleResolution` bundler, `types: ["bun"]`,
  `jsx`, `strict`). The frontend's root `tsconfig.json` is references-only (`files: []`), so its
  project gets default options. Loading `tsconfig.app.json` instead changed `jsx` but not one
  count (74/125/53 vs 74/125/53; 74/160/18 vs 74/160/18 with `node_modules`). **Not a cause; left
  as is.**
- **Package types are the cause.** On a clone with `node_modules` installed, the same counts
  are 270 / 1,126 / **76**. The 0.8.0 rerun "with node_modules" gave identical numbers because
  change sets analyze fresh **git worktrees**, which never contain the source checkout's
  untracked `node_modules`.
- **Fix:** the source checkout's `node_modules` (repo root and each top-level package dir) is
  symlinked into both worktrees after any staging, so the links never enter a diff. Nothing is
  installed or written. The change set lists the linked dirs in `nodeModules`.
  **Limitation:** base and head both see the checkout's installed versions, which may differ
  from either side's lockfile.
- **Counts** (head side, change-set files):

  | | Before (0.8.0) | After |
  |---|---|---|
  | Recall `5d2165a^..5d2165a`, checkout with node_modules | 104 / 458 / 192 | **104 / 616 / 34** |
  | Recall, checkout without node_modules | 104 / 458 / 192 | 104 / 458 / 192 (nothing to link) |
  | CEX seed (`fixtures/demo-repo`, never installed) | 34 / 148 / 7 | 34 / 148 / 7 |

  Test: a typed package in `node_modules` → `items.forEach((i) => i.go())` is 0 dynamic when
  linked, and `i.go` is dynamic without it.
**Step 2 · Types are declarations; payload types are checked.** The change-set schema is now
version 2.
- Interfaces, type aliases and enums, exported or not, are declarations of kind `type`. Their
  definition (an interface's heritage and members, an alias's type, an enum's members) is
  compared as `shape`; modifiers, keyword and type parameters as `signature`. They are no longer
  part of the module's body.
- **`queue-payload-type-changed`:** for each queue node, the repo types each side uses are
  collected through symbols:
  - producer: the payload arguments, i.e. BullMQ `add`'s 2nd argument, or Redis
    `lPush`/`publish`'s arguments after the key. That includes type references in them and the
    annotated types of the variables they read.
  - consumer: a BullMQ Worker's handler parameters; for a Redis consumer, the function around the
    consume call, or else the top-level statement around it (CEX's `for (;;)` loop).
  The warning fires when a type used by either side was modified in its shape or signature, or
  removed. Evidence covers every producer and consumer site with the types it uses, plus the
  type itself. When producer and consumer use different type declarations, the message says so.
- **CEX seed (`da0e3d6..seed/impact-queue-consumer`):** `engine/src/index.ts#EngineRequest` is now
  a modified `type` (`shape`, +1/−1), alongside the module body (+2/−2). **The warning fires.**
  The consumer loop (`engine/src/index.ts:96`) parses messages as the engine's `EngineRequest`,
  whose field `responseQueue` became `replyQueue`. The producer (`engine-client.ts:43`) still
  builds the backend's own `EngineRequest` (`backend/src/types/engine.ts`, unchanged). The two
  sides use different declarations of the same contract, so tsc can't connect them; this rule
  can.
**Step 3 · Formatting-insensitive comparison.** Every part of a declaration is now built from
AST pieces, and both an exact text and a normalized form are derived from them. The normalized
form is the leaf tokens joined by single spaces: whitespace, comments and JSDoc are trivia and
drop out, JSX text has its whitespace collapsed, and string, template and regex tokens are kept
exactly. A part whose exact text differs but whose tokens don't is `formatting`; a declaration
with only that is modification `["formatting"]`. It is listed, but counted under `formatting`,
not `modified`, in the component rollup and the stats. Regex re-scanning on raw text was
rejected: whitespace inside regexes and template literals would have looked like formatting.
Test: a reindented, respaced, commented function → `formatting`; a JSDoc-only edit → unchanged
(trivia outside the parts); whitespace added inside a template literal → `body`.
**Step 4 · Stable components across base and head.**
- A file that exists on both sides keeps its base component at head. The exception is a file
  head's `tracehound.json` pins elsewhere (a membership reason "pinned by tracehound.json").
  Only files new at head get head's heuristic component. Declarations, the cross-component flags
  and the signature warning all use this mapping.
- Component edges: head's edges are re-aggregated from head's facts with files in their stable
  components (`aggregateEdges`, with the resource nodes taken from head's snapshot). Added and
  removed are judged against that. A component edge on which the raw base and head snapshots
  disagree, but the stable ones don't, is listed as `componentEdges.regrouped`.
- **Deleted-worker rerun (Recall `5d2165a` → `worker.ts` deleted):** the phantom
  `brainly-server ↔ shared` pair **now shows as `regrouped`** (both directions), not
  added/removed. `worker → shared` is also regrouped: `aiProcessor.ts` and `textExtractor.ts`
  still exist at head, keep the worker's component, and still import shared code. The real
  removals stay removals: `content-processing → worker` (consumes) and `worker → queue`. The
  queue-orphaned warning still fires. Test: a shared `util.ts` whose co-user is deleted keeps
  its `shared` component, and the shared import edge is `regrouped`. With the stable mapping
  reverted, the test fails ("app:app-app" instead).
**Step 5 · Multi-repo snapshot index.**
- `snapshots/index.json` gains `repos: [{ id, name, repoUrl, defaultRef, latest, versions[] }]`
  and `defaultRepo`. The `id` is the repo name's last segment, lowercased
  (`cex-v2-boilercode`).
- The old fields stay and keep their meaning for the deployed viewer, which reads only `latest`
  and `snapshots` and whose `z.object` strips unknown keys. `latest` is now always the default
  repo's latest, so analyzing a second repo doesn't move what the live site shows.
  `defaultRepo` is the first repo indexed (the repo of the current `latest` when an old index is
  upgraded).
- An index without `repos` (written before 0.9.0) still parses; `reposOf` derives the repos from
  `snapshots`.
- `context` and `query` take `--repo-id <id>`. The MCP server takes an optional `repo` argument
  on every tool, loads each repo's snapshot once on first use, and defaults to `defaultRepo`.
  `--snapshot <file>` still pins one file, and the MCP server then rejects `repo`.
- Rejected: replacing `latest` with a map keyed by repo. It would break the live viewer before it
  redeploys.
- **Recall is not in the published index.** `SunnyBagal/Recall` main has no LICENSE (GitHub
  license API: 404; no LICENSE* file at the root, rechecked 2026-10-02). Its snapshot stays under
  `docs/recall/snapshots/` with its own index.
- **Update (2026-10-02): Recall is licensed, and published.** The owner added an MIT LICENSE.
  `main` is now `9113ced`, two commits ahead of `5d2165a`; the GitHub compare shows the only file
  changed is `LICENSE` (added). The snapshot therefore stays pinned at `5d2165a`: the analyzed
  code is identical. The 0.7.0 file was moved unchanged (`git mv`) from `docs/recall/snapshots/`
  to `snapshots/` and indexed through `upsertManifest`; `docs/recall/snapshots/index.json` is
  gone. After that, `defaultRepo` = `cex-v2-boilercode` and the top-level `latest` is still CEX
  `da0e3d6`. Back compat checked with `origin/main`'s schema, i.e. the deployed viewer's: it
  parses the new index, strips `repos`, and gets the same `latest`.
**Step 6 · Version guard and regeneration (analyzer 0.9.0).**
- `packages/analyzer/src/version-guard.ts` reads an index. For each repo whose latest snapshot
  isn't `ANALYZER_VERSION`, it prints the repo, commit and version, plus a regenerate command,
  and exits 1. CI runs it on `snapshots/` before the tests.
- The regenerate command clones the repo into `mktemp -d`, checks out the snapshot's commit, and
  runs the analyzer with the repo's config and `--cache-only`. The CLI now says which repo's
  latest it wrote, and whether that is the default repo.
- Rejected: a test that compares versions. A failing test doesn't say how to fix it; the guard
  prints the command.
- **Failing on a stale snapshot:** with the analyzer at 0.8.0, and again after the bump to 0.9.0,
  both CEX `da0e3d6` and Recall `5d2165a` were flagged at 0.7.0, with exit 1 and a command each.
  After regenerating, it reports "snapshot versions OK", exit 0.
- **Regeneration:** both ran with the guard's own commands, in temp clones (none under
  `~/Projects`). CEX: 7/7 names cached; Recall: 4/4 cached. No cache miss, $0, and the spend
  ledger stayed at 959 lines.
- **Identity:** there was no 0.8.0 snapshot (0.8.0 changed only change sets), so the comparison
  is against 0.7.0, leaf by leaf. CEX differs only in `analyzerVersion` and `generatedAt`. Recall
  also differs in three cached naming calls' `latencyMs` (1 → 0): how long the cache read took,
  not what the snapshot says. Nothing in 0.8.0 or 0.9.0 touches extractors, grouping or edges;
  types as declarations, formatting and stable components live only in change sets.
- **Impact:** CEX's three seeds against the 0.9.0 base have the same files, changed and affected
  components (with chains), unmapped files and linked tests as the committed `impacts/*.json`.
  Those reports stay on the 0.7.0 base, which is still in the index. Recall (`5d2165a` →
  `worker.ts` deleted) resolves `snapshots/5d2165a…/0.9.0.json` without a flag: worker changed;
  `content-processing` and `brainly-server` affected at depth 1 over proven edges.
**Step 7 finding · payload warning on a deleted side (fixed).** The first rerun of the
deleted-worker diff gave `queue-payload-type-changed` next to `queue-orphaned-by-diff`:
`ContentJobData` (declared in `worker.ts`) was "removed and used by the consumer", but only
because the whole consumer was deleted. Now a removed type counts only on a side (producer or
consumer) that still has call sites at head; a side deleted outright is the orphan warning's
job. The message also says "removed" rather than "changed" when every hit was removed. Tests:
deleting the consumer → orphaned only (fails without the fix: the payload warning is back); a
type removed from a consumer that still exists → the warning, worded "removed".
**Step 7 · Real diffs rerun (0.9.0; dev, nothing tuned to them).** The same diffs and clones as
decision 038; one row added (median diff on the clone with `node_modules`). Decl +/−/~ counts
exclude formatting-only declarations, which have their own column. Types are type, interface or
enum declarations with any status other than unchanged. Comp. edges and regrouped edges are
unique ids. Calls are head-side resolved/external/dynamic.

| Diff | Components | Files +/−/~ | Decl +/−/~ | Types changed | Formatting-only | Edges +/− | Comp. edges +/− | Regrouped edges | Warnings | Calls (head) | Runtime |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CEX `da0e3d6..seed/impact-queue-consumer` | 1 | 0/0/1 | 0/0/2 | 1 (`EngineRequest` modified) | 0 | 0/0 | 0/0 | 0 | queue-payload-type-changed | 34/148/7 | 0.6 s |
| Recall `42ba6f5` (2 TS lines) | 1 | 0/0/1 | 0/0/1 | 0 | 0 | 0/0 | 0/0 | 0 | none | 104/458/192 | 1.4 s |
| Recall `5d2165a` (148) | 1 | 1/0/1 | 0/0/1 | 0 | 0 | 0/0 | 0/0 | 0 | none | 104/458/192 | 1.4 s |
| Recall `5d2165a`, clone with node_modules | 1 | 1/0/1 | 0/0/1 | 0 | 0 | 0/0 | 0/0 | 0 | none | 104/616/34 | 4.9 s |
| Recall `7943212` (1,773) | 2 | 11/0/4 | 3/0/5 | 1 (`HybridSearchTimings` added) | 5 | 1/0 | 0/0 | 0 | none | 101/445/181 | 1.2 s |
| toy-discount run (`--run`) | 1 | 0/0/1 | 0/0/1 | 0 | 0 | 0/0 | 0/0 | 0 | none | 4/8/0 | 0.5 s |
| Recall, `worker.ts` deleted (scratch) | 5 | 0/1/0 | 0/3/0 | 1 (`ContentJobData` removed) | 0 | 0/5 | 0/2 | 3 | queue-orphaned-by-diff | 100/408/192 | 1.5 s |

- **Against decision 038:**
  - CEX: modified 1 → 2. `EngineRequest` is now its own declaration, and the payload warning
    fires with evidence on both sides.
  - Recall `7943212`: modified 10 → 5, plus 5 formatting-only. All five are route handlers in
    `recall-backend/index.ts`; checked against `git diff -w`, which shows only a reflowed
    `db.insert(…).values(…).returning()` chain, removed blank lines and trailing whitespace.
    Added 2 → 3: the new `HybridSearchTimings` interface.
  - Deleted worker: removed 2 → 3 (the worker's `ContentJobData`). Component edges went from
    1 added / 4 removed to 0 / 2: the two real removals (`content-processing → worker` consumes,
    `worker → queue` imports). The three regrouping artefacts (`brainly-server ↔ shared`,
    `worker → shared`) are now `regrouped`.
- The clone without `node_modules` keeps 192 dynamic calls; with them, 34 (Step 1).
- Spend: none. The ledger stayed at 959 lines through all of decision 039.

## 040 · Change view and repo gallery (viewer; change sets from the existing CLI)
**Goal:** a reviewer understands what a diff did to the system without reading its lines:
component level first, then files and declarations, with "what could break" (the change set's
warnings) first. Viewer only: change sets come from `tracehound changes` unmodified; no model.
**Data (`changesets/`).** `changesets/index.json` is an array of `{ id, repo, title, kind:
"commit" | "run" | "demo", base, head, file }` plus `regenerate` (the command that rewrites
`file`, run from the repo root, cloning into `mktemp -d`), `patch` (demo) and `runRecord` (run).
Five entries, all computed by the CLI on temp clones outside `~/Projects`:
- `recall-7943212` (largest real commit, `d9caa4c..7943212`), `recall-5d2165a` (median,
  `42ba6f5..5d2165a`): Recall commits.
- `recall-worker-deleted`: a demo diff. `changesets/sources/recall-worker-deleted.patch` deletes
  `recall-backend/worker.ts` at `5d2165a`; `git am --committer-date-is-author-date` with a fixed
  committer identity makes the same head every time (`bcfaa67`), and `--diff 5d2165a..bcfaa67`
  computes it.
- `cex-seed-queue-consumer`: `da0e3d6..seed/impact-queue-consumer` (the payload-type warning).
- `toy-discount-run`: `--run` on a recorded, resolved Nemotron run. The run record is gitignored,
  so `changesets/sources/toy-discount-run.json` keeps only the fields `--run` reads (`runId`,
  `taskId`, `baseSha`, `diff`) plus `finalState`.
Every regenerate command was run once and reproduced its file except `stats.runtimeMs`,
`repo.path` (the temp clone) and, for the run, `repo.name` (the CLI names it after its temp copy).
The viewer build copies the index and the files it lists into `public/changesets` and fails
unless each file parses as `ChangeSet` schemaVersion 2 with the entry's base
(`viewer/scripts/snapshots.mjs verifyChangesets`, also run on the export); a viewer test checks
the same.
**Repo gallery.** The repo name in the header is a switcher fed by `snapshots/index.json`
`repos`: every repo (commit, analyzer version) and, under each, its change sets; change sets of a
repo with no published snapshot (the toy) are listed last. `?repo=<id>` picks the repo; unknown
ids and a missing parameter fall back to `defaultRepo`, which is now **`recall`**, so the site
opens on Recall. Switching repo drops `?component=`, `?edge=`, `?impact=` and `?changes=` (their
ids belong to the other repo) and keeps anything else; `?component=` / `?edge=` deep links work
within the repo on screen. The top-level `latest` is untouched (CEX), so the deployed viewer that
reads it keeps working until this one replaces it; the new viewer reads `repos` /
`defaultRepo`, and an index without `repos` still yields its `latest`. **Consequence:** `latest`
no longer points at the default repo's latest as decision 039 states, and MCP/`context`/`query`,
which default to `defaultRepo`, now default to Recall unless given `--repo-id` / `repo`.
**Change view (`?changes=<id>`).**
- **Graph.** The repo's latest published snapshot (component ids are stable across commits; the
  Limits panel says which commit the graph is drawn from when it differs from the base, e.g.
  `5d2165a` for `7943212`'s base `d9caa4c`). A component the snapshot lacks is drawn from the
  change set alone, labelled "change set only" instead of a kind (the toy repo).
- **Component level (default).** Components the change touches carry a chip on their top edge:
  `⚠ n` warnings, `+a −r ~m` declarations (formatting-only not counted as modified), `n type(s)`
  changed, `n fmt`; a component involved only by a warning says INVOLVED, one touched only by an
  edge EDGES CHANGED. Untouched components stay visible at 35 % opacity. Component edges use the
  rollup's `componentEdges`: added solid green, removed dashed red, regrouped dotted grey, each
  also a word on the label ("− removed ·"); unchanged edges are dimmed, except where declaration
  edges between the two components were added or removed (label "+a −r decl. edges"). An added
  component edge the snapshot lacks is drawn from its id, labelled "no snapshot evidence", and
  clicking it opens its source component's changes, never an evidence-less edge inspector.
- **Warnings panel** (left, open by default when a rule fired; a collapsed rail saying "No
  warnings" otherwise, which lists the four rules verbatim when opened): per warning, a plain
  title, `Rule:` with the CLI's rule text, the message, then each evidence item with its side and
  a GitHub permalink at that side's SHA. A demo's head is a local commit: head lines are shown
  without a link and say why. A run shows patch line numbers (`patchLine` maps a base or head line
  to its line in the run's diff; outside every hunk it says so). Warnings are ordered queue
  orphaned → payload type → removed still referenced → signature. Clicking one highlights the
  components it involves (its evidence files, its declaration, the queue its id names) and the
  snapshot edges between them, and fits them into view; click again or Esc to drop it.
- **Drill-down.** Clicking a component opens the inspector on a new **Changes** tab: the rollup in
  words, the warnings involving it, its files (each with +/- lines and a permalink at base or
  head), and per file the declarations: kind icon, name, status pill (added, removed, modified,
  formatting only), modification reasons in words ("return type changed", "shape changed"),
  +/- lines, and a permalink to the span. Changed declarations come first (warned ones on top);
  formatting-only ones are grouped behind "N formatting only"; unchanged ones (the change set
  lists only those a changed edge or a warning points at) behind "Show N unchanged". Below the
  files, every call, route and queue edge added or removed with an end in the component,
  including ends in neighbouring components (named, clickable, hover-highlighted on the canvas).
  The edge inspector gains an "In this change" section.
- **Summary bar:** title, `base..head`, N components touched, N declarations (+/−/~, plus N
  formatting only), N cross-process edges changed, N warnings, "Computed without AI", and a
  Limits popover: how it was computed, which snapshot the graph comes from, demo/run caveats,
  changed files outside every component, the change set's own `limitations`, and the regenerate
  command. Model-written component names keep their label (badge on nodes, `*` with a tooltip in
  lists).
- **Phones** (< 768 px): a list instead of the canvas: warnings first, then touched components
  (warned first, then most changed) as expandable rows with the same drill-down, untouched ones
  behind "Show N unchanged components".
**Layout persistence (bug).** Dragged positions were saved under `<commitSha>:<analyzerVersion>`,
so every regenerated snapshot (0.6 → 0.7 → 0.9 this week) and the impact view (0.7.0 base) started
from a fresh ELK layout: "my layout resets when I reopen". Reproduced on a production build:
within one snapshot a drag survived a reload, so the key was the cause. Positions are now saved per
repo name (merged, so components another view doesn't show keep theirs); the first load after
this change picks up the newest pre-040 save for the same commit; Reset layout stores an empty
record so that fallback can't bring old positions back. Checked in a browser: a drag survives a
reload and shows in a change view of the same repo, and a 0.7.0-keyed save is used at 0.9.0.
Not fixable here: every Vercel preview URL is its own origin with its own storage.
**Header:** the "TraceHound" wordmark is gone (the rail and the phone header keep the logo); the
repo switcher, a GitHub link and the commit chip remain.
**Tests** (viewer, 45 new: `changes.test.ts`, `repos.test.tsx`, `positions.test.ts`, `change-view.test.tsx`): the
index check; status mapping; reasons; rollup badges; warnings-first ordering of warnings and of
components; collapsed unchanged and grouped formatting-only declarations; evidence links per kind
(commit SHA, demo head, run patch lines); the summary bar; dimming and badges on the canvas; a
warning click lighting its components; the Changes tab; the phone list; repo resolution, the
switcher's links, deep links within a repo; positions. With the logic reverted (temporary edits,
then restored), each group fails: formatting-only as modified (3 tests), no warning order (1),
no component order (2), unchanged not collapsed (3), zero counts kept (3), `?repo=` ignored (1),
`defaultRepo` back to CEX (2), switching repo keeping `?component=` (2), positions keyed by
commit:version (3).
**Analyzer test changed (one line):** `packages/analyzer/test/agent.test.ts:224` ("context and
query take --repo-id against the committed index") asserted that a search without `--repo-id`
equals `--repo-id cex-v2-boilercode`, i.e. that the default repo is CEX. With `defaultRepo` =
`recall` it failed, so it now compares against `--repo-id recall`. It still fails if the default
is anything else (checked by setting `defaultRepo` back to CEX: 1 failed). Nothing else in
`packages/analyzer` changed.
**Performance:** largest change set (`recall-7943212`, 26 KB) on a local production build
(`next build` export served statically, headless Chromium 1440×900, 6 warm runs): navigation to
the first component node with the summary bar rendered, median **285 ms** (269–288), against
257 ms for the plain Recall view.
**Rejected:** (a) Redrawing component edges from declaration edges in the viewer: it would draw
edges the CLI didn't (product rule); the rollup's `componentEdges` are used as they are. (b)
Hiding untouched components: the reviewer loses where the change sits; they are dimmed. (c)
Snapshots of each change set's base/head: generating snapshots is analyzer work, out of scope;
the latest snapshot plus "change set only" components is stated in Limits instead. (d) Pushing
the demo commit to the Recall fork so head lines get permalinks: an outward change to someone
else's repo for a demo.
**CLI gaps (for the main lane):** `repo.path` is the machine's temp clone path; `--run` names the
repo after its temp copy; `componentEdges` are bare ids with no evidence or the declaration edges
behind them; no per-file count of unchanged declarations (only referenced ones are listed); no
component metadata (kind, naming source) or snapshot reference for base/head; warnings don't name
the components they involve (the viewer parses the queue out of the warning id); edge endpoints
carry no component ids; unmapped files carry no reason (ignored vs not TypeScript); no `--patch`
on a base ref for demo diffs without a local commit.

## 041 · Repo profiles, a baseline-matched typecheck gate, and the repair harness on Recall
(Number 040 is the change view, merged from `ui/change-view` after this decision was written.)
**Context:** Recall is the new evaluation repo: `SunnyBagal/Recall`, branch `testable-baseline`
@ `57d920e`, backend in `recall-backend/`, frontend in `recall-frontend/`. The harness assumed
the repo root, compared tsc error *counts*, and had no way to seed a bug without a commit in the
target repo. Nothing is changed in or pushed to Recall.
**Checked on the sandbox image before building** (`tracehound-sandbox:bun1.4.2-ts5.9.3-2`, uid
1000, network cut after install and both probes failing): `bun install --frozen-lockfile` in
`recall-backend/` → 210 packages; `bun test` → 62 pass, 0 fail, 8 files; `tsc --noEmit` → 5
errors (TS18048 ×3, TS18046, TS2322), exit 2. Same as reported from the repo.
**Graph check at `57d920e` (analyzer 0.9.0, `configs/recall.tracehound.json`, written to a
scratch dir, not `snapshots/`): the API → queue edge is missing.** `--cache-only` aborted on a
naming cache miss (`recall-backend:worker`), so the comparison ran with `--naming heuristic`; no
spend. Ids, edges and evidence don't depend on naming.

| Edge | Published `5d2165a` | `57d920e` |
|---|---|---|
| `recall-backend:brainly-server -produces-> bullmq:content-processing` | proven (0.9), label `add process-content`, evidence `recall-backend/index.ts#L153-161:bullmq-queues` | **missing** |
| `bullmq:content-processing -consumes-> recall-backend:worker` | proven (0.9), label `Worker processContent`, evidence `recall-backend/worker.ts#L111-121:bullmq-queues` | proven (0.9), label `Worker <inline function>`, evidence `recall-backend/worker.ts#L141-151:bullmq-queues` |

- In its place, a `queue-unpaired` warning: "BullMQ Worker at recall-backend/worker.ts:141
  consumes queue "content-processing", but nothing in this repo adds to "content-processing"".
- Cause: commit `1999c67` ("Add injection seams"). At `5d2165a`, `config/queue.ts` exported
  `contentQueue = new Queue("content-processing", …)` and `index.ts:153` called `.add` on that
  import. At `57d920e`, `new Queue` is inside `createQueue()`, and `index.ts:162` calls
  `contentQueue.add(…)` on a value destructured from `deps`, typed as a hand-written
  `ContentQueue` interface; the real queue is passed in at `index.ts:500-504`. The receiver no
  longer resolves through symbols to a `new Queue`. No warning names `index.ts:162`.
- Rest of the graph: the same 7 component ids (`worker` 3 → 2 files, `shared` 7 → 12); edges
  6 → 7 (`shared → brainly-server` and `shared → queue` imports are new, the produces edge is
  gone); warnings 2 → 5 (orphans `test/helpers/app.ts` and `test/setup.ts`, and the unpaired
  queue).
- **Detectors were not touched** (out of scope here; backlog). **Because of the missing edge,
  everything below ran graph off**, and no snapshot of `57d920e` is committed.
**Choice:**
- **Repo profile** (`configs/<repo>.profile.json`, `src/harness/profile.ts`, zod, strict):
  ```
  RepoProfile {
    id: string                 // "recall"
    workdir: string = "."      // repo-relative; every profile command runs here; no "..", not absolute
    install?: string           // run once with the network on; must exit 0
    test?: string              // the repo's suite: a regression command
    typecheck?: string         // "$TSC --noEmit"; $TSC is chosen by the harness (below)
  }
  ```
  A task names it (`"profile": "<path relative to the task dir>"`). Profile and task are merged
  into one `CheckPlan { setup, regression, typecheck[{package, command}] }`: the profile's
  commands in its workdir first, then the task's own `setup` / `regression` / `typecheck`. A task
  without a profile behaves as before (toy tasks are unchanged). The run reads only the plan;
  there is no Recall-specific branch in harness code. The record carries `profile` and the `plan`
  as run from `/work`, and the agent is given those same commands.
- **`$TSC`:** at BASELINE, per typecheck package: `node_modules/typescript/bin/tsc` exists →
  `bun node_modules/typescript/bin/tsc` (source `repo`), else the image's global `tsc` (source
  `image`). The repo's `.bin/tsc` shim has a node shebang and the image has no node, so the
  repo's tsc is run with bun. Chosen once at the base commit and reused after the patch;
  `tsc: { source, version }` is recorded on every typecheck result. On Recall: `repo`, 5.9.3.
- **Typecheck gate = baseline comparison.** tsc's errors are parsed at the base commit inside the
  sandbox (`file(line,col): error TSnnnn: message`; continuation lines skipped; errors without a
  location have file ""). After the patch, a run fails only on errors not in the baseline,
  matched by file + TS code + message and counted (two identical baseline errors cover two, not
  three); line and column are ignored. This **replaces** the count comparison, which let "fix one
  error, add another" pass. A tsc that exits non-zero without reporting anything is a failure
  when the baseline passed or reported errors. Unit tests: shifted lines pass; a new error fails
  (also at an equal count, and as a third copy of a duplicated error); a removed baseline error
  passes; a silent non-zero exit fails.
- **Seed patch** (`"seed": { "patch": "seed.patch" }` in task.json): written to `/tmp`, applied
  with `git apply` right after checkout, then removed. Install and the history squash come after,
  so the seeded tree is the single `base` commit and the agent's diff never contains the seed.
  A patch that doesn't apply ends the run FAILED "applying the seed patch failed"; one that
  leaves `git status --porcelain` empty ends it FAILED "the seed patch changed nothing". The
  record carries the patch's sha256. `baseSha` stays a real commit of the target repo.
- **Task kind:** `"kind": "smoke" | "evaluation"`, copied to the record as `taskKind`.
- **Network with a subdirectory profile:** unchanged mechanism (decision 036): seed → `cd
  "recall-backend" && bun install --frozen-lockfile` with the network on → squash → `docker
  network disconnect` → both probes must fail → REPRODUCING. In the recorded run: install exit 0
  ("210 packages installed"), probes exit 6 and 7, then the repro and a baseline of 62 passing
  tests with the network off.
**Smoke task `eval/tasks/recall-smoke-trending` (`kind: smoke`; never an evaluation task).** The
seed drops `"trending"` from `detectGitHub`'s list of non-repository first path segments
(`recall-backend/services/linkDetector.ts`, one line); the 62 existing tests still pass at the
seeded base, and `repro.test.ts` fails there. Scripted patches with the existing `oracle` and
`noop` agents, no model, 2026-10-02, local Docker 29.8.0:

| Run | State | Reason |
|---|---|---|
| `oracle` + `fix.patch` | RESOLVED | repro passes and nothing fails that passed at baseline (5 tsc errors at baseline, the same 5 after) |
| `noop` (empty patch) | UNRESOLVED | repro still fails (exit 1) |
| `oracle` + `fix-breaks-test.patch` | UNRESOLVED | regression `cd "recall-backend" && bun test` now fails (exit 1; passed at baseline) |
| `oracle` + `fix-adds-tsc-error.patch` | UNRESOLVED | typecheck recall-backend: 1 error(s) not in the baseline: `services/linkDetector.ts TS2322: Type 'string' is not assignable to type 'number'.` |
| `oracle` + `fix.patch`, container `docker kill`ed during BASELINE | FAILED | sandbox container disappeared |

The same five are `test/harness-recall.test.ts` (Docker + `TRACEHOUND_NETWORK_TESTS=1`; there
the kill happens as the patch is applied). About 35–45 s per scripted run.
**One real agent run** (the only model call of this decision; nothing was tuned before or after
it): `--agent nemotron --graph off`, agent-v4 defaults, Nano with reasoning on → **RESOLVED**,
24 steps, 24 calls, 148,391 tokens (139,311 in / 9,080 out), $0.01054, 186 s. Its diff appends
`"trending"` to the list. One run on a seeded one-line bug in a smoke task: it shows the loop
runs on Recall, and says nothing about repair performance or about the graph. Ledger:
$0.32091 → $0.33144.
**Findings, not fixed here (backlog):**
- In the killed run the record says `sandbox.destroyed: false`, `removedBy: "unknown"`: when the
  harness checked, Docker still listed the killed `--rm` container as `Dead`. It was gone a few
  seconds later. The record is truthful about that moment, but nothing rechecks.
- The regression gate compares one exit code per command. With one `bun test` for the whole
  suite, a task whose seed makes any existing test fail at baseline can't detect a patch that
  breaks another test. The smoke seed was chosen so the suite passes at the seeded base.
**Rejected:** (a) Seeding with `sed` in a setup command: no file to review, and a no-op
substitution exits 0. (b) A seed commit on a Recall branch: Recall is not to be changed, and the
agent could find it. (c) Per-repo branches in the harness (`if recall`): the profile is data.
(d) Keeping the error count with a tolerance: 5 → 5 hides a swapped error. (e) Matching errors
with line numbers: any edit above an old error would fail the run. (f) Always using the image's
tsc: a repo pinned to another TypeScript would be checked by the wrong compiler.

## 042 · BullMQ queues through dependency injection (detector bullmq-queues@0.2; analyzer 0.10.0)
**Context:** decision 041 found that at Recall `57d920e` the API → queue `produces` edge is gone:
the producer calls `.add` on a value destructured from a function parameter typed as a
hand-written interface, and the real `Queue` is built in a factory and passed in at the
function's call site. `bullmq-queues@0.1` resolved a receiver only when it was a variable
initialized with `new Queue(…)`.
**This resolution was built after Recall's seams broke the edge, to bring that edge back. Recall
is therefore not an unseen-repo result for it**, exactly as for the detector itself (decision
035). The fixtures are generic code, not copied from Recall, but their shapes were chosen knowing
Recall's. A held-out repo is still needed to say anything about how this generalizes (backlog).
**Choice** (`src/extract/bullmq.ts`; no repo-specific names):
- **Without crossing a parameter** a receiver now resolves through variables, imports and
  re-exports (as before), and through a **factory's return value**: `const q = make()` or
  `const { q } = make()`, where every `return` of `make` leads to the same `new Queue(…)`
  (directly, or as a property of a returned object literal). Returns that disagree → not
  resolved. The label is the queue name's own (a literal → `proven`): one function with one
  possible result is as fixed as a variable.
- **One parameter hop.** A receiver that is a parameter, one property of a parameter
  (`deps.q`, `{ q }`, `const { q } = deps`, `const q = deps.q`) of a named function is resolved
  through **that function's call sites** (ts-morph references across the project). At each site
  the argument, or that property of an object-literal argument, is resolved as above.
  - exactly one real Queue among the sites → one `produce` fact for it;
  - several different real Queues → one fact per queue;
  - a site that passes anything else (a test's fake, an object the detector can't resolve)
    creates no node, edge or warning; it is counted and named in the add site's evidence;
  - no site resolves → no fact, unless the value is known to be a queue: the parameter is typed
    as bullmq's `Queue`, or a Queue is reachable through more parameter hops (probed to 3). Then
    it is a `produce` fact without a queue → a `queue-unresolved` warning naming the add site.
    An `.add` on a parameter that nothing ties to BullMQ (`Set.add`) stays what it was: nothing.
  - **One hop only.** A second hop is never an edge (fixture d). Methods and anonymous functions
    have no call sites to follow.
- **Evidence is three sites, never empty.** The fact's own evidence is the add call; it carries
  `wiredAt` and `supportEvidenceIds`: one evidence item at each wiring call site and one at the
  `new Queue(…)`. The edge cites all three (`aggregate/edges.ts`), each with the edge's label, so
  the construction's own `proven` name can't lift the edge.
- **Label proposed for a and b: `resolved-default` (0.7), capped at the queue name's own label.**
  - Not `proven`: at the add site the queue isn't named; it is whatever callers pass. `proven`
    elsewhere means the code at the evidence line pins the value (a literal, or a binding the
    compiler resolves to one declaration). Here it is data flow through a call, and the function
    can be called with something else: fixture b's test does exactly that, and callers outside
    the analyzed files can't be ruled out.
  - Not `dynamic`: every call site in the repo that passes a Queue passes the same one, and each
    step is pointed to. That matches the scheme's 0.7 tier, "value resolved via indirection".
  - b gets the same label as a: a fake creates nothing, so the real wiring is still the only one.
  - **c is `dynamic` (0.5):** each queue is really wired, but which one a given `add` reaches is
    decided at runtime, which is the scheme's "real op, operand not fixed".
- **Worker label:** an inline processor whose body is a single call of one named function is
  labelled with that function (`Worker processContent`), and its evidence says it is wrapped.
  Job-name filtering is also looked for in that function when the wrapper passes its job on.
**Fixtures** (`test/bullmq.test.ts`, each a small repo analyzed for real; all pass):

| | Case | Result |
|---|---|---|
| a | one parameter (object property, destructured), one call site | `produces`, `resolved-default`; evidence at the wiring site, the add site, the construction |
| b | a + a test file passing a fake | the same edge and label; no extra node, edge or warning; the fake's site is named in the evidence |
| c | two call sites, two real queues | two edges, both `dynamic`, each with its own wiring site and construction |
| d | two parameter hops | no edge; `queue-unresolved` naming the add site; a plain `Set.add` on a parameter is still not a fact |
| e | Queue returned from a factory, destructured | `produces`, `proven`; a factory whose returns disagree is not resolved |
| f | Worker with an arrow wrapping one named function | label `Worker sendEmail`; two statements stay `<inline function>` |
| a+e | factory-built queue through one parameter | `produces`, `resolved-default`, three evidence sites |

**Recall `57d920e`** (analyzed into a temp dir with `--naming heuristic`; nothing written to
`snapshots/`):

| | Before (`bullmq-queues@0.1`) | After (`@0.2`) |
|---|---|---|
| `recall-backend:brainly-server -produces-> bullmq:content-processing` | missing | `resolved-default` (0.7), label `add process-content`, evidence `recall-backend/index.ts#L162-170` (add), `recall-backend/index.ts#L504-504` (wiring), `recall-backend/config/queue.ts#L19-30` (construction) |
| `bullmq:content-processing -consumes-> recall-backend:worker` | `proven`, label `Worker <inline function>` | `proven`, label `Worker processContent` |
| `queue-unpaired` warning | present | gone |

The add site's evidence also names the test helper's call (`recall-backend/test/helpers/app.ts:119`)
as passing something that is not a Queue. Components are unchanged; edges 7 → 8; warnings 5 → 4.
At the published `5d2165a` this edge was `proven`; at `57d920e` it is `resolved-default`, which
is what the code now supports.
**Step 4, as found before the addendum below** (Recall `57d920e`):
- `recall-backend/test/*.test.ts` (8 files) are in no component; they are `tests` links.
  `test/helpers/app.ts`, `helpers/db.ts`, `helpers/network.ts` and `test/setup.ts` don't match
  the test-file pattern (`*.test|spec.*`, `__tests__/`), so they are source files and land in
  `recall-backend:shared` ("not imported by any entry point; no single owner").
- `shared` 7 → 12: those four files, plus `services/aiProcessor.ts`, which `index.ts` now also
  imports, so it is "used by Brainly Server, Recall Backend Worker".
- `worker` 3 → 2: the same `aiProcessor.ts` left it ("only reachable from the worker" no longer
  holds).
- Side effects of the helpers being source: `shared → brainly-server` and `shared → queue`
  import edges whose only evidence is `test/helpers/app.ts`, and orphan warnings for
  `helpers/app.ts` and `setup.ts`.
**Regeneration at 0.10.0** (the version guard's own commands, temp clones, `--cache-only`; CEX
7/7 and Recall 4/4 names cached, no spend). Leaf-by-leaf against 0.9.0:

| File | Differences beyond `analyzerVersion`, timestamps, temp paths |
|---|---|
| `snapshots/da0e3d6…/0.10.0.json` (CEX) | none. No edge or warning changed (CEX has no BullMQ) |
| `snapshots/5d2165a…/0.10.0.json` (Recall) | three evidence `detail` strings end in `(bullmq-queues@0.2)` instead of `@0.1`. No edge or warning changed; **the produces edge is still `proven`** (`recall-backend/index.ts#L153-161`, a directly imported queue variable) and the consumes edge still `proven`, `Worker processContent` |
| `changesets/cex-seed-queue-consumer.json` | `config` path only (it records the checkout's absolute path; the previous one was generated in another worktree) |
| `changesets/toy-discount-run.json` | none |
| `changesets/recall-5d2165a.json`, `recall-7943212.json`, `recall-worker-deleted.json` | `config` path only |

In every change set the edges with their status, the warnings and the component rollups are
identical. `impacts/*.json` stay on their 0.7.0 base, as before.
- **Index:** `snapshots/index.json` gains the two 0.10.0 entries. Its top-level `latest` moved
  from CEX `da0e3d6` to Recall `5d2165a`: `upsertManifest` keeps `latest` on the default repo,
  and `defaultRepo` has been `recall` since decision 040.
- **Tests touched by the regeneration:** `packages/analyzer/test/manifest.test.ts` needed no
  change (it reads whatever `latest` points at). Two viewer tests hardcoded the `0.9.0` file name
  (`viewer/test/repos.test.tsx`, `viewer/test/snapshot-data.test.ts`); they now match any
  version. No viewer source changed.
**Recall `57d920e` for graph-on runs:** `eval/snapshots/57d920e…/0.10.0.json` (not published; 7
components, 8 edges, 4 warnings). `--cache-only` has no cached names for this commit's facts, so
it uses heuristic names plus the config's overrides; no naming spend. The smoke task's
`task.json` gained a `snapshot` line pointing at it (needed for `--graph on`; ignored otherwise).
**One graph-on smoke run** (`recall-smoke-trending`, a smoke task, never an evaluation result;
nothing tuned): `--agent nemotron --graph on`, agent-v4, Nano, reasoning on → **RESOLVED**, 22
steps, 22 calls, 144,815 tokens (133,783 in / 11,032 out), $0.01067, 111 s. **The agent made no
graph tool calls** (`graphCalls: []`), so this run says nothing about the graph; it shows that a
graph-on run on Recall starts and reaches a verdict. Ledger: $0.33144 → $0.34212.
**Addendum (same branch, still 0.10.0): test support files, and recorded paths.**
- **Test support.** A non-test file under a directory named `test`, `tests` or `__tests__`
  (helpers, fixtures, a preload) is handled like a test file: it keeps its facts and evidence
  but is in no component, so it draws no component edge and gets no orphan warning
  (`isTestSupportFile` in `aggregate/tests.ts`; the rule is the directory name, nothing
  repo-specific). It makes **no** TESTS link: it is not a test, and `get_related_tests` should
  not offer a helper as one. A queue wired in from such a file is still a call site: fixture b
  is unchanged, and a new fixture puts the fake in `test/helpers/` and still finds it named in
  the add site's evidence.
  - Fixtures (`test/bullmq.test.ts`): a helper that imports the app entry, a preload nothing
    imports and a `tests/fixtures` file → in no component, no edges, no warnings, facts kept; the
    same helper under `src/` is still grouped and an unimported file is still an orphan.
  - **Recall `57d920e`** (`eval/snapshots/`), before → after: `shared` 12 → 8 files, edges
    8 → 6 (`shared → brainly-server` and `shared → queue`, whose only evidence was
    `test/helpers/app.ts`, are gone), warnings 4 → 2 (the orphans `test/helpers/app.ts` and
    `test/setup.ts`). No edge was added or changed; the produces edge keeps its three evidence
    sites and still names `recall-backend/test/helpers/app.ts:119` as the non-Queue call site.
  - **Consequence for TESTS links:** imports of a helper no longer count. Links 11 → 10:
    `metadataFetcher.test.ts → shared` existed only through a helper; six other links to
    `shared` lose their helper imports as evidence. Tests that reach the API only through
    `helpers/app.ts` have no link to `brainly-server` (they had none before either). Following
    a test through its helpers to the components they import is not done (backlog).
- **Recorded paths.** Snapshots never held machine paths. Change sets did: `repo.path` (the
  temp clone) is no longer written (optional in the schema, so older files still parse), and
  `config` is relative to the repo when it lives there, else to where the command ran
  (`configs/recall.tracehound.json`). `nodeModules` was already repo-relative. `repo.name` of a
  `--run` change set is still the CLI's temp-copy name (a decision 040 CLI gap, unchanged).
- **Regenerated again, against this branch's previous files:** CEX `da0e3d6` and Recall
  `5d2165a` snapshots differ only in timestamps (neither has non-test files under a test
  directory); the Recall produces edge at `5d2165a` is still `proven`. The five change sets
  differ in `repo.path` (gone), `config` (relative; the toy's has none) and runtime; edges,
  warnings and rollups are identical. No spend.
**Limitations:** one hop; named functions only (no methods, no callbacks); the argument must be
resolvable at the call site (an object literal for a property); call sites in ignored files
count; a non-Queue site outside test files is treated like a fake (named in evidence, no
warning).
**Rejected:** (a) Following any number of hops: each hop multiplies the call sites that can
disagree, and the edge gets harder to point to. (b) Trusting the parameter's type: a hand-written
interface says nothing about which queue. (c) Matching by variable or property name
(`contentQueue`, `queue`): an edge nobody can point to. (d) `proven` for a single wiring: see the
label reasoning. (e) Ignoring test call sites by path: a fake is recognised by not resolving to a
Queue, wherever it lives.

## 043 · A per-test regression gate; study S1 recorded
**Context:** the regression gate compared one exit code per command (decision 041's finding).
Recall's profile runs the whole suite as one `bun test`, so once any test fails at the base
commit, the command exits 1 before and after the patch, and a test the patch breaks is invisible.
The typecheck gate was already per error (decision 041); this does the same for tests. Separately,
study S1 measured the BullMQ detector on ten unseen repos; its summary is recorded below.
**Checked before building:** the sandbox image's bun (1.4.2) has a JUnit reporter
(`bun test --reporter=junit --reporter-outfile=<file>`). One `<testsuite>` per file, a nested
`<testsuite>` per `describe`, `<testcase name file line>` with a `<failure>` or `<skipped>` child.
A file that fails to load writes no `<testcase>` at all, and the console output is unchanged. On
Recall `57d920e` it reports 62 test cases, the same 62 the console counts.
**Choice:**
- **Repo profile** gains an optional `testReport: { format: "junit", command }`. The command is
  the suite again with the reporter on, and must contain `$REPORT`; it needs `test`. Recall:
  `bun test --reporter=junit --reporter-outfile=$REPORT`. `CheckPlan.reports` maps the regression
  command to its report command, and the record's `plan` carries it. The agent is still told the
  plain `test` command (no agent prompt or tool changed).
- **Collection:** at BASELINE and VERIFYING a regression command with a report runs as
  `rm -f <file> && <report command>`, where `<file>` is a fresh `/tmp/.th-report-<uuid>.xml`
  outside the repo. The harness reads the file, removes it, and parses it (`src/harness/junit.ts`,
  no XML dependency). The command's exit code is recorded and counts as before. Each test is keyed
  by its file, as the runner printed it, plus its full name (`describe > … > test`). Same-key
  duplicates get ` (2)`, ` (3)` in report order. No file, or a file that isn't JUnit, gives
  `reportError` and no `tests`.
- **Verdict rule, per test:** when the baseline run reported at least one test, the run is
  UNRESOLVED if any test that **passed at baseline** is failed, skipped or missing after the
  patch:
  - missing covers deleted, renamed, its file no longer loading, and no report at all;
  - tests that failed at baseline don't count, whether still failing or fixed;
  - tests the baseline didn't have don't count, even failing ones. Agent-added test *files* are
    still removed before verification (decision 034).

  Two additions beyond "fails or is missing":
  - skipped counts as regressed, because a patch can't make a test pass by skipping it;
  - a command that exited 0 at baseline and now exits non-zero fails the run even if every
    baseline test still passes, for example an unhandled error between tests. With a passing
    baseline this is exactly the old rule, so the per-test gate is never weaker than it.

  The reproduction test keeps its own check: it is removed before the regression runs, as before.
- **A renamed test is a regression, strictly on purpose.** The old name is missing, and the new one
  is a test the baseline didn't have. Matching renames by line, body or similarity would let a
  patch replace a test's assertions under a near name. Renaming tests isn't the job of a repair, so
  a false UNRESOLVED here is the cheaper error.
- **Fallback:** no `testReport` in the profile, a task's own regression commands, or no usable
  report at baseline → the exit-code comparison of decision 041, unchanged.
- **Run record:** `comparison.granularity` is `"test"` when every regression command was compared
  per test, `"command"` when none was, `"mixed"` otherwise (no task has that today).
  `comparison.regressedTests` lists `{ cmd, file, name, now: failed | skipped | missing }`. Each
  regression result carries `tests` and `reportError`. A reason names up to 10 tests;
  `regressedTests` has them all.
**Unit tests** (`test/harness-run.test.ts`, "per-test regression gate", fake provider, end to end
through `runRepair`). The baseline has A failing and B, C passing:

| Case | Result |
|---|---|
| the patch breaks B | UNRESOLVED, names B (`failed`); exit codes alone were 1 and 1 |
| the patch deletes C | UNRESOLVED, C `missing` |
| the patch renames C | UNRESOLVED, C `missing` (strict, above) |
| the patch skips C | UNRESOLVED, C `skipped` |
| the patch fixes A, or leaves A failing | RESOLVED both ways |
| the patch adds a failing test D | RESOLVED |
| no report after the patch | UNRESOLVED, B and C `missing`, `[no report written]` |
| same tests pass, the suite now exits 1 (baseline exit 0) | UNRESOLVED |
| no `testReport` in the profile | `granularity: "command"`; breaking B is RESOLVED (the blind spot) |
| a `testReport` but no report at baseline | `granularity: "command"`, `reportError` recorded |

The same file also tests the parser on bun's shape (nested describes, entities, duplicates, an
`<error>` child, non-JUnit input throws), the profile rules, and `"mixed"`.
**Recall** (scripted patches, no model, local Docker):
A second smoke task, `eval/tasks/recall-smoke-baseline-failing` (`kind: smoke`, never an
evaluation task), has a seed that does two things:
- it adds the same `"trending"` bug and repro as `recall-smoke-trending`;
- it stops Instagram `/reel/` URLs being detected.

Checked in the image before writing the tests: at the seeded base, the suite reports 61 passing
and 1 failing (`detectLinkType > instagram posts and reels`), and `bun test` exits 1. A first
seed (Twitter's `status` path) failed two tests (the look-alike-domain test uses a status URL), so
it was replaced. Runs on 2026-10-03, local Docker 29.8.0, image
`tracehound-sandbox:bun1.4.2-ts5.9.3-2`, about 45–50 s each; these are `test/harness-recall.test.ts`
6–8:

| Run | Exit code at baseline → after | State | Reason / record |
|---|---|---|---|
| `oracle` + `fix-breaks-test.patch` (adds `"trending"` and `"oven-sh"`) | 1 → 1 | **UNRESOLVED** | `regression "cd "recall-backend" && bun test": 2 test(s) that passed at baseline now fail or are missing: test/linkDetector.test.ts > detectLinkType > github repos, including deeper paths; reserved first segments are not repos (failed); test/linkDetector.test.ts > detectLinkType > input without a scheme gets https://; unparseable input is a link (failed)`. Pre-existing: "1 test(s) failed at baseline, 1 of them still fail" |
| `oracle` + `fix.patch` | 1 → 1 | **RESOLVED** | repro passes and nothing fails that passed at baseline. 62 tests reported after the patch; the Instagram test is still the only failing one |
| `oracle` + `fix-breaks-test.patch`, profile without `testReport` | 1 → 1 | RESOLVED | `granularity: "command"`: the blind spot this decision closes, shown on the same patch |

**The five existing results hold** (`recall-smoke-trending`, same file, tests 1–5): RESOLVED,
UNRESOLVED (repro still fails), UNRESOLVED (regression), UNRESOLVED (new tsc error), FAILED
(sandbox container disappeared).
- Test 1 now also checks the per-test baseline: 62 tests, all passing, and `granularity: "test"`.
- Test 3's state is unchanged, but its reason now names the two broken tests instead of saying the
  command "now fails (exit 1; passed at baseline)". Its assertion was updated to match.

The toy tasks and the CEX infrastructure test have no profile, so they are unchanged
(`granularity: "command"`). All Docker and network test files pass:
`TRACEHOUND_NETWORK_TESTS=1 pnpm test`, 317 analyzer and 88 viewer tests (318 after the CI fix below).
**Rejected:** (a) Parsing bun's console output (`(pass)` / `(fail)` lines): it's a display format,
and multi-line names and errors between tests make it ambiguous. (b) One command per test file:
slower, and a file-level result still hides a test inside it. (c) Matching renamed tests by line
or similarity: see above. (d) Keeping exit codes and requiring a passing baseline: seeds and real
repos have failing tests, and the gate has to work there.
**CI fix on the same branch:** CI failed on `main` at `72bc39f` (before this decision) and on this
branch's first push, with every test file passing. The cause was an unhandled `write EPIPE` from
the process runner (`src/harness/docker.ts`, `run`), raised while `harness-docker.test.ts` ran.
`child.stdin` had no error listener, so a docker process that exited before reading its input
crashed the test worker. Now a stdin error is appended to stderr, and a child that exits 0
without taking non-empty input counts as exit 1. A unit test pipes 8 MB into `sh -c "exit 0"`;
it fails without the fix and passes with it. It never reproduced locally in the full suite. **The failure is intermittent:** the PR #5 head
`c8f1c24` and the merge `72bc39f` have identical trees, and CI passed on the first and failed on
the second. It appeared in 2 of the last 60 CI runs (`main` at `72bc39f`, and this branch's first
push). No merge introduced it: the unguarded stdin write dates from the harness core (`3ddeb5e`,
decision 026).

### Study S1: the BullMQ detector on ten unseen repos
Study S1 (`tracehound-study` @ `75913ef`, read only) ran the analyzer on ten public BullMQ repos it
had never seen: unmodified, with no config. Macro-average pairing was **2.1%**, on 0.9.0 and on
0.10.0 alike, against a pre-registered 70% bar. Worker detection was 12.4% and queue detection
50.0%. No site was named wrong; there was one false edge, a queue node `dynamic-dynamic` (usesend).
The five miss reasons, by count:
1. producers reach the queue through a getter, singleton or forwarder (116);
2. the name is built at runtime or is a loop variable (41);
3. the Queue or Worker is built inside a wrapper whose name is a parameter (35);
4. a Worker is named by `someQueue.name` (20);
5. the name is an enum member (16).

Decision 042's parameter-following path fired in 0 of 10 repos. Reading 348 history candidates
found 4 queue contract bugs.
The report is in `docs/studies/s1-unseen-repos.md`. It quoted short code expressions from the
target repos (its lines 72, 84–86 and 90–92). On the owner's instruction these were replaced by
file:line references at the study's pinned commits, using sampled ground-truth sites; nothing
else changed. `new Queue(...)` stays: it names BullMQ's constructor in the description of the
detector and isn't quoted from a target.

## 044 · Four seeded dev tasks on Recall
**Context:** the agent's prompts need tasks to be tuned on that are not evaluation tasks (prompt
`docs/prompts/build-to-freeze.md`, Phase 2). Recall (`57d920e`, `testable-baseline`) is the
evaluation repo. CLAUDE.md had the dev tasks as the user's, on CEX; this prompt has four seeded
Recall tasks written here (build log, step 0, item 2), so the ids are `recall-dev-*` and
`dev-01` / `dev-02` stay free.
**Choice:**
- **Task kind `"dev"`** (`TaskSpec.kind`, copied to `taskKind`): a task the prompts may be tuned
  on. Like `smoke`, never an evaluation result.
- **Four tasks**, each a one-line seed in a different backend file (none in `linkDetector.ts`),
  an issue written as a user's bug report with no file or function names, a reproduction copied in
  only while the harness reproduces and verifies (as for every task), and an oracle `fix.patch`.
  Components are those of `eval/snapshots/57d920e…/0.10.0.json`.

  | Task | Seeded fault (file) | Symptom seen in | Fault in |
  |---|---|---|---|
  | `recall-dev-short-summary` | not-enough-text threshold 20 → 200 (`worker.ts`, `processContent`) | API: a short saved page is listed as done with no summary or tags | worker, **across the `content-processing` queue** |
  | `recall-dev-search-description` | `og_description` dropped from the generated `search_vector` (`db/schema.ts`) | API: keyword search misses a description-only match | shared library |
  | `recall-dev-session-expiry` | `jwt.verify(…, { ignoreExpiration: true })` (`middleware/middleware.ts`) | API | API (same component) |
  | `recall-dev-chat-recent` | chat's no-embedding fallback orders oldest first (`index.ts`) | API: Ask AI cites the oldest saves | API (same component) |

  Two tasks have the symptom in one component and the fault in another; one of them crosses the
  queue (the repro saves through `POST /api/v1/content`, processes the queued job with
  `processContent`, and reads `GET /api/v1/content`).
- **Every seed leaves Recall's own suite green** (62 of 62 at the seeded base), so the per-test
  gate (decision 043) watches every existing test; the seeds were chosen against behaviour the
  existing tests don't pin. Each seed and repro was first checked on a local clone (seeded suite
  62 pass; repro fails on its assertion at the seed and passes with the fix), then in the sandbox.
- **Validation** (scripted, no model, 2026-10-03, local Docker 29.8.0, image
  `tracehound-sandbox:bun1.4.2-ts5.9.3-2`, about 50 s each). All four passed both checks, so none
  was replaced:

  | Task | `oracle` + `fix.patch` | `noop` |
  |---|---|---|
  | `recall-dev-short-summary` | RESOLVED (granularity `test`, 62/62 baseline tests still pass, tsc 5 → 5) | UNRESOLVED, repro still fails (exit 1) |
  | `recall-dev-search-description` | RESOLVED (same) | UNRESOLVED, repro still fails (exit 1) |
  | `recall-dev-session-expiry` | RESOLVED (same) | UNRESOLVED, repro still fails (exit 1) |
  | `recall-dev-chat-recent` | RESOLVED (same) | UNRESOLVED, repro still fails (exit 1) |

  The same eight runs are the decision 044 block of `test/harness-recall.test.ts` (Docker +
  `TRACEHOUND_NETWORK_TESTS=1`; first a file of their own, merged in Phase 3 so that no two Recall
  sandboxes run at once, see decision 045).
- **Kept out of this repo on purpose:** nothing about Recall's existing behaviour beyond what each
  seed changes; no task is built on an existing bug.
**Rejected:** (a) Seeds that make an existing test fail: the failing test points at the file, and
the per-test gate would have one test fewer to watch. (b) Repro tests that call the faulty
function directly for the cross-component tasks: the queue task's repro goes through the API, as
the symptom does. (c) Replacing the CEX tasks' ids: they stay the user's.

## 045 · The graph-on arm: the context packet in the first message (agent-v5)
**Context:** until now "graph on" only added the graph tools and one prompt sentence; in the two
graph-on smoke runs and the four graph-on baseline runs below the agent never called a graph
tool. The evaluation compares two arms, so the graph-on arm has to put the graph in front of the
agent (prompt `docs/prompts/build-to-freeze.md`, Phase 3).
**Choice (agent-v5, `LOOP_VERSION = "agent-v5"`, `harness/prompts/agent-v5.md`; v1–v4 kept):**
- **Graph on:** the first user message is the issue, then the context packet for the issue text,
  then the limits sentence. The packet is exactly what `tracehound context --issue "<issue>"`
  prints for the task's snapshot (`formatContext(buildContext(…))`, default budget 2,000
  estimated tokens), built with the run's `--decider` (default lexical: deterministic, no model
  call; decider-v1 stays frozen). It is preceded by one fixed heading line. The graph tools stay
  available, and the prompt gets one more `GRAPH:` line saying the packet is there and is a hint
  from static analysis to be confirmed in the code.
- **Graph off:** neither the packet nor the tools nor the `GRAPH:` lines. Otherwise the two first
  messages are the same text.
- **Budgets are identical:** steps, tokens, wall clock and cost come from the task. The packet
  costs no step. Its tokens are part of every model call's input, so they count against the
  token budget like everything else (test: a 1,500-token limit lets graph off start and stops
  graph on after its first call).
- **Run record:** `arm { arm: "graph-on" | "graph-off", packetInjected, packetChars,
  packetTokensEstimated (chars/4), graphToolCalls }`, from the agent once it stops
  (`Agent.armReport`); scripted agents have none. The trace keeps `packet { injected, chars,
  tokensEstimated, sha256, decider, confidence }`. The CLI prints an `arm:` line.
- Everything else is agent-v4's: Nano, reasoning on, temperature 0, guards, nudge, output cap,
  /scratch, edit accounting.
**Baseline and tuning** (dev tasks only, Nano, reasoning on, one run per task and arm, both arms of
a task run at the same time, 2026-10-03, local Docker 29.8.0). Changes were made only to text
both arms get; the `GRAPH:` lines were not touched. Single runs: the differences below are within
what one run per cell can show, and no conclusion about the graph is drawn from them.

| Round | Prompt (sha256 of agent-v5.md) | Change | graph-on resolved | graph-off resolved |
|---|---|---|---|---|
| baseline | `d1d07e8f…` | — | 1 of 4 | 1 of 4 |
| 1 | `556861d4…` | a rule to keep outputs small: the token limit runs out first, so search narrowly, read line ranges around hits, don't re-read | 2 of 4 | 3 of 4 |
| 2 | `644e6477…` | round 1 + "every reply must call a tool; think briefly" | 2 of 4 | 1 of 4 |

- Why these changes: in the baseline 5 of 8 runs ended on the 300,000-token budget at about 30
  turns (each call resends the conversation); round 1 then had 20 replies without a tool call,
  6 of them 4,096 output tokens of reasoning with no call.
- **Round 2 made its own target worse:** replies without a tool call 20 → 38, of them at the
  output cap 6 → 17 (unknown-tool calls 12 → 9). **The frozen prompt is round 1's**
  (`556861d4…`), the exact file all eight round-1 runs used: round 2's line is removed, nothing
  new is added, and there is no third round. This is a choice between two states that were both
  run, made on round 2's mechanism, not on its resolve count.
- **Graph tool calls: 0 in all 12 graph-on runs.** The packet in the first message was the only
  graph input any run used.
- Full per-run tables are in `docs/build-log.md` (Phase 3).
- **Finding: load can turn a correct patch into UNRESOLVED.** In the first Phase 3 gate, two
  Recall test files ran their sandboxes in parallel (with the other Docker files; Docker VM 10
  CPUs, 8 GB, 2 GB per sandbox). The oracle fix of `recall-dev-session-expiry` came out
  UNRESOLVED (repro exit 1 after the patch), and in smoke test 6 all five `worker.test.ts` tests
  were reported missing after the patch. Unloaded, the repro takes about 3.5 s and the suite
  about 10 s, against bun's 5 s default timeout, which Recall's PGlite setup hooks can exceed when
  starved. Fix: the dev-task tests moved into `test/harness-recall.test.ts`, so Recall sandboxes
  run one at a time; the next gate passed. **For evaluation runs this means concurrency 1** (the
  runner's default, decision 046): the per-test gate is only as reliable as the target suite's
  timing.
**Rejected:** (a) Injecting the packet as a fake tool result: it would cost a step in one arm only.
(b) The JSON packet the `context_packet` tool returns: the CLI's text form is shorter and is what
"the existing context tool" prints. (c) The nemotron decider for the injected packet: a model call
in one arm only, and decider-v1 is frozen. (d) Keeping round 2's line because it was the last
round: it doubled the behaviour it was meant to remove. (e) Tuning `GRAPH:` lines: wording only
one arm gets.

## 046 · The evaluation runner
**Context:** the evaluation needs one command that runs every task in both arms, with repeats,
and writes the results (prompt `docs/prompts/build-to-freeze.md`, Phase 4). The held-out tasks
live outside this repo.
**Choice** (`packages/analyzer/src/harness/evaluate.ts`):
```
node packages/analyzer/src/harness/evaluate.ts --tasks <dir> [--arms on,off] [--repeats 1]
     [--kind <kind>] [--out <dir>] [--concurrency 1] [--max-spend-usd <usd>]
     [--reasoning on|off] [--decider lexical|nemotron]
```
- **Its own entry point**, not a `tracehound` subcommand: the CLI dispatcher (`src/bin.ts`) and
  the root `package.json` are outside the paths this prompt may touch (build log, step 0, item 7).
- **Tasks:** every `<dir>/*/task.json` (or `<dir>/task.json` itself), each loaded and validated
  with `loadTask` before anything runs, sorted by id, optionally filtered by `kind`. The directory
  may be anywhere; task paths resolve against each task's own directory, as always.
- **One run = one `tracehound repair --agent nemotron --graph <arm>` process**, in task-major
  order (both arms of a repeat, then the next repeat, then the next task). That is the same code
  path as a single run: the same record, the same ledger, and a fresh client per run, so the
  shared client's per-process cap (`TRACEHOUND_BUDGET_RUN_USD`) stays per run. The record is read
  from the file the run names on stdout.
- **Concurrency defaults to 1.** Decision 045 found that two Recall sandboxes at once can make
  Recall's own tests time out and turn a correct patch into UNRESOLVED.
- **Spend stop** (`--max-spend-usd`): before a run starts, the ledger's growth since the runner
  started, plus the task cost limits of the runs in flight and of this one, must stay within the
  cap. Otherwise that run and every later one are `NOT_RUN`, with the reason. The exit code is 2
  when any run is NOT_RUN or FAILED.
- **Output** in `--out` (default `runs/eval-<timestamp>/`): `runs/` (each record), `results.json`
  (settings, ledger before/after, one row per run, per-arm totals) and `results.md`. Per run:
  task, arm, repeat, state, steps, tokens, cost, wall time (record start → end), files opened
  (`baseFilesRead`, decision 034), graph tool calls. Then per arm: n, resolved / unresolved /
  failed "k of n", and sums with means, **n printed beside every total**. The table states that no
  significance test was run; none is computed.
- **Tests** (`test/harness-evaluate.test.ts`, fake executor, no Docker or model): discovery
  (kind filter, one task dir, a directory outside the repo, errors), task-major planning, rows
  from records, a run without a record → FAILED with the reason, the spend stop (that run and every
  later one NOT_RUN, the reason gives the numbers), totals and the table, bad arguments → exit 3.
**Rejected:** (a) Calling `runRepair` in-process: one client and one per-process cap for all
runs, and a crash in one run would end the others. (b) Parallel runs by default: see decision
045. (c) Mean resolve rates with intervals or tests: four tasks and one repeat can't support them,
so the table gives counts with n.

## 047 · agent-v6: the str_replace_editor alias and an edit retry for line endings
**Context:** in the 32 agent-v5 dev runs (decisions 044–046) every run that called `finish` was
RESOLVED and all 19 UNRESOLVED runs ended on a budget (18) or the stuck stop (1). The agent read the
fault file in every run. Two mechanical losses: 53 calls to `str_replace_editor`, a tool that
doesn't exist here (47 of them reads), each a wasted step with its tokens; and 14 failed edits, 12
of them "oldText not found" (prompt `docs/prompts/agent-v6.md`; per-run table in
`docs/build-log.md`, agent-v6 Phase 1). This decision fixes edit mechanics the same way in both arms
and changes nothing else: the prompt file, budgets, guards, model settings and the arms are
agent-v5's.
**Choice (agent-v6, `LOOP_VERSION = "agent-v6"`; prompt `harness/prompts/agent-v5.md`, unchanged,
sha256 `556861d40ba86940a72c05d15b08cf07eea15a6d8a5508c6c7d3d352b92222b6`):**
- **`str_replace_editor` is an alias** (`aliasCall`, `src/harness/loop.ts`) for exactly the argument
  shapes the 32 runs used, and nothing else:

  | Shape | Runs as |
  |---|---|
  | `{command: "view" \| "read", path}`; `{path}` | `read_file {path}` |
  | `{command: "view" \| "read", path, startLine, endLine}` (digit strings become integers) | `read_file {path, startLine, endLine}` |
  | `{path, view_range: "[a, b]"}` (a string or an array, two integers ≥ 1) | `read_file {path, startLine: a, endLine: b}` |
  | `{command: "list", path}` | `list_dir {path}` |
  | `{command: "edit_file", path, oldText, newText}` | `edit_file {path, oldText, newText}` |

  It is never in the tool schemas sent to the model. An aliased call goes down the real tool's path
  from the argument check on: the same step, the same repeat guard (a `read_file` and an aliased
  read of the same arguments are the same call), the same result text. The record keeps the name
  the model used and adds `ranAs`; `guards.aliasCalls` counts them. Any other shape (including
  `{}`, which names no file, and the editor's own `create` / `str_replace` commands) and any other
  unknown tool get the existing one-line `error: unknown tool "<name>". Available: <names>`.
- **Edit matching order** (`applyEdit`, the sandbox helper's JS in `src/harness/tools.ts`): exact,
  once → applied (unchanged). Exact more than once → the unchanged error. Otherwise **new: retry with
  trailing whitespace and line endings ignored on both sides** (CRLF → LF, spaces and tabs before a
  line end dropped; `oldText` may start or end mid-line, as an exact match may) → applied only at
  exactly one location, `newText` given CRLF line ends if the file uses them;
  `guards.editLineEndRetries` counts them. More than one location → an error listing them. No
  location → the agent-v2 fallback (indentation and trailing spaces ignored, decision 030),
  unchanged. Every error after the exact step ends with **the closest region of the file's current
  text, with line numbers, at most 40 lines**; it was already shown when nothing matched and is now
  also shown when the match is ambiguous, is no longer dropped when the similarity is 0, and its
  stated line range is the lines shown.
- **The agent-v2 fallback stays.** The prompt asked for the narrower retry; the broader one already
  existed and applied 12 edits in 12 of the 32 runs, none of which the narrower retry matches. Removing it would change the agent beyond edit mechanics.
**Expected effect, measured before running anything:** replaying every `edit_file` call of the 32
runs against a scratch clone of Recall with the seeds applied (each run's successful edits applied
in order) reproduces every recorded outcome with the agent-v5 logic, and gives the same outcomes with
agent-v6's: **the new retry turns none of the 12 "not found" failures into an edit.** Their causes
are characters the model dropped (6), a whitespace-only line left out or added (3), lines the run
had already changed (2), and a partial first line without its leading `.` (1). The alias, by
contrast, would have run 50 of the 53 wasted calls as real tools (47 reads, 2 listings, 1 edit).
**Rejected:** (a) Adding `str_replace_editor` to the schemas: a second edit tool both arms would
have to be told about, i.e. a prompt change. (b) Mapping the editor's full command set (`create`,
`str_replace`, `insert`, `undo_edit`): shapes never seen in the runs; a guess at what Nano means.
(c) Ignoring whitespace-only lines, or fuzzy matching, to catch the 12 failures: not what was asked,
and a fuzzy edit can land in the wrong place. (d) Removing the agent-v2 fallback to follow step 3
literally: see above.
