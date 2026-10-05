# Dev runs: "resolved" and "verified at stop" (protocol amendment 1, decision 049)

Recounted on 2026-10-05 from the existing run records only. No run was made and nothing was spent.
Dev tasks only (`recall-dev-*`, kind `dev`): tuned on, never evaluation results, never pooled
with held-out results.

**Verified at stop** (`docs/eval/protocol.md`, Amendment 1): the final patch passes the
reproduction test, the per-test regression gate and the typecheck gate, whatever ended the run.
In a record, that is `repro.afterPatch` exit 0 and not timed out, with `comparison.newFailures`
empty. `comparison.newFailures` holds both the regression gate (decision 043, per test; every
record has `granularity: "test"`) and the baseline-matched typecheck gate (decision 041). The
harness checks these for every run after the agent stops, including budget and stuck stops
(`packages/analyzer/src/harness/run.ts:735-742`). It scores RESOLVED only when the agent did not
stop on a budget or the stuck guard. **Every one of the 40 records has the data. Nothing is
"not recorded".**

## Per arm

| Set | Arm | n | Resolved | Verified at stop |
|---|---|---|---|---|
| agent-v5, Nano (round 1 + runner test, prompt `556861d4…`) | graph-on | 8 | 4 of 8 | 5 of 8 |
| agent-v5, Nano (round 1 + runner test, prompt `556861d4…`) | graph-off | 8 | 4 of 8 | 4 of 8 |
| agent-v6, Nano | graph-on | 8 | 3 of 8 | 3 of 8 |
| agent-v6, Nano | graph-off | 8 | 4 of 8 | 4 of 8 |
| agent-v6, Super (probe, amendment 1 of agent-v6) | graph-on | 4 | 3 of 4 | 3 of 4 |
| agent-v6, Super (probe, amendment 1 of agent-v6) | graph-off | 4 | 2 of 4 | 2 of 4 |

- Every RESOLVED run is also verified at stop (as it must be, since RESOLVED needs both gates).
- One run is verified at stop but not RESOLVED: agent-v5 runner test, search-description,
  graph-on, which ended on `budget: tokens 300000` with a patch that passes all three gates.
- In the other 39 runs the two measures agree.
- n = runs with a record. No significance test was run and none is implied.

Sources (gitignored, not committed): agent-v5 `runs/phase3-round1/` and `runs/phase4-runner/runs/`
(the 16 frozen-prompt runs in `docs/build-log.md`); agent-v6 Nano: the 16 rows of
`runs/phase4-v6-nano-merged/results.json` (published as `docs/eval/agent-v6-dev-2026-10-04/nano/`);
Super: `runs/phase4-v6-super/runs/` (published as `docs/eval/agent-v6-dev-2026-10-04/super/`).
The "Resolved" counts match those published tables and the build log.

## Per run

"Repro" = the task's reproduction test after the final patch; "Regression" = the per-test gate;
"Typecheck" = no tsc error that the baseline does not have.

| Set | Task | Arm | State | End | Repro | Regression | Typecheck | Verified at stop | Record |
|---|---|---|---|---|---|---|---|---|---|
| agent-v5 (round 1) | chat-recent | on | RESOLVED | finish | pass | pass | pass | yes | `recall-dev-chat-recent__nemotron__2026-10-03T11-57-06-846Z__a5bff3` |
| agent-v5 (round 1) | chat-recent | off | RESOLVED | finish | pass | pass | pass | yes | `recall-dev-chat-recent__nemotron__2026-10-03T11-57-06-846Z__3624bc` |
| agent-v5 (round 1) | search-description | on | UNRESOLVED | budget: tokens 300000 | **fail** | pass | pass | no | `recall-dev-search-description__nemotron__2026-10-03T11-46-50-992Z__03204d` |
| agent-v5 (round 1) | search-description | off | RESOLVED | finish | pass | pass | pass | yes | `recall-dev-search-description__nemotron__2026-10-03T11-46-50-988Z__ffe793` |
| agent-v5 (round 1) | session-expiry | on | RESOLVED | finish | pass | pass | pass | yes | `recall-dev-session-expiry__nemotron__2026-10-03T11-54-14-838Z__3bf49f` |
| agent-v5 (round 1) | session-expiry | off | RESOLVED | finish | pass | pass | pass | yes | `recall-dev-session-expiry__nemotron__2026-10-03T11-54-14-838Z__e84a6e` |
| agent-v5 (round 1) | short-summary | on | UNRESOLVED | budget: tokens 300000 | **fail** | pass | pass | no | `recall-dev-short-summary__nemotron__2026-10-03T11-42-05-590Z__bd197c` |
| agent-v5 (round 1) | short-summary | off | UNRESOLVED | budget: steps 40 | pass | **fail** | pass | no | `recall-dev-short-summary__nemotron__2026-10-03T11-42-05-590Z__f16d42` |
| agent-v5 (runner test) | chat-recent | on | RESOLVED | finish | pass | pass | pass | yes | `recall-dev-chat-recent__nemotron__2026-10-03T12-49-32-734Z__fa8832` |
| agent-v5 (runner test) | chat-recent | off | UNRESOLVED | budget: steps 40 | **fail** | pass | pass | no | `recall-dev-chat-recent__nemotron__2026-10-03T12-53-19-309Z__73f0fe` |
| agent-v5 (runner test) | search-description | on | UNRESOLVED | budget: tokens 300000 | pass | pass | pass | **yes** | `recall-dev-search-description__nemotron__2026-10-03T12-57-44-665Z__e6aa82` |
| agent-v5 (runner test) | search-description | off | UNRESOLVED | budget: steps 40 | **fail** | pass | pass | no | `recall-dev-search-description__nemotron__2026-10-03T13-02-49-243Z__a25c5e` |
| agent-v5 (runner test) | session-expiry | on | RESOLVED | finish | pass | pass | pass | yes | `recall-dev-session-expiry__nemotron__2026-10-03T13-12-32-747Z__62a863` |
| agent-v5 (runner test) | session-expiry | off | RESOLVED | finish | pass | pass | pass | yes | `recall-dev-session-expiry__nemotron__2026-10-03T13-14-57-745Z__b4cb9e` |
| agent-v5 (runner test) | short-summary | on | UNRESOLVED | budget: tokens 300000 | **fail** | **fail** | **fail** | no | `recall-dev-short-summary__nemotron__2026-10-03T13-17-49-156Z__0e29b3` |
| agent-v5 (runner test) | short-summary | off | UNRESOLVED | budget: tokens 300000 | **fail** | pass | pass | no | `recall-dev-short-summary__nemotron__2026-10-03T13-24-09-526Z__b50eb7` |
| agent-v6 Nano | chat-recent | on | UNRESOLVED | budget: tokens 300000 | **fail** | pass | pass | no | `recall-dev-chat-recent__nemotron__2026-10-03T18-45-58-200Z__c0fd72` |
| agent-v6 Nano | chat-recent | on | UNRESOLVED | budget: tokens 300000 | **fail** | pass | pass | no | `recall-dev-chat-recent__nemotron__2026-10-03T18-55-48-786Z__fbb60c` |
| agent-v6 Nano | chat-recent | off | RESOLVED | finish | pass | pass | pass | yes | `recall-dev-chat-recent__nemotron__2026-10-03T18-52-56-014Z__56b006` |
| agent-v6 Nano | chat-recent | off | RESOLVED | finish | pass | pass | pass | yes | `recall-dev-chat-recent__nemotron__2026-10-03T19-03-23-274Z__c67b1c` |
| agent-v6 Nano | search-description | on | RESOLVED | finish | pass | pass | pass | yes | `recall-dev-search-description__nemotron__2026-10-03T19-07-59-260Z__2fdbc3` |
| agent-v6 Nano | search-description | on | UNRESOLVED | budget: tokens 300000 | **fail** | pass | pass | no | `recall-dev-search-description__nemotron__2026-10-03T19-22-23-384Z__28b3c7` |
| agent-v6 Nano | search-description | off | UNRESOLVED | error: The operation was aborted due to timeout | **fail** | pass | pass | no | `recall-dev-search-description__nemotron__2026-10-03T19-11-41-712Z__484e8e` |
| agent-v6 Nano | search-description | off | UNRESOLVED | budget: tokens 300000 | **fail** | pass | pass | no | `recall-dev-search-description__nemotron__2026-10-03T19-32-13-214Z__eb9e31` |
| agent-v6 Nano | session-expiry | on | RESOLVED | finish | pass | pass | pass | yes | `recall-dev-session-expiry__nemotron__2026-10-03T19-43-00-672Z__e0b090` |
| agent-v6 Nano | session-expiry | on | RESOLVED | finish | pass | pass | pass | yes | `recall-dev-session-expiry__nemotron__2026-10-03T19-49-05-560Z__40e1da` |
| agent-v6 Nano | session-expiry | off | RESOLVED | finish | pass | pass | pass | yes | `recall-dev-session-expiry__nemotron__2026-10-03T19-46-17-986Z__06fd8f` |
| agent-v6 Nano | session-expiry | off | RESOLVED | finish | pass | pass | pass | yes | `recall-dev-session-expiry__nemotron__2026-10-03T19-52-00-303Z__ba90ac` |
| agent-v6 Nano | short-summary | on | UNRESOLVED | budget: tokens 300000 | **fail** | pass | pass | no | `recall-dev-short-summary__nemotron__2026-10-03T19-55-31-611Z__a416a7` |
| agent-v6 Nano | short-summary | on | UNRESOLVED | budget: tokens 300000 | pass | **fail** | pass | no | `recall-dev-short-summary__nemotron__2026-10-03T20-08-43-368Z__f26829` |
| agent-v6 Nano | short-summary | off | UNRESOLVED | budget: tokens 300000 | pass | **fail** | pass | no | `recall-dev-short-summary__nemotron__2026-10-03T20-02-15-157Z__c2290a` |
| agent-v6 Nano | short-summary | off | UNRESOLVED | budget: tokens 300000 | pass | **fail** | pass | no | `recall-dev-short-summary__nemotron__2026-10-03T20-16-32-327Z__8cd507` |
| agent-v6 Super | chat-recent | on | RESOLVED | finish | pass | pass | pass | yes | `recall-dev-chat-recent__nemotron__2026-10-03T20-23-33-147Z__724190` |
| agent-v6 Super | chat-recent | off | RESOLVED | finish | pass | pass | pass | yes | `recall-dev-chat-recent__nemotron__2026-10-03T20-24-58-006Z__045ce4` |
| agent-v6 Super | search-description | on | RESOLVED | finish | pass | pass | pass | yes | `recall-dev-search-description__nemotron__2026-10-03T20-26-05-761Z__b63428` |
| agent-v6 Super | search-description | off | UNRESOLVED | budget: tokens 300000 | **fail** | pass | pass | no | `recall-dev-search-description__nemotron__2026-10-03T20-27-33-640Z__f8d6d6` |
| agent-v6 Super | session-expiry | on | RESOLVED | finish | pass | pass | pass | yes | `recall-dev-session-expiry__nemotron__2026-10-03T20-29-43-599Z__a73e7c` |
| agent-v6 Super | session-expiry | off | RESOLVED | finish | pass | pass | pass | yes | `recall-dev-session-expiry__nemotron__2026-10-03T20-30-50-592Z__076a34` |
| agent-v6 Super | short-summary | on | UNRESOLVED | stopped: stuck | **fail** | pass | pass | no | `recall-dev-short-summary__nemotron__2026-10-03T20-31-52-683Z__6af293` |
| agent-v6 Super | short-summary | off | UNRESOLVED | budget: tokens 300000 | pass | **fail** | pass | no | `recall-dev-short-summary__nemotron__2026-10-03T20-33-11-443Z__15ba6f` |

Record times are UTC (all 40 started on 2026-10-03 UTC). The amendment's 4 October example is a
repair run on a task made from a reproduce-stage record (`runs/phase4-repair/`,
`recall-dev-chat-recent-seeded-from-repro`, graph-off, Nano, 2026-10-04T09:28Z): UNRESOLVED on
`budget: steps 40`, with the agent-written repro passing and no new failures. It is not one of the
40 above and is not counted here.
