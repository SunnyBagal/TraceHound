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
- A repo switcher so the viewer can show Recall next to CEX: both are in `snapshots/index.json`
  `repos` since decision 039; the viewer still reads only the top-level `latest` (CEX).
