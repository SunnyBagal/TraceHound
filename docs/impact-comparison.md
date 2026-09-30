# Impact analysis: TraceHound vs dependency-cruiser on seeded changes

> This is 3 hand-picked changes in one small repo. It shows direction only, not a general claim
> about either tool's precision or recall.

Demo repo: [`SunnyBagal/cex-v2-boilercode`](https://github.com/SunnyBagal/cex-v2-boilercode)
(fork of `rahul-MyGit/cex-v2-boilercode`). `main` stays at `da0e3d6`. Each seed branch is one
behavior-changing commit on top of `da0e3d6` that touches one file. The branches are never
merged.

- **TraceHound** — `tracehound impact`, analyzer 0.4.0, default `--depth 2`, base snapshot
  `snapshots/da0e3d640a9c02f815fcca48f8328c94558cc058/0.4.0.json`. Reports **components**.
  Depth rules: decision 023, plus decision 024 (crossing a queue costs one hop).
- **dependency-cruiser** — 18.4.0 with `typescript@5.9.3`, run through `npx`; it isn't a
  dependency of anything. The docs' option for "what reaches this file" is `--reaches <regex>`:
  "show modules and their transitive dependents"; `--affected <rev>` is documented as sugar for
  it. It's unlimited depth and reports **files**, following the module (import) graph only. Each
  seed ran twice: with the default (type-only imports ignored) and with
  `--ts-pre-compilation-deps` (type-only imports included). Both variants gave identical results
  for all three seeds.
- To compare, dependency-cruiser's files are mapped to TraceHound components through the
  same base snapshot.

## Summary

| Seed (changed file) | TraceHound affected (depth used) | dependency-cruiser reaches (files → components) | Only TraceHound | Only dependency-cruiser |
|---|---|---|---|---|
| `seed/impact-queue-consumer` (`engine/src/index.ts`) | `redis-rpc-bridge`@1, `redis:redis-url`@1, `backend:backend-server`@2, `backend:exchange-api`@2, `pending-response-registry`@2 | none | all five | none |
| `seed/impact-rpc-bridge` (`backend/src/utils/engine-client.ts`) | `backend:backend-server`@1, `backend:exchange-api`@1, `engine:engine-worker`@1, `pending-response-registry`@1, `redis:redis-url`@1 | 4 files → `backend:exchange-api`, `backend:backend-server` | `engine:engine-worker`, `redis:redis-url`, `pending-response-registry` (false positive) | none |
| `seed/impact-pending-registry` (`backend/src/store/pending-responses.ts`) | `redis-rpc-bridge`@1, `backend:backend-server`@2, `backend:exchange-api`@2, `engine:engine-worker`@2, `redis:redis-url`@2 | 5 files → `redis-rpc-bridge`, `backend:exchange-api`, `backend:backend-server` | `redis:redis-url`, `engine:engine-worker` (both over-reported) | none |

**dependency-cruiser found nothing that TraceHound missed**, at file or component level, in
any of the three seeds. Every file it reported belongs to a component TraceHound listed as
changed or affected. There is no bug to report from this comparison. TraceHound's precision
problems are listed per seed below.

**Before decision 024** (a queue crossing cost two hops): seed 1 reached only `redis:redis-url`
and `redis-rpc-bridge`, and stopped before `backend:exchange-api`, where the timeout is
user-visible. Seed 2 had the same set, with `engine:engine-worker` at depth 2. Seed 3 had no
`engine:engine-worker`. dependency-cruiser's results are unchanged, since they don't depend on
TraceHound's depth rule.

---

## 1 · `seed/impact-queue-consumer`: the engine's consumer of `backend-to-engine-broker`

- **Change:** the engine now reads the reply queue from `message.replyQueue` instead of
  `message.responseQueue` (engine's local `EngineRequest` type and both `sendResponse` calls).
  The backend still sends `responseQueue`, so replies go to an undefined queue and every
  `sendToEngine` call times out.
- **Commit:** [`c389d3d`](https://github.com/SunnyBagal/cex-v2-boilercode/commit/c389d3df0cfa45579061ad5c79bd0d852901d664)
- **TraceHound:** changed `engine:engine-worker`; affected:
  - Depth 1, crossing the queue once:
    - `redis:redis-url`, via `redis:redis-url -consumes-> engine:engine-worker`
      `[resolved-default]` "brPop backend-to-engine-broker", `engine/src/index.ts:96`
    - `redis-rpc-bridge`, via `redis-rpc-bridge -produces-> redis:redis-url`
      `[resolved-default]` "lPush backend-to-engine-broker",
      `backend/src/utils/engine-client.ts:43`
  - Depth 2, all `imports` walked in reverse, `[proven]`:
    - `backend:exchange-api` (`backend/src/controllers/exchange-controller.ts:7`, `sendToEngine`)
      is where the timeout is user-visible
    - `backend:backend-server` (`backend/src/index.ts:5`)
    - `pending-response-registry` (`backend/src/store/pending-responses.ts:1`)
  - 0 linked tests.
- **dependency-cruiser:** nothing reaches `engine/src/index.ts`. The engine is an entry point
  that no module imports, and the backend never imports engine code (the engine keeps its own
  copy of the message types).
- **Only TraceHound:** everything. The link exists only through the Redis queue, which a module
  graph can't see.
- **Only dependency-cruiser:** none.
- **Precision:** `pending-response-registry` is a false positive. It imports only the
  `EngineResponse` type from the bridge component's `types/engine.ts`, and the seed doesn't
  change the response shape.

## 2 · `seed/impact-rpc-bridge`: backend `engine-client.ts` (Redis RPC Bridge)

- **Change:** `sendToEngine` renames a field in the `backend-to-engine-broker` message, sending
  the command as `command` instead of `type`. The engine still switches on `message.type`, so
  `create_order` stops matching.
- **Commit:** [`a21a534`](https://github.com/SunnyBagal/cex-v2-boilercode/commit/a21a534dffeaff66a760a7e556ee58c163a26655)
- **TraceHound:** changed `redis-rpc-bridge`; affected, all at depth 1:
  - via `imports` walked in reverse, `[proven]`:
    - `backend:backend-server` (`backend/src/index.ts:5`)
    - `backend:exchange-api` (`backend/src/controllers/exchange-controller.ts:7`)
    - `pending-response-registry` (`backend/src/store/pending-responses.ts:1`)
  - `redis:redis-url`, via `produces` "lPush backend-to-engine-broker" `[resolved-default]`,
    `backend/src/utils/engine-client.ts:43`
  - `engine:engine-worker` (queue crossed once), via `consumes` "brPop backend-to-engine-broker"
    `[resolved-default]`, `engine/src/index.ts:96`
  - 0 linked tests.
- **dependency-cruiser:** `backend/src/controllers/exchange-controller.ts`,
  `backend/src/routes/exchange-routes.ts` (→ `backend:exchange-api`), `backend/src/index.ts`,
  `backend/src/routes/index.ts` (→ `backend:backend-server`).
- **Only TraceHound:**
  - `engine:engine-worker`, the consumer that actually breaks, and `redis:redis-url`.
  - `pending-response-registry`: a **false positive**. `pending-responses.ts` imports only the
    `EngineResponse` type from `backend/src/types/engine.ts`, not the changed file. It's reported
    because `types/engine.ts` and `engine-client.ts` form one component (the `redis-rpc-bridge`
    override), and impact works per component.
- **Only dependency-cruiser:** none. It lists files, so it's more precise inside the backend.
  For example, `backend/src/types/exchange-schema.ts` belongs to `backend:exchange-api`, which
  TraceHound reports, but nothing in it depends on the change.

## 3 · `seed/impact-pending-registry`: backend `pending-responses.ts` (Pending-Response Registry)

- **Change:** an engine timeout now resolves with `{ ok: false, error: "engine_timeout" }`
  instead of rejecting with an `Error`. Callers of `sendToEngine` that relied on the throw now get
  a value.
- **Commit:** [`1d877af`](https://github.com/SunnyBagal/cex-v2-boilercode/commit/1d877af9789e7c0cc4eeb4a329cb121462c3dd30)
- **TraceHound:** changed `pending-response-registry`; affected:
  - `redis-rpc-bridge`, depth 1, `imports` reverse `[proven]`,
    `backend/src/utils/engine-client.ts:3`.
  - Depth 2:
    - `backend:backend-server` (`backend/src/index.ts:5`)
    - `backend:exchange-api` (`backend/src/controllers/exchange-controller.ts:7`)
    - `redis:redis-url` and `engine:engine-worker`, via the bridge's queue edges (queue crossed
      once)
  - 0 linked tests.
- **dependency-cruiser:** `backend/src/utils/engine-client.ts` (→ `redis-rpc-bridge`),
  `backend/src/controllers/exchange-controller.ts`, `backend/src/routes/exchange-routes.ts`
  (→ `backend:exchange-api`), `backend/src/index.ts`, `backend/src/routes/index.ts`
  (→ `backend:backend-server`).
- **Only TraceHound:** `redis:redis-url` and `engine:engine-worker`. Both are over-reported: the
  timeout change stays inside the backend and doesn't touch the queue message contract. The
  bridge is affected through an import, and the walk then follows the bridge's queue edges,
  because decision 023 couples queue edges regardless of what changed. Decision 024 made this
  worse: the engine is now within the default depth.
- **Only dependency-cruiser:** none.

---

## What this shows

- **Queues are where TraceHound adds information.** In seeds 1 and 2 the component that
  actually breaks is connected only through Redis, and dependency-cruiser can't see it. In seed
  1 dependency-cruiser reports no impact at all.
- **Inside one process, dependency-cruiser is more precise.** It works per file, and TraceHound
  works per component. `pending-response-registry` is a false positive in seeds 1 and 2, and in
  seed 3 the queue coupling adds two components the change can't reach.
- **Decision 024 is a trade-off.** Seed 1 now reaches the user-visible failure at the default
  depth, and seed 3 now over-reports the engine. The walk has no notion of *what* changed
  (message shape vs internal behavior), so it can't tell these two cases apart.
- **Tests:** CEX has no test files, so every report says "0 linked tests". Neither tool had
  tests to point to.

## Exact commands

Setup (once): fetch the seed branches into the fixture without moving its HEAD, and add one
worktree per seed for dependency-cruiser:

```sh
bash scripts/fetch-demo-repo.sh
git -C fixtures/demo-repo fetch origin 'refs/heads/seed/*:refs/remotes/origin/seed/*'
for s in queue-consumer rpc-bridge pending-registry; do
  git -C fixtures/demo-repo worktree add --detach "$SCRATCH/wt-$s" "origin/seed/impact-$s"
done
```

TraceHound (text output; add `--json` for the machine-readable report):

```sh
node packages/analyzer/src/bin.ts impact --repo fixtures/demo-repo --diff da0e3d6..origin/seed/impact-queue-consumer
node packages/analyzer/src/bin.ts impact --repo fixtures/demo-repo --diff da0e3d6..origin/seed/impact-rpc-bridge
node packages/analyzer/src/bin.ts impact --repo fixtures/demo-repo --diff da0e3d6..origin/seed/impact-pending-registry
```

dependency-cruiser. Run each seed from its worktree at the seed commit, once as written and once
with `--ts-pre-compilation-deps` added before `--reaches`:

```sh
cd "$SCRATCH/wt-queue-consumer"
npx -y -p dependency-cruiser@18.4.0 -p typescript@5.9.3 depcruise backend engine --no-config --reaches '^engine/src/index\.ts$' -T json

cd "$SCRATCH/wt-rpc-bridge"
npx -y -p dependency-cruiser@18.4.0 -p typescript@5.9.3 depcruise backend engine --no-config --reaches '^backend/src/utils/engine-client\.ts$' -T json

cd "$SCRATCH/wt-pending-registry"
npx -y -p dependency-cruiser@18.4.0 -p typescript@5.9.3 depcruise backend engine --no-config --reaches '^backend/src/store/pending-responses\.ts$' -T json
```

`typescript@5.9.3` is pinned because dependency-cruiser 18.4.0 supports TypeScript
`>=2.0.0 <7.0.0` (`depcruise --info`). With the current `typescript@7.0.2` it parses no `.ts`
files and prints an empty result. The reported set is `modules[].source`, excluding
`node_modules`, core modules, unresolvable modules and the changed file itself.
