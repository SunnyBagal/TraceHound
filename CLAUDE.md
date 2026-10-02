# TraceHound

Analyzes a TypeScript repo and renders it as an interactive, evidence-backed component graph
on a canvas. Later: a graph-guided repair agent.

## Current state (2026-10-02)
- **Live:** https://tracehound-tau.vercel.app (Vercel, Root Directory `viewer`, auto-deploys
  from `main`; leave Output Directory unset). CI (`.github/workflows/ci.yml`) runs the snapshot
  version guard, tests, typecheck, and the viewer build, and checks that `out/snapshots/index.json`
  exists.
- **Built:** analyzer 0.9.0 (imports, routes, Redis, Prisma, env, startup-call extractors;
  BullMQ queues; anchor-reach grouping; `tracehound.json` overrides, `ignore` and `entryPoints`;
  orphan and queue warnings; `proven` / `resolved-default` / `dynamic` labels; TESTS links from
  test files; per-file `chars`; error-message literals) → static snapshots + manifest → viewer
  (React Flow + ELK, node/edge inspectors, GitHub permalinks, warnings panel, phone bottom sheet).
  The viewer serves CEX @ `da0e3d6`, analyzer 0.9.0 (`snapshots/`; older files are kept).
- **Snapshot index (decision 039):** `snapshots/index.json` has `repos[]` ({id, name, repoUrl,
  defaultRef, latest, versions}) and `defaultRepo` (`cex-v2-boilercode`) next to the original
  `latest` / `snapshots`, which the deployed viewer reads and which stay on the default repo.
  `context` / `query` take `--repo-id`; every MCP tool takes an optional `repo`. Version guard:
  `node packages/analyzer/src/version-guard.ts snapshots` fails if any repo's latest snapshot isn't
  the current `ANALYZER_VERSION` and prints the cache-only regenerate command (temp clone).
- **Change sets (decisions 038, 039; schemaVersion 2; CLI only):** `pnpm tracehound changes --repo <path>
  --diff <base>..<head> [--config f] [--out f] [--json]` or `--run <run record>` → a
  declaration-level diff (functions, classes, methods, properties, React components, exported
  variables, types/interfaces/enums, inline route handlers, module code), modification kinds
  (`formatting` = whitespace/comments only, not counted as modified), +/- lines, added/removed
  `calls` / `route` / `produces` / `consumes` edges with evidence, a component rollup (files keep
  their base component at head; edges that only moved by regrouping are `regrouped`), and four
  warnings (queue orphaned by the diff, queue payload type changed, cross-component signature
  change, removed declaration still referenced). Worktrees get read-only symlinks to the source
  checkout's node_modules. Every call is resolved, external or dynamic (counted, never dropped).
  No model.
- **BullMQ (decision 035, detector `bullmq-queues@0.1`):** `new Queue` / `<queue>.add` (queue
  resolved through symbols) / `new Worker` → producer `-produces->` one broker node per queue
  name `-consumes->` worker; a file that constructs a Worker is a process entry point. Unpaired,
  unresolved and unsupported constructs are warnings. Not frozen yet; an unseen third repo checks
  it after it freezes (backlog).
- **Second repo, Recall** (`SunnyBagal/Recall` @ `5d2165a`, public, MIT since `9113ced`, which
  only adds LICENSE): config `configs/recall.tracehound.json`; snapshot in `snapshots/` as repo
  `recall` of the multi-repo index (decision 039; `defaultRepo` and top-level `latest` stay on
  CEX, so the viewer still shows CEX) → 7 components, 6 edges (API -produces->
  `content-processing` queue -consumes-> worker, both proven), 2 orphan warnings.
- **Impact (feature 4, CLI only):** `pnpm tracehound impact --repo <path> --diff <base>..<head>
  [--depth 2] [--json]` → changed/affected components with evidence chains (decision 023).
  Needs a current-version snapshot of `<base>` in `snapshots/` (the error prints the regenerate
  command, `--cache-only` when the older snapshot had model names). `--out impacts/<name>.json`
  writes a report the viewer serves at `?impact=<name>` (changed/affected styling, dynamic
  edges flagged, chain panel). The viewer build fails if an impact cites an id missing from its
  base snapshot. Precomputed: `seed-queue-consumer`, `seed-rpc-bridge`, `seed-pending-registry`.
- **Repair harness (feature 6, decisions 026, 036):** `pnpm tracehound repair --task
  eval/tasks/<id>/task.json --agent oracle|noop|nemotron [--patch f] [--graph on|off]
  [--reasoning on|off] --provider docker` → `runs/<id>.json`. **Local Docker is the sandbox of
  record** (decision 036; Token Factory Sandboxes are not available on this account, Nebius case
  AISTUDIOSUP-1966; the spike is parked in `scripts/parked/`). Image
  `tracehound-sandbox:bun1.4.2-ts5.9.3-2` (`harness/sandbox.Dockerfile`, digest-pinned bases),
  `docker-provider@2`: uid 1000 (not root), caps dropped, 2 GB / 2 CPUs / 512 pids, no mounts or
  socket, network disconnected after setup and proven off, `--rm` plus a bounded lifetime so a
  crashed harness can't leak a container. A container that expires or disappears ends the run
  FAILED "sandbox lifetime expired (N s)" / "sandbox container disappeared", never UNRESOLVED and
  never a tool error the agent sees (decision 037); docker create/start/cp time out at
  60/60/120 s. Each test-backed property and the gaps are listed in
  decision 036 and the README's Sandbox section. Run records carry `sandboxEnv` (image id, Docker
  and provider versions) and `snapshot` (path, analyzerVersion, commit, sha256, or `"none"`).
  The sandbox's history is squashed to one fixed `base` commit after setup (no `git log -p`
  leak). Toy fixture: `node eval/fixtures/build-toy-repo.ts`, tasks
  `eval/tasks/toy-*`. **Dev tasks pending:** the user writes the CEX tasks (`eval/tasks/dev-01`,
  `dev-02`), not on main yet; validation and the 12 dev runs (Prompt I steps 4–5) wait for them.
  `--graph on` reads the snapshot named in task.json, on the host (toy-discount:
  `eval/snapshots/3582f35…/0.6.0.json`).
- **Repair agent (decisions 029, 030):** host-side loop with native tool calls, Nano by default.
  agent-v2 (environment facts, repeat guard, whitespace-tolerant edit_file, confirm-on-empty
  finish) **failed the toy gate: graph off resolved 2/5, needed 4/5**
  (`eval/dev-log/2026-09-30-toy-gate.md`). The toy is a single-file bug, so on/off there says
  nothing about the graph.
  agent-v3 (decision 033) added a 4,000-char output cap, a "stuck" stop and one no-edit nudge.
  **agent-v4 is the default (decision 034):** reasoning on (`--reasoning off` to disable),
  scratch code in `/scratch` outside the repo, edits counted only on base files, agent-added
  test files removed before verification. v1–v3 prompts are kept.
- **Localizer (decision 027):** `tracehound context --decider lexical|nemotron` (default lexical).
  The nemotron decider is Nano, reasoning off, temperature 0, over deterministic facts only; it
  validates ids, retries once, then falls back to lexical visibly. **Frozen as `decider-v1`**
  (issuePhrase ≤ 6 words) until the evaluation is over; dev results in the dev log above.
- **Agent tools (feature 5):** `context` / `query` / `mcp` over a snapshot. Ranking v1 is lexical
  and deterministic, confidence is a labelled heuristic, and token counts are estimates (chars/4).
  See decision 025.
  Compared with dependency-cruiser `--reaches` on 3 seeded fork branches in
  `docs/impact-comparison.md` (it found nothing TraceHound missed; TraceHound over-reports at
  component granularity). A queue crossing costs one hop of depth (decision 024).
- **Demo:** `SunnyBagal/cex-v2-boilercode` (fork of `rahul-MyGit/cex-v2-boilercode`, used with
  the original author's agreement) @ `da0e3d6` → 9 components, 17 edges, 1 orphan warning
  (`engine/src/store/exchange-store.ts`). The fork's `main` must stay at `da0e3d6`; seeded
  changes live on `seed/<name>` branches based on `da0e3d6` and are never merged. Don't add a
  LICENSE file to the fork. Regenerate names without spending:
  `node src/cli.ts … --cache-only` (any cache miss aborts, no network).
- **Naming:** Nano with reasoning off (`chat_template_kwargs.enable_thinking=false`, decision
  020) plus deterministic checks (021). Nano beat Super on cost and tied on checks, so Nano
  stays the default. Naming spend was about $0.043; all-time spend is in `pnpm spend`
  ($0.321 on 2026-10-01, mostly repair-agent runs). A wrong name is fixed with a
  `tracehound.json` name override (never labelled model-written); a wrong summary is dropped with
  `summary: false`, never replaced by hand. Audited by hand on 2026-10-01: Recall 5 of 7
  summaries wrong (3 names), CEX 2 of 7 summaries wrong (0 names); fixes are in
  `configs/*.tracehound.json` (FEEDBACK.md). decider-v1 reads no names or summaries; the lexical
  ranking reads heuristic names and override names, never model names or summaries
  (`src/agent/rank.ts:54-55`).
- **Prices:** `config/prices.json` has Nano/Super rates from third-party trackers, not yet
  verified in the Nebius console.

### Open blockers
1. ~~**CEX has no license.**~~ Closed 2026-09-30: the demo repo is the fork
   `SunnyBagal/cex-v2-boilercode`, with the original author's agreement.
2. ~~**Sandbox: waiting on Sandboxes beta access.**~~ Closed 2026-10-01: Nebius support (case
   AISTUDIOSUP-1966) said Sandboxes are not yet ready to be used on this account. Docker is the
   sandbox of record (decision 036); the spike is parked in `scripts/parked/`.
3. ~~**Naming check bug (slash identifiers).**~~ Closed 2026-09-30: joined tokens are split
   and checked case-sensitively (decision 021 update). Prose is still unchecked, so the viewer
   labels model-written names/summaries "prose not verified". Naming work is closed.

## Product rule (non-negotiable)
Every edge in the graph must be backed by evidence: file, symbol, line range, extractor name,
confidence. Extraction, grouping and edges are deterministic — no model is involved. Never draw
an edge you can't point to in code. The one model call allowed is the optional naming pass
(`src/naming/llm.ts`, Nemotron Nano via Nebius Token Factory): it sees extracted facts only (no
source), may change only component `name`/`summary`, falls back to the heuristic name on any
failure, and every call is logged in `snapshot.llmCalls` (model, latency, tokens).

## Spending (hackathon credits, not ours)
All model calls go through `src/llm/client.ts`: response cache → budget reservation (run cap
`TRACEHOUND_BUDGET_RUN_USD`=1, total cap `TRACEHOUND_BUDGET_TOTAL_USD`=45) → request → ledger
(`.tracehound/spend.jsonl`, `pnpm spend`). Nano is the default; Super/Ultra only via explicit
`--model`, reserved for the final evaluation. Tests must never hit the network or need
`NEBIUS_API_KEY` (`test/setup.ts` enforces this). Keep `config/prices.json` placeholders until
real catalog prices are filled in. Unresolved facts (e.g. an import of a generated file that isn't in the
repo) are recorded as facts but never produce edges.

## Stack (fixed — ask before adding dependencies)
- pnpm workspaces, Node >= 24. TS runs via Node's native type stripping: use `.ts` import
  extensions and erasable-only syntax (no enums, no parameter properties, no namespaces).
- `packages/analyzer` — ts-morph + Zod. `@tracehound/analyzer/schema` is the zod-only subpath
  the web imports; keep `src/schema.ts` free of relative imports.
- No API server for now (hackathon): snapshots are static files. The analyzer writes
  `snapshots/<sha>/<analyzerVersion>.json` plus `snapshots/index.json` (manifest with a
  `latest` pointer); the viewer loads the manifest, then the snapshot file directly.
- `viewer/` — static Next.js export (App Router, React Flow `@xyflow/react`, elkjs, Tailwind).
  Loads `snapshots/index.json` then the latest snapshot; no server, API, auth or DB.
- Vitest for extractors and grouping; one viewer component test (jsdom) on the demo snapshot.
- Later: Postgres/Drizzle/BullMQ. For now the JSON snapshot file is the store.

## Commands
- `pnpm demo` — clone the pinned demo repo into `fixtures/demo-repo` and analyze it (uses
  `configs/cex-v2-boilercode.tracehound.json`; set `NEBIUS_API_KEY` in `.env` for LLM names).
- `pnpm tracehound impact --repo fixtures/demo-repo --diff da0e3d6..<ref>` — impact of a diff.
- `pnpm tracehound context --issue "<text>" [--budget 2000] [--json]` — context packet for an agent.
- `pnpm tracehound query <search_components|get_neighbors|get_edge_evidence|get_related_tests> ...`
  and `pnpm tracehound mcp` (stdio MCP server, same tools). All read one snapshot; no network.
- `pnpm test` / `pnpm typecheck` — all packages.
- `pnpm --filter @tracehound/viewer dev` — viewer on :3000 (copies ../snapshots first).
- `pnpm --filter @tracehound/viewer build` — static export in `viewer/out/`.

## Conventions
- Snapshots are keyed by commit SHA + `ANALYZER_VERSION` (`packages/analyzer/src/version.ts`).
  Bump the version when extractor or grouping output changes.
- Extractors return facts + `Evidence`; they never create component edges. Grouping is a pure
  function over `FileFacts`; edges are aggregated from facts afterwards.
- Confidence: 1.0 compiler-resolved · 0.9 pattern with import provenance · 0.7 value resolved
  via fallback/const indirection · 0.5 real op, dynamic/unresolved operand. Numbers are
  internal; every edge also carries `confidenceLabel` (`proven` · `resolved-default` ·
  `dynamic`), which is what the UI shows.
- Record non-obvious choices in `docs/decisions.md` (choice + rejected alternative).
- Small, meaningful commits pushed to `main`.
- **Gates (tests, typecheck, build) run in a plain shell, never via `git rebase --exec` or a git
  hook.** Those export `GIT_DIR` & co., which override `git -C` in child processes (this once put
  fixture commits into a real worktree; decision 032). Before a gate, this must print nothing:
  `env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'`.
  Every git spawn in code passes `env: cleanGitEnv()` (`packages/analyzer/src/git-env.ts`).

## Roadmap
1. Slice: analyzer → static snapshot JSON + manifest → Railway-style canvas.
2. API (Fastify) + Postgres (Drizzle) persistence; analysis jobs on BullMQ; arbitrary repos.
3. More extractors (BullMQ, Kafka, fetch/axios calls between services, tRPC, Next routes).
4. Snapshot diffing across commits.
5. Graph-guided repair agent: trace an issue to affected components, propose tested fixes in a
   sandbox.
