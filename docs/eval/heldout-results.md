# Held-out evaluation results (decision 050)

Pre-registered in `docs/eval/protocol.md` with Amendment 1 (commit `1ec1fce`, 2026-10-05
20:00:59 IST, before any held-out model run). 8 seeded tasks on Recall `57d920e`, 2 arms
(graph-on, graph-off), 2 models (Nano, Super), 5 repeats, concurrency 1: 160 counted runs.
No significance claims. Never pooled with dev results.

**The prediction written in advance held: no difference in resolve rate between arms.**

Tasks are named by number and group only: 01–04 cross-component, 05–08 same-component. The
task files are not in this repo yet.

## Frozen values

- Code: tag `eval-freeze-2` (`b5cafde`), analyzer 0.10.0, agent-v6.
- Prompt `harness/prompts/agent-v5.md`, sha256 `556861d4…`.
- Nano: `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, reasoning on, temperature 0, max_tokens 4096,
  cost limit $0.10 per run.
- Super: `nvidia/nemotron-3-super-120b-a12b`, cost limit $0.60 per run; otherwise the same.
- Docker image `tracehound-sandbox:bun1.4.2-ts5.9.3-2` (image id
  `sha256:857f16d26f25…`).
- Per-test regression gate on Recall's 62 tests; typecheck gate baseline-matched.
- Per-run limits: 40 steps, 300,000 tokens, 15 min wall clock.
- Concurrency 1.

## Results

Recomputed from the 181 run records (160 counted) with `docs/eval/heldout/recompute.mjs`. The
"Verified at stop" column is Amendment 1's measure: the final patch passes the reproduction
test, the per-test regression gate and the typecheck gate, whatever ended the run.

| Model | Arm | n | Resolved | Verified at stop | Mean steps | Mean tokens | Mean cost | First fault-file read (mean step) | Graph tool calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Nano | graph-on | 40 | 11 | 11 | 27.3 | 251,886 | $0.0195 | 7.9 (n = 36; 4 never read it) | 0 |
| Nano | graph-off | 40 | 13 | 19 | 28.6 | 238,370 | $0.0202 | 7.6 (n = 39; 1 never read it) | 0 |
| Super | graph-on | 40 | 28 | 30 | 18.8 | 172,042 | $0.0555 | 5.0 (n = 39; 1 never read it) | 0 |
| Super | graph-off | 40 | 26 | 31 | 20.0 | 147,738 | $0.0478 | 5.2 (n = 40) | 0 |

Total cost of the 160 counted runs: $5.72362 (Nano on $0.77990, Nano off $0.80995, Super on
$2.21993, Super off $1.91384). The $6.27 quoted elsewhere is the ledger total for the whole
evaluation, $6.26774: the counted runs, plus $0.04732 for the 5 void originals, $0.47886 for the
16 Super pass-4 runs and $0.01794 for the 6 failed requests.

The 181 run records, by kind (added 2026-10-06, from the records):

| Kind | Records | Reached baseline (62 of 62) |
| --- | --- | --- |
| Counted | 160 | 160 |
| Void originals (in valid passes, re-run once) | 5 | 5 |
| Super pass-4 runs (whole pass void, outage) | 16 | 12 |
| Canaries | 0 | – |
| Anything else | 0 | – |
| Total | 181 | 177 |

The 160 counted runs are 155 from the valid passes plus 5 re-runs (Nano 76 + 4, Super 79 + 1).
The 16 canary runs (Nano 7, Super 9; oracle patch, no model) have their own records and are not
among the 181. The 4 records that did not reach baseline are the Super pass-4 runs on tasks 07
and 08 whose clone failed in the outage.

By task group, resolved / verified at stop, n = 20 each:

| Model | Arm | Cross-component | Same-component |
| --- | --- | --- | --- |
| Nano | on | 6 / 6 | 5 / 5 |
| Nano | off | 5 / 10 | 8 / 9 |
| Super | on | 14 / 15 | 14 / 15 |
| Super | off | 10 / 13 | 16 / 18 |

Per task, resolved out of 5:

| Task | Nano on | Nano off | Super on | Super off |
| --- | --- | --- | --- | --- |
| 01 (cross) | 0 | 0 | 4 | 2 |
| 02 (cross) | 0 | 0 | 1 | 0 |
| 03 (cross) | 2 | 1 | 5 | 5 |
| 04 (cross) | 4 | 4 | 4 | 3 |
| 05 (same) | 5 | 5 | 5 | 5 |
| 06 (same) | 0 | 0 | 5 | 4 |
| 07 (same) | 0 | 1 | 3 | 4 |
| 08 (same) | 0 | 2 | 1 | 3 |

End reasons, n = 40 each (finish / token budget / stuck / step budget):

| Model | Arm | Finish | Token budget | Stuck | Step budget |
| --- | --- | --- | --- | --- | --- |
| Nano | on | 13 | 25 | 1 | 1 |
| Nano | off | 15 | 23 | 2 | 0 |
| Super | on | 31 | 7 | 2 | 0 |
| Super | off | 32 | 7 | 1 | 0 |

## How to read it

- No resolve-rate difference: two runs out of 40 on each model, in opposite directions (Nano 11
  with the graph against 13 without; Super 28 against 26).
- The agent never called a graph tool in 80 graph-on runs. The fault file was reached at about the
  same step in both arms (Nano 7.9 against 7.6, Super 5.0 against 5.2).
- The one sizeable gap goes against the graph: Nano verified at stop, 19 of 40 without the graph
  against 11 of 40 with it. It is a secondary measure and not claimed as an effect. It fits the
  token cost of the packet.
- The one hint for the graph is thin: Super on cross-component tasks resolved 14 of 20 with the
  graph against 10 of 20 without. It narrows to 15 against 13 at stop, same-component goes the
  other way (14 against 16), and all four cross-component tasks have their fault in one file.
- The model matters far more than the graph: Super resolved 54 of 80, Nano 24 of 80.
- The graph arm costs more on Super: $0.0555 against $0.0478 a run.

## Validity checks

- **Repeats are independent.** The response cache was write-only: 0 cache hits in 4,128 model
  calls across all 181 run records. The ledger has 4,134 lines from the first to the last run:
  4,128 successful calls, matching the records call for call, and 6 failed requests, all model
  request timeouts. Five of them made the five void originals void (Nano pass 2: 01 off, 04 on;
  Nano pass 3: 08 on, 08 off; Super pass 5: 06 on). The sixth ended the Super pass-4 run on task
  06 graph-on, 13 s before the first pass-4 run whose clone failed started; that run is void with the rest of
  pass 4 and was not re-run on its own. (Corrected 2026-10-06: this line used to say all six
  timeouts made runs void, which counts pass 4 as if it were a void run.)
- No baseline-anomaly flags. Every run that reached its baseline had 62 of 62 (177 records); the
  4 that did not are the Super pass-4 runs that failed on the network outage before starting.
- Canaries (oracle patch on task 01, no model): Nano 7 of 7 RESOLVED; Super 8 of 9, the one
  failure being the outage that voided pass 4.
- 13 counted runs ended on finish without being RESOLVED: in 12 the reproduction test still
  failed (7 of them on task 02); in 1 the agent left a scratch file that failed the typecheck
  gate.

## Disclosures

- The held-out candidates and final task list were shown to the chat assistant on Oct 4 19:56 and
  Oct 5 19:50 IST, after the freeze. The 8 tasks were chosen by the authoring session's own
  suggestion, made without knowledge of dev results.
- All four cross-component tasks have their fault in one file, because Recall's worker component
  is two files. One of them shares a theme with a dev task.
- The amendment preceded every held-out model run; scripted oracle and noop validation runs came
  before it.
- Sunny changed the stop rule mid-run after two model timeouts, and later let the session resolve
  infrastructure failures itself.
- Void runs, re-run once by rule (original → re-run): Nano 01 off UNRESOLVED → UNRESOLVED; Nano
  04 on RESOLVED → RESOLVED; Nano 08 on UNRESOLVED → UNRESOLVED; Nano 08 off UNRESOLVED →
  RESOLVED; Super 06 on UNRESOLVED → RESOLVED.
- Super pass 4 was voided by a network outage and replaced.
- The graph-on arm is in practice "context packet injected"; the tools were offered and never
  called.
- The evaluation session's driver scripts were not under `~/Projects/TraceHound-eval` or
  `~/Projects/tracehound-heldout` when decision 050 was written. They were in the evaluation
  session's scratchpad under `/private/tmp`; Sunny copied them on 2026-10-06, timestamps kept, to
  `~/Projects/tracehound-heldout/drivers-2026-10-06/`. All five are there, packed unchanged as the
  third tarball (below); none contains an API key. Modification times (IST):

  | File | Bytes | Modified |
  | --- | --- | --- |
  | `drive.sh` | 1,939 | 2026-10-05 20:34:21 |
  | `aggregate.mjs` | 13,159 | 2026-10-05 20:36:36 |
  | `passes.sh` | 1,987 | 2026-10-06 00:02:17 |
  | `rerun.sh` | 1,907 | 2026-10-06 03:45:35 |
  | `check.mjs` | 4,094 | 2026-10-06 10:50:50 |

  The first held-out run started 2026-10-05 20:35:15 IST and the last ended 2026-10-06 10:36:38
  IST, so `drive.sh` predates the runs, `aggregate.mjs` was last changed a minute after they
  began, and `check.mjs` after they ended (the other two tarballs are dated 10:51). The tables on
  this page come from `recompute.mjs`, not from these scripts.
- The evaluation prompt is now in `docs/prompts/heldout-eval-run.md`, copied verbatim from the
  appendix of `TraceHound_Handoff_Oct5.md` (briefs folder), where it was saved because the frozen
  worktree takes no commits. It was not found when decision 050 was written.

## Archive

Three tarballs in `~/Projects/tracehound-heldout/archive/`, attached to a draft GitHub release:

| File | sha256 |
| --- | --- |
| `heldout-eval-runs-2026-10-06.tar.gz` | `4baead155c971df31e4e4bf859936f00725e21294b41c67a365261a5905ac40d` |
| `heldout-eval-results-2026-10-06.tar.gz` | `83458ec1ae4f586df79009080a70f10115fba4e8f07f9b0429b23f212c9ae4dd` |
| `heldout-eval-drivers-2026-10-06.tar.gz` | `69798c38d9fb26e156baf6d034d9118eb063e28566f44c49042d4611cbc021e8` |

The drivers tarball was added on 2026-10-06 after decision 050; it holds the folder
`drivers-2026-10-06/` with the five scripts above.

## Files in `docs/eval/heldout/`

Copied unchanged from `~/Projects/tracehound-heldout/results/`: `b1-nano.config.json`,
`b2-super.config.json`, `b1-nano/results.json`, `b1-nano/results.md`, `b1-nano/STATUS.md`,
`b2-super/results.md`, `b2-super/STATUS.md`. Plus `recompute.mjs` (decision 050).

Left out:
- `b2-super/results.json`: one row's reason quotes the typecheck error from an agent-written
  scratch test, which names a Recall source file and symbol. Its tables are the same as in
  `b2-super/results.md`, and the file is in the results tarball.
- The run records (patches, test names, agent-written test text); they are in the runs tarball.
- The task files and their README (statement text, seeds, oracle patches); publishing them waits
  on a check by Sunny.
