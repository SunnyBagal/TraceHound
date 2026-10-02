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
