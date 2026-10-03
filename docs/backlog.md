# Backlog

Ideas noticed but not built yet. Move an item into a decision (docs/decisions.md) when it gets
built.

## UI
- The panel slides out empty on close instead of keeping its content.
- The root breadcrumb repeats the header title.
- Tabs have no arrow-key navigation.
- Phones have no way to see the canvas while the panel is open.
- Warnings in the panel don't link to the file's permalink.
- The Express logo reads as "ex" at 18px.
- The impact panel still uses the old compact type sizes.

## Analyzer / graph
- An edge from a BullMQ broker node to its Redis connection node. Recall's
  `bullmq:content-processing` and `redis:redis-url` sit unconnected; the Queue's `connection`
  option resolves to the client (`queue.ts:11`), but that's configuration, not an op that moves
  data, so it needs its own edge kind or label and a decision.
- The frontend → API HTTP edge (axios `baseURL` from `VITE_BACKEND_URL` + `/api/v1/...` calls
  matched to Express routes). Recall's web app and API are unconnected today.
- An unseen-repo check for the BullMQ detector: a third public Express + BullMQ repo, analyzed
  only after `bullmq-queues` freezes (Recall shaped the detector, so it doesn't count).

- BullMQ through dependency injection, beyond decision 042: more than one parameter hop, methods
  and callbacks (no call sites are followed for them), an argument that isn't an object literal at
  the call site, and a non-Queue call site outside test files (today named in the evidence, no
  warning).
- An unseen-repo check for the parameter-hop resolution (decision 042): Recall's seams prompted
  it, so Recall doesn't count; same held-out repo as the detector's check above.
- TESTS links through test helpers: a test that reaches a component only through a helper under
  `test/` (Recall's API tests via `test/helpers/app.ts`) has no link to it (decision 042).
- A package whose own source lives under a directory named `test`/`tests` would be treated as
  test support (decision 042); no such repo has been seen.

## Repair harness
- The Recall `57d920e` snapshot in `eval/snapshots/` has heuristic names (the naming cache has no
  entry for that commit's facts); model names would need a naming run.
- In the one graph-on smoke run (decision 042) the agent made no graph tool calls; whether the
  graph helps on Recall is untested.
- Per-test regression comparison: the gate compares one exit code per command, so with a single
  `bun test` a baseline that already has a failing test hides any newly broken one (decision 041).
- After a sandbox is killed, the run record can say `destroyed: false` while Docker is still
  removing the `--rm` container (`Dead`); recheck for a few seconds before recording.
- The README's Repair harness section doesn't mention repo profiles, seed patches or the Recall
  smoke task (README was out of scope for decision 041).
- Recall evaluation tasks: none exist yet; `recall-smoke-trending` is a smoke task only.

## Viewer
- Change view: the canvas fit view on a 1440px screen with the warnings panel open lands near the
  minimum zoom, so node chips are small; a "fit changed components" button would help.
- Change view: edge labels can sit on top of adjacent nodes (pre-existing; more visible when the
  queue and worker nodes are close).
- Change view, CLI side (decision 040, "CLI gaps"): portable `repo.path`, a stable repo name for
  `--run`, evidence or declaration edges behind `componentEdges`, per-file unchanged counts,
  component ids on warnings and edge endpoints, a reason on unmapped files, `--patch` on a base ref.
- Change view: the top-level `latest` in `snapshots/index.json` still points at CEX while
  `defaultRepo` is Recall; decide whether the next manifest write moves it.
