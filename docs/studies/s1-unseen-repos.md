> Copied from `tracehound-study` @ `75913ef` (`REPORT.md`). Quoted code expressions from the target repos (original lines 72, 84–86 and 90–92) were replaced by file:line references at the same pinned commits; nothing else was changed.

# Study S1 — report

Question: does TraceHound's BullMQ queue pairing work on repos it has never seen, and do queue
contract bugs show up in real git history? Definitions and kill criteria: `PREREGISTRATION.md`
(commit `a972bb5`, written before any target was cloned). Site conventions: `ground-truth/README.md`.

## Analyzer

- `SunnyBagal/TraceHound` at `origin/main` = `dd1d5acff3c91181cbba29eefacb66089c471fef`
- `ANALYZER_VERSION` 0.9.0 (detector `bullmq-queues@0.1`). `packages/analyzer/package.json` says 0.6.0;
  snapshots are keyed by 0.9.0.
- Run unmodified on all ten targets: `--naming heuristic`, no `--config`, no `tracehound.json` in any
  target, `NEBIUS_API_KEY` unset. `./tracehound` is clean (`git status` empty) after all runs.
- All ten runs exited 0. No crash, no timeout. Longest run 33.0 s (langfuse).

## Verdict

**Kill criterion 1 — macro-average pairing rate (any label) below 70%: MET. It is 2.1%.**
Nine of ten repos pair 0% of their producers; plunk pairs 4 of 19.

**Kill criterion 2 — fewer than 5 contract bugs in step D: MET. Found 4** in 348 candidates read,
and only 2 of the 4 are a BullMQ-era disagreement between TypeScript producer and worker code.

Both pre-registered criteria say the same thing: on this evidence, a queue contract checker is
not worth building as a product. The analyzer's queue pairing does not transfer to unseen repos,
and contract bugs were rare in the history that was read.

What the numbers do and do not show is in "Limits" below; two of those limits (the 40-candidate
cap on large repos, and how candidates were read) bear on criterion 2 and are stated there.

## Per-repo results

| repo | sites (Q / W / P) | scored | name expressed as (scored sites) | pairing any | pairing proven+resolved-default | worker any / static | queue any / static | false edges | runtime | exit |
|---|---|---|---|---|---|---|---|---|---|---|
| funmusicplace/mirlo @ 2675709 | 49 (13 / 9 / 27) | 49 | literal 40, wrapper-function 9 | 0/26 = 0.0% | 0/26 = 0.0% | 0/9 = 0.0% / 0.0% | 13/13 = 100.0% / 100.0% | 0 of 9 queue edges | 7.7 s | 0 |
| useplunk/plunk @ f3cd82c | 53 (17 / 17 / 19) | 53 | literal 40, constant 13 | 4/19 = 21.1% | 4/19 = 21.1% | 4/17 = 23.5% / 23.5% | 17/17 = 100.0% / 100.0% | 0 of 21 queue edges | 5.4 s | 0 |
| firecrawl/firecrawl @ 4561e79 | 14 (4 / 4 / 6) | 14 | wrapper-function 10, constant 4 | 0/6 = 0.0% | 0/6 = 0.0% | 0/4 = 0.0% / 0.0% | 4/4 = 100.0% / 100.0% | 0 of 0 queue edges | 8.7 s | 0 |
| Chocobozzz/PeerTube @ faa76ba | 124 (30 / 30 / 64) | 60 (sample), 4 name unknown | wrapper-function 31, runtime-value 28, class-field 1 | 0/32 = 0.0% | 0/32 = 0.0% | 0/10 = 0.0% / 0.0% | 0/14 = 0.0% / 0.0% | 0 of 0 queue edges | 12.4 s | 0 |
| FlowiseAI/Flowise @ 9291856 | 16 (3 / 3 / 10) | 16 | wrapper-function 13, runtime-value 3 | 0/10 = 0.0% | 0/10 = 0.0% | 0/3 = 0.0% / 0.0% | 0/3 = 0.0% / 0.0% | 0 of 0 queue edges | 7.9 s | 0 |
| logchimp/logchimp @ 7fef2aa | 10 (4 / 2 / 4) | 10 | wrapper-function 6, class-field 4 | 0/4 = 0.0% | 0/4 = 0.0% | 0/2 = 0.0% / 0.0% | 0/4 = 0.0% / 0.0% | 0 of 0 queue edges | 2.1 s | 0 |
| usesend/usesend @ bcf7e07 | 34 (11 / 11 / 12) | 34, 6 name unknown | constant 22, runtime-value 6, class-field 6 | 0/10 = 0.0% | 0/10 = 0.0% | 9/9 = 100.0% / 100.0% | 9/9 = 100.0% / 100.0% | 1 of 10 queue edges | 3.0 s | 0 |
| Openpanel-dev/openpanel @ 7c4d22a | 25 (7 / 7 / 11) | 25 | wrapper-function 18, constant 7 | 0/11 = 0.0% | 0/11 = 0.0% | 0/7 = 0.0% / 0.0% | 0/7 = 0.0% / 0.0% | 0 of 0 queue edges | 10.4 s | 0 |
| midday-ai/midday @ 5158731 | 106 (14 / 12 / 80) | 60 (sample), 4 name unknown | wrapper-function 38, literal 13, runtime-value 9 | 0/41 = 0.0% | 0/41 = 0.0% | 0/5 = 0.0% / 0.0% | 10/10 = 100.0% / 100.0% | 0 of 4 queue edges | 13.0 s | 0 |
| langfuse/langfuse @ 712dd47 | 144 (40 / 40 / 64) | 60 (sample), 2 name unknown | wrapper-function 33, constant 16, runtime-value 11 | 0/20 = 0.0% | 0/20 = 0.0% | 0/15 = 0.0% / 0.0% | 0/23 = 0.0% / 0.0% | 0 of 0 queue edges | 33.0 s | 0 |

| average | pairing any | pairing static | worker any | worker static | queue any | queue static | producer named (any) |
|---|---|---|---|---|---|---|---|
| macro (mean of 10 repos) | 2.1% | 2.1% | 12.4% | 12.4% | 50.0% | 50.0% | 20.4% |
| micro (pooled sites) | 4/179 = 2.2% | 2.2% | 13/81 = 16.0% | 16.0% | 53/104 = 51.0% | 51.0% | 48/180 = 26.7% |
| macro, strictly syntactic sites (sensitivity) | 2.1% | | 12.4% | | 50.0% | | |

Reading the table:

- "scored" = sites resolved and compared. Three repos have more than 60 sites, so 60 were drawn with
  seed 42 and only those are scored. "name unknown" = sites whose queue cannot be determined by
  reading (per-region or request-driven names); they are excluded from every denominator.
- "static" = label `proven` or `resolved-default`. It equals "any" everywhere: the analyzer never got
  a queue right with a `dynamic` label.
- Queue detection is all-or-nothing per repo: 100% where the name at `new Queue(...)` is a string
  literal or a plain `const`, 0% where it is an enum member, a helper call, a template or a parameter.
- The one false edge (usesend): a `consumes` edge from a queue node named `dynamic-dynamic`. The
  Worker's name is a template of two runtime values and the analyzer turned it into a literal-looking
  name. Evidence: `apps/web/src/server/service/email-queue-service.ts:34`.
- midday: 2 of its 4 queue edges are "unscored" (their evidence is on listed sites outside the sample).
- The sensitivity row recomputes the macro averages with sites that share one wrapped construction
  collapsed into a single site. It does not change any average.

## Why sites were missed

251 of the 365 scored sites with a known name were missed, left unnamed, or (0 cases) named wrong.

- 116 of 251: producer goes through a getter, singleton or forwarder function (firecrawl/firecrawl apps/api/src/services/worker/scrape-worker.ts:258, langfuse/langfuse web/src/features/prompts/server/promptChangeEventSourcing.ts:42, midday-ai/midday apps/api/src/trpc/routers/invoice.ts:484), not a variable bound to `new Queue(...)`. Example: firecrawl/firecrawl apps/api/src/controllers/v0/admin/precrawl.ts:5 (producer, queue `{precrawlQueue}`, outcome miss)
- 41 of 251: queue name is a loop variable, map key or string built at runtime (one construction serves many queues). Example: Chocobozzz/PeerTube server/core/lib/job-queue/job-queue.ts:131 (queue, queue `build-automatic-tags`, outcome unnamed)
- 35 of 251: Queue/Worker is constructed inside a wrapper function or class whose queue name is a parameter (factory, register(name, ...), wrapper class). Example: funmusicplace/mirlo src/jobs/queue-worker.ts:174 (worker, queue `optimize-image`, outcome unnamed)
- 20 of 251: Worker is named by `someQueue.name` (property of a Queue instance), which is not resolved to the queue's literal. Example: useplunk/plunk apps/api/src/jobs/bulk-contact-processor.ts:63 (worker, queue `bulk-contact-actions`, outcome unnamed)
- 16 of 251: queue name is a TypeScript enum member (`QueueName.X`), which is not resolved to its string value. Example: langfuse/langfuse packages/shared/src/server/redis/batchExport.ts:19 (queue, queue `batch-export-queue`, outcome unnamed)
- 11 of 251: producer receiver is a class field (`this.queue`, static field), not a variable bound to `new Queue(...)`. Example: Chocobozzz/PeerTube server/core/lib/job-queue/job-queue.ts:606 (producer, queue `activitypub-cleaner`, outcome miss)
- 7 of 251: queue name is the result of a helper call (`getQueueName('x')`). Example: Openpanel-dev/openpanel packages/queue/src/queues.ts:260 (queue, queue `sessions`, outcome unnamed)
- 5 of 251: producer call is upsertJobScheduler, which the detector does not treat as a producer method. Example: funmusicplace/mirlo src/jobs/scheduled-tasks.ts:45 (producer, queue `scheduled-tasks`, outcome miss)

The five most common, with what happens in the analyzer:

1. **Producer through a getter, singleton or forwarder (116).** The detector only follows a receiver
   to a variable initialised with `new Queue(...)`. The producer calls at firecrawl/firecrawl apps/api/src/services/worker/scrape-worker.ts:258,
   langfuse/langfuse web/src/features/prompts/server/promptChangeEventSourcing.ts:42, midday-ai/midday apps/api/src/trpc/routers/invoice.ts:484, Chocobozzz/PeerTube server/core/lib/video-studio.ts:89
   and FlowiseAI/Flowise packages/server/src/utils/upsertVector.ts:310 produce no fact at all.
2. **Name is a loop variable or runtime-built string (41).** PeerTube and midday build one Queue and
   one Worker per entry of a map/array; langfuse and usesend build shard/region names. The analyzer
   records the construction as `dynamic` with no name.
3. **Construction inside a wrapper whose name is a parameter (35).** mirlo's wrapper call at src/jobs/queue-worker.ts:183,
   firecrawl's at apps/api/src/services/indexing/index-worker.ts:707, langfuse's at worker/src/app.ts:155,
   logchimp's and Flowise's wrapper classes. The literal is at the call site; the `new` sees a parameter.
4. **Worker named by `someQueue.name` (20).** plunk and openpanel. The queue is found, the Worker is not
   tied to it.
5. **Queue name is an enum member (16).** langfuse's `QueueName.X`. A plain `const` string resolves
   (usesend, firecrawl); an enum member does not.

Also: 43 producers were named right (mirlo 25, plunk 15, midday 3) and still not paired, because no
Worker for that queue was named. Worker detection (macro 12.4%) is what caps pairing even where
producers resolve.

These look individually fixable (enum members, `.name`, `upsertJobScheduler`, class fields are small;
call-site propagation through wrappers and forwarders is not small and covers most of the misses).
Nothing was fixed or configured around; that was the rule.

## Step D — history

| repo | commits scanned | pool (message/contract-line arms) | candidates read | oldest candidate | contract bugs | other queue bugs | not a bug | uncertain |
|---|---|---|---|---|---|---|---|---|
| funmusicplace/mirlo | 3720 | 142 (68) | 40 | 2025-06-06 | 1 | 11 | 28 | 1 |
| useplunk/plunk | 739 | 13 (2) | 13 | 2025-12-03 | 0 | 2 | 11 | 0 |
| firecrawl/firecrawl | 5583 | 529 (402) | 40 | 2026-08-26 | 0 | 0 | 40 | 0 |
| Chocobozzz/PeerTube | 17067 | 189 (73) | 40 | 2021-11-05 | 2 | 13 | 25 | 2 |
| FlowiseAI/Flowise | 2905 | 46 (19) | 40 | 2024-04-02 | 1 | 5 | 34 | 0 |
| logchimp/logchimp | 1766 | 30 (30) | 30 | 2021-07-18 | 0 | 0 | 30 | 0 |
| usesend/usesend | 510 | 32 (10) | 32 | 2024-04-22 | 0 | 3 | 29 | 0 |
| Openpanel-dev/openpanel | 1625 | 135 (71) | 40 | 2025-04-01 | 0 | 3 | 37 | 0 |
| midday-ai/midday | 3702 | 33 (19) | 33 | 2024-08-13 | 0 | 3 | 30 | 1 |
| langfuse/langfuse | 9719 | 1096 (644) | 40 | 2026-09-16 | 0 | 3 | 37 | 0 |
| **total** | 47336 | 2245 | 348 | | 4 | 43 | 301 | 4 |

- funmusicplace/mirlo https://github.com/funmusicplace/mirlo/commit/059ef5720f299a0b0beffd9883398cdb33a8cc25 (2026-04-27): [template-mediated] send-mail job for label invites lacked locals (user, labelArtist) that the announce-label-invite template rendered by the worker dereferences; producer now sends them. Consumer side is a pug template, not TS
- Chocobozzz/PeerTube https://github.com/Chocobozzz/PeerTube/commit/379387f56f9ada4030c35be8e784ad716c6a92e4 (2025-06-27): worker failure path looked up errorHandlers[job.name], but every producer adds jobs under the name 'job' and handlers are keyed by queue name, so the error handler never ran (since 32567717, 2022-06); fixed to key by queue name
- Chocobozzz/PeerTube https://github.com/Chocobozzz/PeerTube/commit/8aad7ae413e58ae2ef847c5e12419c45f4ff55be (2021-11-05): [bull v3 era, before the bullmq migration] CLI producer put resolution into the video-transcoding payload as a string (raw CLI option) where the worker expects a number; producer now parses it
- FlowiseAI/Flowise https://github.com/FlowiseAI/Flowise/commit/4786aafddcec8cdbb7c55c7fd961881e40236bac (2025-05-16): worker passed the whole job data to executeCustomNodeFunction, but the producer added two days earlier (0a4570ec) wraps the request as { data, isExecuteCustomFunction }; worker now unwraps data.data

Counting the four:

- 2 are BullMQ-era disagreements between TypeScript producer and worker code (PeerTube `379387f`,
  Flowise `4786aaf`).
- 1 is on Bull v3, before PeerTube moved to BullMQ (`8aad7ae`, 2021).
- 1 is between a producer and an email template that the worker renders (mirlo `059ef57`); a
  TypeScript-level checker would not see the consumer side.

Any way of counting gives fewer than 5. The 43 "other queue bugs" are mostly retries/dedup job ids,
stalled-lock settings, Redis connection handling, shutdown and failure handling. Two repos fixed the
same thing independently: a custom `jobId` containing `:` (mirlo `c9419bc`, usesend `d7b95aa`).

One thing seen while building ground truth, not a history finding and not counted: at mirlo's pinned
SHA the `move-file-to-backblaze` queue has a producer (`src/queues/moving-files-to-backblaze.ts:57`)
and no Worker. The Worker was removed in `ea2f622f`. Whether that producer is still reachable is
uncertain; I did not trace its callers.

## Rerun of steps B and C with analyzer 0.10.0 (`origin/analyzer/queue-di`)

Same ten pinned repos, same committed ground truth (no file under `ground-truth/` changed), same
invocation (`--naming heuristic`, no config, no model calls), analyzer cloned into `./tracehound-0.10`
and run unmodified. `./tracehound` was not touched. Step D was not rerun. All ten runs exited 0.

A = analyzer 0.9.0 at `dd1d5acff3c91181cbba29eefacb66089c471fef`. B = analyzer 0.10.0 at `c8f1c24768541369d4ac70cd7b4431654d8258eb`. Cells are right/total = rate with any label (rate with proven + resolved-default only).

| repo | pairing A | pairing B | worker A | worker B | queue A | queue B | false edges A | false edges B | runtime A / B |
|---|---|---|---|---|---|---|---|---|---|
| funmusicplace/mirlo | 0/26 = 0.0% (0.0%) | 0/26 = 0.0% (0.0%) | 0/9 = 0.0% (0.0%) | 0/9 = 0.0% (0.0%) | 13/13 = 100.0% (100.0%) | 13/13 = 100.0% (100.0%) | 0 of 9 | 0 of 9 | 7.7 s / 7.4 s |
| useplunk/plunk | 4/19 = 21.1% (21.1%) | 4/19 = 21.1% (21.1%) | 4/17 = 23.5% (23.5%) | 4/17 = 23.5% (23.5%) | 17/17 = 100.0% (100.0%) | 17/17 = 100.0% (100.0%) | 0 of 21 | 0 of 21 | 5.4 s / 5.6 s |
| firecrawl/firecrawl | 0/6 = 0.0% (0.0%) | 0/6 = 0.0% (0.0%) | 0/4 = 0.0% (0.0%) | 0/4 = 0.0% (0.0%) | 4/4 = 100.0% (100.0%) | 4/4 = 100.0% (100.0%) | 0 of 0 | 0 of 0 | 8.7 s / 9.1 s |
| Chocobozzz/PeerTube | 0/32 = 0.0% (0.0%) | 0/32 = 0.0% (0.0%) | 0/10 = 0.0% (0.0%) | 0/10 = 0.0% (0.0%) | 0/14 = 0.0% (0.0%) | 0/14 = 0.0% (0.0%) | 0 of 0 | 0 of 0 | 12.4 s / 12.4 s |
| FlowiseAI/Flowise | 0/10 = 0.0% (0.0%) | 0/10 = 0.0% (0.0%) | 0/3 = 0.0% (0.0%) | 0/3 = 0.0% (0.0%) | 0/3 = 0.0% (0.0%) | 0/3 = 0.0% (0.0%) | 0 of 0 | 0 of 0 | 7.9 s / 7.5 s |
| logchimp/logchimp | 0/4 = 0.0% (0.0%) | 0/4 = 0.0% (0.0%) | 0/2 = 0.0% (0.0%) | 0/2 = 0.0% (0.0%) | 0/4 = 0.0% (0.0%) | 0/4 = 0.0% (0.0%) | 0 of 0 | 0 of 0 | 2.1 s / 2.0 s |
| usesend/usesend | 0/10 = 0.0% (0.0%) | 0/10 = 0.0% (0.0%) | 9/9 = 100.0% (100.0%) | 9/9 = 100.0% (100.0%) | 9/9 = 100.0% (100.0%) | 9/9 = 100.0% (100.0%) | 1 of 10 | 1 of 10 | 3.0 s / 2.8 s |
| Openpanel-dev/openpanel | 0/11 = 0.0% (0.0%) | 0/11 = 0.0% (0.0%) | 0/7 = 0.0% (0.0%) | 0/7 = 0.0% (0.0%) | 0/7 = 0.0% (0.0%) | 0/7 = 0.0% (0.0%) | 0 of 0 | 0 of 0 | 10.4 s / 10.7 s |
| midday-ai/midday | 0/41 = 0.0% (0.0%) | 0/41 = 0.0% (0.0%) | 0/5 = 0.0% (0.0%) | 0/5 = 0.0% (0.0%) | 10/10 = 100.0% (100.0%) | 10/10 = 100.0% (100.0%) | 0 of 4 | 0 of 4 | 13.0 s / 13.9 s |
| langfuse/langfuse | 0/20 = 0.0% (0.0%) | 0/20 = 0.0% (0.0%) | 0/15 = 0.0% (0.0%) | 0/15 = 0.0% (0.0%) | 0/23 = 0.0% (0.0%) | 0/23 = 0.0% (0.0%) | 0 of 0 | 0 of 0 | 33.0 s / 34.4 s |
| **macro, any label (static)** | 2.1% (2.1%) | 2.1% (2.1%) | 12.4% (12.4%) | 12.4% (12.4%) | 50.0% (50.0%) | 50.0% (50.0%) | 1 | 1 | |
| **micro, any label** | 4/179 = 2.2% | 4/179 = 2.2% | 13/81 = 16.0% | 13/81 = 16.0% | 53/104 = 51.0% | 53/104 = 51.0% | | | |
| **micro, static only** | 4/179 = 2.2% | 4/179 = 2.2% | 13/81 = 16.0% | 13/81 = 16.0% | 53/104 = 51.0% | 53/104 = 51.0% | | | |

Sites whose result changed (outcome, label, named queue or pairing): none.

What was checked beyond the rates:

- All 381 scored sites (including the 16 with an unknown name) have the same outcome, label, named
  queue and pairing result under both versions.
- The queue edges are the same set with the same verdicts. The one false edge (usesend,
  `dynamic-dynamic`) is still there.
- The raw BullMQ facts in the snapshots (file, line, role, queue value, resolution) are identical in
  all ten repos, and so are the queue warning counts. 0.10.0's new path, a producer followed through
  one function parameter to its call sites, produced a fact in none of the ten: no fact carries
  `wiredAt`.

So the branch changes nothing measurable on these repos, and neither kill criterion moves
(macro pairing stays 2.1%). I did not investigate why the new path never fires here; from the miss
reasons above, the producers in these repos mostly reach their queue through a getter or singleton
call, a class field, or a forwarder that takes the queue *name*, not through a `Queue` object passed
as a parameter. That is a reading of the ground truth, not something the rerun tested.

One change to the comparison script, made before the 0.10.0 runs: because 0.10.0 can emit several
facts at one `.add` (one per queue wired in), `scripts/compare.py` now takes the fact that names the
site's queue, and a fact listing its wiring call sites counts for a call-site site only if it lists
that site. Re-running the 0.9.0 comparison with the new script changed nothing in it except a new
`analyzerVersion` field. With zero wired facts in the data, the refinement had no effect on B either.

Files: `results/runs-0.10/`, `results/compare-0.10/`, `results/versions.md`, `scripts/versions.py`.
Snapshots are in `results/snapshots-0.10/` (not committed).

## Limits and deviations

Stated so the verdict is not read as more than it is.

1. **The 40-candidate cap reads a thin slice of the big repos.** langfuse's 40 candidates span 16 days
   (pool 1,096), firecrawl's span 5 weeks (pool 529). Their older history, including firecrawl's
   BullMQ-heavy period, was not read. Criterion 2's count of 4 is "4 in the 348 candidates the
   pre-registered procedure selects", not "4 in 47,336 commits".
2. **Not every candidate's full diff was read.** For mirlo (40), plunk (13) and about 35 other candidates I
   read the changed lines. For the rest (mostly firecrawl, langfuse, logchimp, and the tail of the
   others) I classified from the subject plus a filtered view of the diff showing only changed lines
   that mention a BullMQ construct (`scripts/bullscan.py`); where that view was empty the candidate
   was marked "not a bug". A contract fix that touches none of those constructs would be missed.
3. **The candidate rule was refined after the first two repos.** The preregistration says candidates
   are commits "whose message or diff suggests a fix touching a queue". The concrete rule
   (`scripts/history.py` header) was settled while working on mirlo and plunk: fix-like message AND
   (queue term in message OR a contract-bearing line changed in a queue file), topped up with fix
   commits touching consumer files when that gives fewer than 40. "Contained bullmq imports before"
   is approximated by path name, because a pickaxe over a blobless clone downloads every blob.
   The rule leans on commit messages, so repos with vague messages (midday: "Fixes (#738)") have low recall.
4. **Ground truth is single-coded** by me, from ripgrep plus reading. No second reader.
   `CORRECTIONS.md` records no post-run changes.
5. **Site conventions were fixed before the first analyzer run but after preregistration**
   (`ground-truth/README.md`): a construction inside a wrapper counts once per call site of the
   wrapper. This raises site counts in wrapper-heavy repos. The sensitivity row shows it does not
   move the averages.
6. **Default names.** Flowise, openpanel and langfuse's sharded queues have env- or shard-dependent
   names; the default name was recorded as truth. The analyzer named none of them, so this choice
   does not affect a rate.
7. **Sampling.** PeerTube, midday and langfuse are scored on 60 of 124 / 106 / 144 sites.
8. **I read the analyzer's BullMQ detector before preregistering**, to define how facts map to sites.
   The expected miss sources were written into the preregistration.
9. **Ten repos chosen by the study owner**, not a random sample. Uncertain classifications are
   flagged in the result files (4 in step D).

## Not done / skipped

- Reserve repos (sourcebot, colanode): not needed, all ten targets cloned.
- No model calls. Network use: `git clone` / on-demand blob fetch, and one `pnpm install --frozen-lockfile`.
- No issues, PRs, comments or pushes anywhere. `~/Projects/TraceHound`, `tracehound-ui` and `Recall`
  were not touched.
- Snapshots are not committed (they contain source snippets of AGPL / mixed-licence targets).
  `results/compare/*.json` holds the snippet-free comparison; `results/runs/*.json` the run records.
  To regenerate a snapshot: `python3 scripts/run_analyzer.py <repo>`.

## Files

- `PREREGISTRATION.md`, `CORRECTIONS.md`, `ground-truth/` (site lists, conventions)
- `results/runs/` (wall time, exit code, output per run), `results/compare/` (per-site outcomes, edges)
- `results/history/` (candidates, classifications with permalinks), `results/summary.md`
- `scripts/` (everything above is reproducible from these)
