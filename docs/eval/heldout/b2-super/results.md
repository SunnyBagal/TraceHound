# Held-out evaluation, b2-super: nvidia/nemotron-3-super-120b-a12b (--model)

Generated 2026-10-06T05:07:28.758Z. Frozen code `eval-freeze-2 (b5cafde03e2ff377277333871eef19f264d5c0b5), image sha256:857f16d26f2573f1a42e90e35242f773ddb82caa4802aa5d93bbcfedd7d77eed`. Protocol: docs/eval/protocol.md with Amendment 1, commit 1ec1fcea2d146ccea3ba120d413942a5aeb06dd0 (2026-10-05 20:00:59 +0530) on origin/docs/protocol-amendment-1 (tip 4b8079f, same time, adds decision 049 only). Cost limit per run $0.6.

Counted runs: valid passes without their void runs, plus the re-runs of void runs. Every figure has its n. No significance test was run and none is implied. Not pooled with dev results.

## Per arm

| Arm | n | Resolved | Verified at stop | End reasons | Steps (mean) | Tokens (mean) | Cost (mean) | Wall time (mean) | First fault-file read (mean step) | Graph tool calls | Packet injected (mean chars) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| graph-on | 40 | 28 of 40 | 30 of 40 | finish 31; budget: tokens 300000 7; stopped: stuck 2 (n = 40) | 18.8 (n = 40) | 172042 (n = 40) | $0.05550 (n = 40) | 106 s (n = 40) | 5.0 (n = 39); never read 1 of 40 | 0 total, in 0 of 40 runs | 40 of 40; 3537 chars (min 2051, max 6034; n = 40) |
| graph-off | 40 | 26 of 40 | 31 of 40 | finish 32; budget: tokens 300000 7; stopped: stuck 1 (n = 40) | 20.0 (n = 40) | 147738 (n = 40) | $0.04785 (n = 40) | 103 s (n = 40) | 5.2 (n = 40); never read 0 of 40 | 0 total, in 0 of 40 runs | 0 of 40 |

## cross-component (4 tasks)

| Arm | n | Resolved | Verified at stop | End reasons | Steps (mean) | Tokens (mean) | Cost (mean) | Wall time (mean) | First fault-file read (mean step) | Graph tool calls | Packet injected (mean chars) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| graph-on | 20 | 14 of 20 | 15 of 20 | finish 17; budget: tokens 300000 3 (n = 20) | 19.7 (n = 20) | 173222 (n = 20) | $0.05498 (n = 20) | 101 s (n = 20) | 7.5 (n = 19); never read 1 of 20 | 0 total, in 0 of 20 runs | 20 of 20; 3060 chars (min 2593, max 4137; n = 20) |
| graph-off | 20 | 10 of 20 | 13 of 20 | finish 15; budget: tokens 300000 4; stopped: stuck 1 (n = 20) | 20.1 (n = 20) | 143561 (n = 20) | $0.04621 (n = 20) | 98 s (n = 20) | 5.5 (n = 20); never read 0 of 20 | 0 total, in 0 of 20 runs | 0 of 20 |

## same-component (4 tasks)

| Arm | n | Resolved | Verified at stop | End reasons | Steps (mean) | Tokens (mean) | Cost (mean) | Wall time (mean) | First fault-file read (mean step) | Graph tool calls | Packet injected (mean chars) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| graph-on | 20 | 14 of 20 | 15 of 20 | finish 14; budget: tokens 300000 4; stopped: stuck 2 (n = 20) | 17.8 (n = 20) | 170862 (n = 20) | $0.05602 (n = 20) | 112 s (n = 20) | 2.7 (n = 20); never read 0 of 20 | 0 total, in 0 of 20 runs | 20 of 20; 4014 chars (min 2051, max 6034; n = 20) |
| graph-off | 20 | 16 of 20 | 18 of 20 | finish 17; budget: tokens 300000 3 (n = 20) | 19.9 (n = 20) | 151915 (n = 20) | $0.04948 (n = 20) | 107 s (n = 20) | 5.0 (n = 20); never read 0 of 20 | 0 total, in 0 of 20 runs | 0 of 20 |

## Per task: resolved out of n (verified at stop out of n)

| Task | Group | graph-on resolved | graph-on verified at stop | graph-off resolved | graph-off verified at stop |
|---|---|---|---|---|---|
| recall-heldout-01 | cross-component | 4 of 5 | 5 of 5 | 2 of 5 | 5 of 5 |
| recall-heldout-02 | cross-component | 1 of 5 | 1 of 5 | 0 of 5 | 0 of 5 |
| recall-heldout-03 | cross-component | 5 of 5 | 5 of 5 | 5 of 5 | 5 of 5 |
| recall-heldout-04 | cross-component | 4 of 5 | 4 of 5 | 3 of 5 | 3 of 5 |
| recall-heldout-05 | same-component | 5 of 5 | 5 of 5 | 5 of 5 | 5 of 5 |
| recall-heldout-06 | same-component | 5 of 5 | 5 of 5 | 4 of 5 | 5 of 5 |
| recall-heldout-07 | same-component | 3 of 5 | 3 of 5 | 4 of 5 | 4 of 5 |
| recall-heldout-08 | same-component | 1 of 5 | 2 of 5 | 3 of 5 | 4 of 5 |

## Other counts per arm

| Arm | n | Failed edits (total) | Unknown-tool calls (total) | Cost (total) |
|---|---|---|---|---|
| graph-on | 40 | 2 | 1 | $2.21993 |
| graph-off | 40 | 3 | 0 | $1.91384 |

## Passes

| Pass | Arm order | Status | Reason |
|---|---|---|---|
| pass-1 | on,off | valid | canary-after-pass-1 RESOLVED; no void runs; baselines 62/62 |
| pass-2 | off,on | valid | canary-after-pass-2 RESOLVED; no void runs; baselines 62/62 |
| pass-3 | on,off | valid | canary-after-pass-3 RESOLVED; no void runs; baselines 62/62 |
| pass-4 | off,on | void | host network outage from about 07:05 IST: canary-after-pass-4 FAILED (DNS, git clone); 4 runs FAILED (07 on/off, 08 on/off, same cause) and 06 graph-on ended in a model request timeout. Records kept. |
| pass-4-replacement-1 | off,on | valid | replacement 1 of 2 for void pass-4; canaries before and after RESOLVED; no void runs; baselines 62/62 |
| pass-5 | on,off | valid | canary-after-pass-5 RESOLVED; 1 void run (model request timeout); baselines 62/62 |

## Canaries (oracle patch, recall-heldout-01, no model)

| Canary | State |
|---|---|
| canary-0-before | RESOLVED |
| canary-after-pass-1 | RESOLVED |
| canary-after-pass-2 | RESOLVED |
| canary-after-pass-3 | RESOLVED |
| canary-after-pass-4 | FAILED (harness error: git clone failed, Could not resolve host: github.com) |
| canary-before-pass-4-replacement-1 | RESOLVED |
| canary-after-pass-4-replacement-1 | RESOLVED |
| canary-after-pass-5 | RESOLVED |
| canary-after-reruns | RESOLVED |

## Void runs

| Pass | Task | Arm | Reason | Re-run |
|---|---|---|---|---|
| pass-5 | recall-heldout-06 | graph-on | infrastructure: model request timeout ("The operation was aborted due to timeout", 60 s client timeout); recorded verdict UNRESOLVED | rerun-pass-5-06-on |

Baseline anomaly (runner flag per pass, or the same function over the whole batch): none.

## Every run

| Pass | Task | Arm | Counted | State | End | Verified at stop | Repro | Regressed | Typecheck = baseline | Steps | Tokens | Cost | Wall | Fault read step | Graph calls | Packet chars | Baseline | Record |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pass-1 | recall-heldout-01 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 19 | 136612 | $0.04291 | 82 s | 5 | 0 | 2794 | 62/62 | `b2-super/pass-1/runs/recall-heldout-01__nemotron__2026-10-06T00-01-13-060Z__60bbeb.json` |
| pass-1 | recall-heldout-01 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 26 | 176550 | $0.05618 | 111 s | 4 | 0 | — | 62/62 | `b2-super/pass-1/runs/recall-heldout-01__nemotron__2026-10-06T00-02-35-178Z__aa4215.json` |
| pass-1 | recall-heldout-02 | graph-on | yes | UNRESOLVED | finish | no | fail | 0 | yes | 23 | 230588 | $0.07386 | 134 s | 9 | 0 | 4137 | 62/62 | `b2-super/pass-1/runs/recall-heldout-02__nemotron__2026-10-06T00-04-26-971Z__89b817.json` |
| pass-1 | recall-heldout-02 | graph-off | yes | UNRESOLVED | finish | no | fail | 0 | yes | 24 | 216537 | $0.06954 | 122 s | 6 | 0 | — | 62/62 | `b2-super/pass-1/runs/recall-heldout-02__nemotron__2026-10-06T00-06-40-933Z__b9210b.json` |
| pass-1 | recall-heldout-03 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 19 | 144206 | $0.04532 | 82 s | 6 | 0 | 2714 | 62/62 | `b2-super/pass-1/runs/recall-heldout-03__nemotron__2026-10-06T00-08-43-162Z__4cb717.json` |
| pass-1 | recall-heldout-03 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 16 | 83134 | $0.02609 | 74 s | 4 | 0 | — | 62/62 | `b2-super/pass-1/runs/recall-heldout-03__nemotron__2026-10-06T00-10-05-617Z__2409f0.json` |
| pass-1 | recall-heldout-04 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 18 | 123968 | $0.04078 | 103 s | 7 | 0 | 2593 | 62/62 | `b2-super/pass-1/runs/recall-heldout-04__nemotron__2026-10-06T00-11-19-769Z__4be473.json` |
| pass-1 | recall-heldout-04 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 10 | 35582 | $0.01224 | 69 s | 4 | 0 | — | 62/62 | `b2-super/pass-1/runs/recall-heldout-04__nemotron__2026-10-06T00-13-02-945Z__8a3d62.json` |
| pass-1 | recall-heldout-05 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 10 | 67757 | $0.02188 | 73 s | 2 | 0 | 6034 | 62/62 | `b2-super/pass-1/runs/recall-heldout-05__nemotron__2026-10-06T00-14-12-420Z__702539.json` |
| pass-1 | recall-heldout-05 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 12 | 49025 | $0.01556 | 65 s | 4 | 0 | — | 62/62 | `b2-super/pass-1/runs/recall-heldout-05__nemotron__2026-10-06T00-15-26-184Z__e2b6de.json` |
| pass-1 | recall-heldout-06 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 18 | 153688 | $0.05007 | 121 s | 3 | 0 | 4417 | 62/62 | `b2-super/pass-1/runs/recall-heldout-06__nemotron__2026-10-06T00-16-31-047Z__bb8c9c.json` |
| pass-1 | recall-heldout-06 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 11 | 54651 | $0.01786 | 80 s | 4 | 0 | — | 62/62 | `b2-super/pass-1/runs/recall-heldout-06__nemotron__2026-10-06T00-18-32-261Z__99d1fa.json` |
| pass-1 | recall-heldout-07 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | pass | 1 | yes | 25 | 306439 | $0.10247 | 201 s | 2 | 0 | 3554 | 62/62 | `b2-super/pass-1/runs/recall-heldout-07__nemotron__2026-10-06T00-19-52-728Z__3d20aa.json` |
| pass-1 | recall-heldout-07 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 19 | 142926 | $0.04870 | 127 s | 4 | 0 | — | 62/62 | `b2-super/pass-1/runs/recall-heldout-07__nemotron__2026-10-06T00-23-14-246Z__648f81.json` |
| pass-1 | recall-heldout-08 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 22 | 249832 | $0.08224 | 136 s | 3 | 0 | 2051 | 62/62 | `b2-super/pass-1/runs/recall-heldout-08__nemotron__2026-10-06T00-25-21-118Z__f7af82.json` |
| pass-1 | recall-heldout-08 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 28 | 268594 | $0.08569 | 133 s | 6 | 0 | — | 62/62 | `b2-super/pass-1/runs/recall-heldout-08__nemotron__2026-10-06T00-27-37-182Z__aef422.json` |
| pass-2 | recall-heldout-01 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 16 | 85894 | $0.02799 | 79 s | 4 | 0 | — | 62/62 | `b2-super/pass-2/runs/recall-heldout-01__nemotron__2026-10-06T00-30-27-944Z__2a043f.json` |
| pass-2 | recall-heldout-01 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 20 | 172669 | $0.05352 | 71 s | 5 | 0 | 2794 | 62/62 | `b2-super/pass-2/runs/recall-heldout-01__nemotron__2026-10-06T00-31-47-620Z__89e217.json` |
| pass-2 | recall-heldout-02 | graph-off | yes | UNRESOLVED | stopped: stuck | no | fail | 0 | yes | 25 | 232573 | $0.07805 | 146 s | 8 | 0 | — | 62/62 | `b2-super/pass-2/runs/recall-heldout-02__nemotron__2026-10-06T00-32-59-306Z__56f2ee.json` |
| pass-2 | recall-heldout-02 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 18 | 173338 | $0.05474 | 89 s | 10 | 0 | 4137 | 62/62 | `b2-super/pass-2/runs/recall-heldout-02__nemotron__2026-10-06T00-35-25-862Z__9012f5.json` |
| pass-2 | recall-heldout-03 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 11 | 51243 | $0.01632 | 68 s | 4 | 0 | — | 62/62 | `b2-super/pass-2/runs/recall-heldout-03__nemotron__2026-10-06T00-36-54-661Z__d88bed.json` |
| pass-2 | recall-heldout-03 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 13 | 79298 | $0.02499 | 68 s | 4 | 0 | 2714 | 62/62 | `b2-super/pass-2/runs/recall-heldout-03__nemotron__2026-10-06T00-38-03-355Z__910424.json` |
| pass-2 | recall-heldout-04 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 10 | 37249 | $0.01239 | 67 s | 4 | 0 | — | 62/62 | `b2-super/pass-2/runs/recall-heldout-04__nemotron__2026-10-06T00-39-11-453Z__dc3b44.json` |
| pass-2 | recall-heldout-04 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 7 | 38985 | $0.01286 | 59 s | 3 | 0 | 2593 | 62/62 | `b2-super/pass-2/runs/recall-heldout-04__nemotron__2026-10-06T00-40-18-846Z__89c00f.json` |
| pass-2 | recall-heldout-05 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 17 | 75124 | $0.02413 | 74 s | 4 | 0 | — | 62/62 | `b2-super/pass-2/runs/recall-heldout-05__nemotron__2026-10-06T00-41-18-586Z__55364d.json` |
| pass-2 | recall-heldout-05 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 10 | 70395 | $0.02199 | 63 s | 2 | 0 | 6034 | 62/62 | `b2-super/pass-2/runs/recall-heldout-05__nemotron__2026-10-06T00-42-32-487Z__bded13.json` |
| pass-2 | recall-heldout-06 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 25 | 211025 | $0.06868 | 134 s | 4 | 0 | — | 62/62 | `b2-super/pass-2/runs/recall-heldout-06__nemotron__2026-10-06T00-43-35-864Z__a77aa0.json` |
| pass-2 | recall-heldout-06 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 8 | 52268 | $0.01686 | 67 s | 1 | 0 | 4417 | 62/62 | `b2-super/pass-2/runs/recall-heldout-06__nemotron__2026-10-06T00-45-49-763Z__70648f.json` |
| pass-2 | recall-heldout-07 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 26 | 222262 | $0.07388 | 142 s | 4 | 0 | — | 62/62 | `b2-super/pass-2/runs/recall-heldout-07__nemotron__2026-10-06T00-46-56-766Z__022303.json` |
| pass-2 | recall-heldout-07 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 17 | 142803 | $0.04710 | 107 s | 3 | 0 | 3554 | 62/62 | `b2-super/pass-2/runs/recall-heldout-07__nemotron__2026-10-06T00-49-18-711Z__100522.json` |
| pass-2 | recall-heldout-08 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 32 | 308742 | $0.10275 | 144 s | 9 | 0 | — | 62/62 | `b2-super/pass-2/runs/recall-heldout-08__nemotron__2026-10-06T00-51-05-877Z__1145fb.json` |
| pass-2 | recall-heldout-08 | graph-on | yes | UNRESOLVED | stopped: stuck | no | fail | 0 | yes | 17 | 135924 | $0.04539 | 88 s | 5 | 0 | 2051 | 62/62 | `b2-super/pass-2/runs/recall-heldout-08__nemotron__2026-10-06T00-53-30-284Z__1e95da.json` |
| pass-3 | recall-heldout-01 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 24 | 195037 | $0.06047 | 71 s | 6 | 0 | 2794 | 62/62 | `b2-super/pass-3/runs/recall-heldout-01__nemotron__2026-10-06T00-55-38-381Z__ad3532.json` |
| pass-3 | recall-heldout-01 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | yes | pass | 0 | yes | 36 | 310754 | $0.09672 | 109 s | 4 | 0 | — | 62/62 | `b2-super/pass-3/runs/recall-heldout-01__nemotron__2026-10-06T00-56-49-926Z__24943d.json` |
| pass-3 | recall-heldout-02 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 27 | 316179 | $0.10186 | 123 s | 10 | 0 | 4137 | 62/62 | `b2-super/pass-3/runs/recall-heldout-02__nemotron__2026-10-06T00-58-39-681Z__fc88ae.json` |
| pass-3 | recall-heldout-02 | graph-off | yes | UNRESOLVED | finish | no | fail | 0 | yes | 21 | 151126 | $0.05011 | 162 s | 6 | 0 | — | 62/62 | `b2-super/pass-3/runs/recall-heldout-02__nemotron__2026-10-06T01-00-42-599Z__20e0dc.json` |
| pass-3 | recall-heldout-03 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 15 | 108724 | $0.03422 | 211 s | 6 | 0 | 2714 | 62/62 | `b2-super/pass-3/runs/recall-heldout-03__nemotron__2026-10-06T01-03-24-411Z__4c1e20.json` |
| pass-3 | recall-heldout-03 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 7 | 22326 | $0.00711 | 61 s | 4 | 0 | — | 62/62 | `b2-super/pass-3/runs/recall-heldout-03__nemotron__2026-10-06T01-06-55-599Z__1d32cd.json` |
| pass-3 | recall-heldout-04 | graph-on | yes | UNRESOLVED | finish | no | fail | 0 | yes | 18 | 147953 | $0.04645 | 95 s | 14 | 0 | 2593 | 62/62 | `b2-super/pass-3/runs/recall-heldout-04__nemotron__2026-10-06T01-07-56-531Z__666714.json` |
| pass-3 | recall-heldout-04 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 10 | 39112 | $0.01289 | 84 s | 3 | 0 | — | 62/62 | `b2-super/pass-3/runs/recall-heldout-04__nemotron__2026-10-06T01-09-31-561Z__e5f6ac.json` |
| pass-3 | recall-heldout-05 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 8 | 55629 | $0.01735 | 59 s | 2 | 0 | 6034 | 62/62 | `b2-super/pass-3/runs/recall-heldout-05__nemotron__2026-10-06T01-10-56-070Z__99aa73.json` |
| pass-3 | recall-heldout-05 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 17 | 71769 | $0.02316 | 71 s | 5 | 0 | — | 62/62 | `b2-super/pass-3/runs/recall-heldout-05__nemotron__2026-10-06T01-11-55-662Z__514cb2.json` |
| pass-3 | recall-heldout-06 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 18 | 133323 | $0.04287 | 87 s | 4 | 0 | 4417 | 62/62 | `b2-super/pass-3/runs/recall-heldout-06__nemotron__2026-10-06T01-13-07-022Z__1fdfef.json` |
| pass-3 | recall-heldout-06 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 7 | 24087 | $0.00767 | 54 s | 4 | 0 | — | 62/62 | `b2-super/pass-3/runs/recall-heldout-06__nemotron__2026-10-06T01-14-34-078Z__52c893.json` |
| pass-3 | recall-heldout-07 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 13 | 112845 | $0.03664 | 90 s | 2 | 0 | 3554 | 62/62 | `b2-super/pass-3/runs/recall-heldout-07__nemotron__2026-10-06T01-15-28-864Z__86b6c0.json` |
| pass-3 | recall-heldout-07 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 18 | 118639 | $0.04090 | 112 s | 4 | 0 | — | 62/62 | `b2-super/pass-3/runs/recall-heldout-07__nemotron__2026-10-06T01-16-59-529Z__2da02f.json` |
| pass-3 | recall-heldout-08 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | yes | pass | 0 | yes | 27 | 311889 | $0.10162 | 144 s | 3 | 0 | 2051 | 62/62 | `b2-super/pass-3/runs/recall-heldout-08__nemotron__2026-10-06T01-18-52-092Z__5c8c1d.json` |
| pass-3 | recall-heldout-08 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | yes | pass | 0 | yes | 30 | 300850 | $0.09473 | 117 s | 7 | 0 | — | 62/62 | `b2-super/pass-3/runs/recall-heldout-08__nemotron__2026-10-06T01-21-16-044Z__f750a1.json` |
| pass-4 | recall-heldout-01 | graph-off | no | RESOLVED | finish | yes | pass | 0 | yes | 19 | 120958 | $0.03813 | 75 s | 6 | 0 | — | 62/62 | `b2-super/pass-4/runs/recall-heldout-01__nemotron__2026-10-06T01-23-53-562Z__ba409a.json` |
| pass-4 | recall-heldout-01 | graph-on | no | RESOLVED | finish | yes | pass | 0 | yes | 21 | 191171 | $0.05983 | 88 s | 4 | 0 | 2794 | 62/62 | `b2-super/pass-4/runs/recall-heldout-01__nemotron__2026-10-06T01-25-09-254Z__bf7857.json` |
| pass-4 | recall-heldout-02 | graph-off | no | UNRESOLVED | finish | no | fail | 0 | yes | 25 | 225960 | $0.07265 | 127 s | 6 | 0 | — | 62/62 | `b2-super/pass-4/runs/recall-heldout-02__nemotron__2026-10-06T01-26-38-023Z__f87c0e.json` |
| pass-4 | recall-heldout-02 | graph-on | no | UNRESOLVED | budget: tokens 300000 | no | fail | 1 | yes | 25 | 318022 | $0.10282 | 156 s | 10 | 0 | 4137 | 62/62 | `b2-super/pass-4/runs/recall-heldout-02__nemotron__2026-10-06T01-28-45-653Z__cc2f28.json` |
| pass-4 | recall-heldout-03 | graph-off | no | RESOLVED | finish | yes | pass | 0 | yes | 12 | 60453 | $0.01897 | 62 s | 4 | 0 | — | 62/62 | `b2-super/pass-4/runs/recall-heldout-03__nemotron__2026-10-06T01-31-22-196Z__7c5351.json` |
| pass-4 | recall-heldout-03 | graph-on | no | RESOLVED | finish | yes | pass | 0 | yes | 15 | 97464 | $0.03062 | 72 s | 6 | 0 | 2714 | 62/62 | `b2-super/pass-4/runs/recall-heldout-03__nemotron__2026-10-06T01-32-24-269Z__058ed9.json` |
| pass-4 | recall-heldout-04 | graph-off | no | RESOLVED | finish | yes | pass | 0 | yes | 9 | 33128 | $0.01138 | 67 s | 4 | 0 | — | 62/62 | `b2-super/pass-4/runs/recall-heldout-04__nemotron__2026-10-06T01-33-36-560Z__eab0c4.json` |
| pass-4 | recall-heldout-04 | graph-on | no | RESOLVED | finish | yes | pass | 0 | yes | 25 | 153566 | $0.04915 | 97 s | 5 | 0 | 2593 | 62/62 | `b2-super/pass-4/runs/recall-heldout-04__nemotron__2026-10-06T01-34-44-279Z__28842f.json` |
| pass-4 | recall-heldout-05 | graph-off | no | RESOLVED | finish | yes | pass | 0 | yes | 14 | 59326 | $0.01900 | 71 s | 4 | 0 | — | 62/62 | `b2-super/pass-4/runs/recall-heldout-05__nemotron__2026-10-06T01-36-21-921Z__26a006.json` |
| pass-4 | recall-heldout-05 | graph-on | no | RESOLVED | finish | yes | pass | 0 | yes | 12 | 90657 | $0.02857 | 67 s | 2 | 0 | 6034 | 62/62 | `b2-super/pass-4/runs/recall-heldout-05__nemotron__2026-10-06T01-37-33-246Z__8269c8.json` |
| pass-4 | recall-heldout-06 | graph-off | no | RESOLVED | finish | yes | pass | 0 | yes | 16 | 101101 | $0.03313 | 95 s | 4 | 0 | — | 62/62 | `b2-super/pass-4/runs/recall-heldout-06__nemotron__2026-10-06T01-38-40-797Z__dadd4f.json` |
| pass-4 | recall-heldout-06 | graph-on | no | UNRESOLVED | error: The operation was aborted due to timeout | no | fail | 0 | yes | 8 | 45156 | $0.01460 | 116 s | 3 | 0 | 4417 | 62/62 | `b2-super/pass-4/runs/recall-heldout-06__nemotron__2026-10-06T01-40-15-613Z__085f19.json` |
| pass-4 | recall-heldout-07 | graph-off | no | FAILED | — | — | — | — | — | 0 | 0 | $0.00000 | 0 s | — | 0 | — | —/— | `b2-super/pass-4/runs/recall-heldout-07__nemotron__2026-10-06T01-42-11-988Z__e8df47.json` |
| pass-4 | recall-heldout-07 | graph-on | no | FAILED | — | — | — | — | — | 0 | 0 | $0.00000 | 0 s | — | 0 | — | —/— | `b2-super/pass-4/runs/recall-heldout-07__nemotron__2026-10-06T01-42-12-401Z__55cca5.json` |
| pass-4 | recall-heldout-08 | graph-off | no | FAILED | — | — | — | — | — | 0 | 0 | $0.00000 | 0 s | — | 0 | — | —/— | `b2-super/pass-4/runs/recall-heldout-08__nemotron__2026-10-06T01-42-12-793Z__8012aa.json` |
| pass-4 | recall-heldout-08 | graph-on | no | FAILED | — | — | — | — | — | 0 | 0 | $0.00000 | 0 s | — | 0 | — | —/— | `b2-super/pass-4/runs/recall-heldout-08__nemotron__2026-10-06T01-42-13-192Z__6d428f.json` |
| pass-4-replacement-1 | recall-heldout-01 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | yes | pass | 0 | yes | 35 | 304647 | $0.09538 | 127 s | 16 | 0 | — | 62/62 | `b2-super/pass-4-replacement-1/runs/recall-heldout-01__nemotron__2026-10-06T04-04-10-722Z__3e08c5.json` |
| pass-4-replacement-1 | recall-heldout-01 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 28 | 265676 | $0.08190 | 97 s | 16 | 0 | 2794 | 62/62 | `b2-super/pass-4-replacement-1/runs/recall-heldout-01__nemotron__2026-10-06T04-06-18-389Z__32a544.json` |
| pass-4-replacement-1 | recall-heldout-02 | graph-off | yes | UNRESOLVED | finish | no | fail | 0 | yes | 30 | 249595 | $0.07956 | 126 s | 13 | 0 | — | 62/62 | `b2-super/pass-4-replacement-1/runs/recall-heldout-02__nemotron__2026-10-06T04-07-56-129Z__0475de.json` |
| pass-4-replacement-1 | recall-heldout-02 | graph-on | yes | UNRESOLVED | finish | no | fail | 0 | yes | 23 | 205631 | $0.06959 | 153 s | never | 0 | 4137 | 62/62 | `b2-super/pass-4-replacement-1/runs/recall-heldout-02__nemotron__2026-10-06T04-10-02-306Z__9d6605.json` |
| pass-4-replacement-1 | recall-heldout-03 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 7 | 22832 | $0.00741 | 58 s | 4 | 0 | — | 62/62 | `b2-super/pass-4-replacement-1/runs/recall-heldout-03__nemotron__2026-10-06T04-12-35-776Z__978dd7.json` |
| pass-4-replacement-1 | recall-heldout-03 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 23 | 184679 | $0.05753 | 90 s | 6 | 0 | 2714 | 62/62 | `b2-super/pass-4-replacement-1/runs/recall-heldout-03__nemotron__2026-10-06T04-13-34-155Z__f072a0.json` |
| pass-4-replacement-1 | recall-heldout-04 | graph-off | yes | UNRESOLVED | finish | no | fail | 0 | yes | 9 | 30453 | $0.01023 | 68 s | 4 | 0 | — | 62/62 | `b2-super/pass-4-replacement-1/runs/recall-heldout-04__nemotron__2026-10-06T04-15-04-319Z__ce9a6b.json` |
| pass-4-replacement-1 | recall-heldout-04 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 8 | 34130 | $0.01161 | 67 s | 4 | 0 | 2593 | 62/62 | `b2-super/pass-4-replacement-1/runs/recall-heldout-04__nemotron__2026-10-06T04-16-12-350Z__40db35.json` |
| pass-4-replacement-1 | recall-heldout-05 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 13 | 48261 | $0.01554 | 70 s | 6 | 0 | — | 62/62 | `b2-super/pass-4-replacement-1/runs/recall-heldout-05__nemotron__2026-10-06T04-17-20-108Z__b37eb1.json` |
| pass-4-replacement-1 | recall-heldout-05 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 16 | 130056 | $0.04096 | 79 s | 2 | 0 | 6034 | 62/62 | `b2-super/pass-4-replacement-1/runs/recall-heldout-05__nemotron__2026-10-06T04-18-30-200Z__5d9bdc.json` |
| pass-4-replacement-1 | recall-heldout-06 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | yes | pass | 0 | yes | 29 | 303385 | $0.10022 | 197 s | 4 | 0 | — | 62/62 | `b2-super/pass-4-replacement-1/runs/recall-heldout-06__nemotron__2026-10-06T04-19-49-780Z__b0d6ec.json` |
| pass-4-replacement-1 | recall-heldout-06 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 18 | 155834 | $0.05090 | 114 s | 3 | 0 | 4417 | 62/62 | `b2-super/pass-4-replacement-1/runs/recall-heldout-06__nemotron__2026-10-06T04-23-06-906Z__63e2ac.json` |
| pass-4-replacement-1 | recall-heldout-07 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 21 | 164753 | $0.05426 | 111 s | 4 | 0 | — | 62/62 | `b2-super/pass-4-replacement-1/runs/recall-heldout-07__nemotron__2026-10-06T04-25-01-609Z__48aa59.json` |
| pass-4-replacement-1 | recall-heldout-07 | graph-on | yes | UNRESOLVED | stopped: stuck | no | fail | 0 | yes | 24 | 225808 | $0.07621 | 144 s | 3 | 0 | 3554 | 62/62 | `b2-super/pass-4-replacement-1/runs/recall-heldout-07__nemotron__2026-10-06T04-26-53-035Z__23798d.json` |
| pass-4-replacement-1 | recall-heldout-08 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 29 | 285164 | $0.08938 | 115 s | 7 | 0 | — | 62/62 | `b2-super/pass-4-replacement-1/runs/recall-heldout-08__nemotron__2026-10-06T04-29-17-292Z__ec8ddd.json` |
| pass-4-replacement-1 | recall-heldout-08 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | pass | 1 | yes | 26 | 317713 | $0.10308 | 152 s | 3 | 0 | 2051 | 62/62 | `b2-super/pass-4-replacement-1/runs/recall-heldout-08__nemotron__2026-10-06T04-31-12-577Z__8e5504.json` |
| pass-5 | recall-heldout-01 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | yes | pass | 0 | yes | 29 | 317491 | $0.09822 | 110 s | 7 | 0 | 2794 | 62/62 | `b2-super/pass-5/runs/recall-heldout-01__nemotron__2026-10-06T04-34-32-927Z__75944e.json` |
| pass-5 | recall-heldout-01 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | yes | pass | 0 | yes | 39 | 310096 | $0.09625 | 93 s | 4 | 0 | — | 62/62 | `b2-super/pass-5/runs/recall-heldout-01__nemotron__2026-10-06T04-36-23-520Z__9c6f8f.json` |
| pass-5 | recall-heldout-02 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 25 | 300704 | $0.09722 | 129 s | 13 | 0 | 4137 | 62/62 | `b2-super/pass-5/runs/recall-heldout-02__nemotron__2026-10-06T04-37-57-257Z__f8efe1.json` |
| pass-5 | recall-heldout-02 | graph-off | yes | UNRESOLVED | finish | no | fail | 0 | yes | 20 | 141283 | $0.04709 | 104 s | 7 | 0 | — | 62/62 | `b2-super/pass-5/runs/recall-heldout-02__nemotron__2026-10-06T04-40-07-051Z__46cb15.json` |
| pass-5 | recall-heldout-03 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 26 | 232812 | $0.07288 | 92 s | 6 | 0 | 2714 | 62/62 | `b2-super/pass-5/runs/recall-heldout-03__nemotron__2026-10-06T04-41-51-410Z__69e49c.json` |
| pass-5 | recall-heldout-03 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 14 | 66023 | $0.02101 | 70 s | 4 | 0 | — | 62/62 | `b2-super/pass-5/runs/recall-heldout-03__nemotron__2026-10-06T04-43-23-562Z__5f9fec.json` |
| pass-5 | recall-heldout-04 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 11 | 55760 | $0.01870 | 84 s | 5 | 0 | 2593 | 62/62 | `b2-super/pass-5/runs/recall-heldout-04__nemotron__2026-10-06T04-44-33-743Z__6b7a2b.json` |
| pass-5 | recall-heldout-04 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 5 | no | 35 | 304209 | $0.10167 | 165 s | 3 | 0 | — | 62/62 | `b2-super/pass-5/runs/recall-heldout-04__nemotron__2026-10-06T04-45-57-721Z__16fb12.json` |
| pass-5 | recall-heldout-05 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 20 | 169749 | $0.05388 | 91 s | 2 | 0 | 6034 | 62/62 | `b2-super/pass-5/runs/recall-heldout-05__nemotron__2026-10-06T04-48-42-590Z__552fb8.json` |
| pass-5 | recall-heldout-05 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 10 | 34621 | $0.01105 | 66 s | 4 | 0 | — | 62/62 | `b2-super/pass-5/runs/recall-heldout-05__nemotron__2026-10-06T04-50-14-156Z__5b5b49.json` |
| pass-5 | recall-heldout-06 | graph-on | no | UNRESOLVED | error: The operation was aborted due to timeout | no | fail | 0 | yes | 1 | 3833 | $0.00119 | 106 s | never | 0 | 4417 | 62/62 | `b2-super/pass-5/runs/recall-heldout-06__nemotron__2026-10-06T04-51-20-951Z__2b8279.json` |
| pass-5 | recall-heldout-06 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 12 | 59528 | $0.01936 | 113 s | 4 | 0 | — | 62/62 | `b2-super/pass-5/runs/recall-heldout-06__nemotron__2026-10-06T04-53-06-921Z__de4ca2.json` |
| pass-5 | recall-heldout-07 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 19 | 196650 | $0.06766 | 147 s | 2 | 0 | 3554 | 62/62 | `b2-super/pass-5/runs/recall-heldout-07__nemotron__2026-10-06T04-55-00-339Z__e3f135.json` |
| pass-5 | recall-heldout-07 | graph-off | yes | UNRESOLVED | finish | no | pass | 0 | no | 19 | 120724 | $0.04063 | 110 s | 4 | 0 | — | 62/62 | `b2-super/pass-5/runs/recall-heldout-07__nemotron__2026-10-06T04-57-27-967Z__470883.json` |
| pass-5 | recall-heldout-08 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | pass | 2 | yes | 26 | 316571 | $0.10507 | 189 s | 4 | 0 | 2051 | 62/62 | `b2-super/pass-5/runs/recall-heldout-08__nemotron__2026-10-06T04-59-17-923Z__95d289.json` |
| pass-5 | recall-heldout-08 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 24 | 174169 | $0.05549 | 102 s | 7 | 0 | — | 62/62 | `b2-super/pass-5/runs/recall-heldout-08__nemotron__2026-10-06T05-02-27-699Z__1dcaf1.json` |
| rerun-pass-5-06-on | recall-heldout-06 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 14 | 112064 | $0.03608 | 90 s | 3 | 0 | 4417 | 62/62 | `b2-super/rerun-pass-5-06-on/runs/recall-heldout-06__nemotron__2026-10-06T05-05-08-606Z__a7c4fa.json` |
