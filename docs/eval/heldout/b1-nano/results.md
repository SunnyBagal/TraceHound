# Held-out evaluation, b1-nano: nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B (default)

Generated 2026-10-06T00:00:10.765Z. Frozen code `eval-freeze-2 (b5cafde03e2ff377277333871eef19f264d5c0b5), image sha256:857f16d26f2573f1a42e90e35242f773ddb82caa4802aa5d93bbcfedd7d77eed`. Protocol: docs/eval/protocol.md with Amendment 1, commit 1ec1fcea2d146ccea3ba120d413942a5aeb06dd0 (2026-10-05 20:00:59 +0530) on origin/docs/protocol-amendment-1 (tip 4b8079f, same time, adds decision 049 only). Cost limit per run $0.1.

Counted runs: valid passes without their void runs, plus the re-runs of void runs. Every figure has its n. No significance test was run and none is implied. Not pooled with dev results.

## Per arm

| Arm | n | Resolved | Verified at stop | End reasons | Steps (mean) | Tokens (mean) | Cost (mean) | Wall time (mean) | First fault-file read (mean step) | Graph tool calls | Packet injected (mean chars) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| graph-on | 40 | 11 of 40 | 11 of 40 | budget: tokens 300000 25; finish 13; budget: steps 40 1; stopped: stuck 1 (n = 40) | 27.3 (n = 40) | 251886 (n = 40) | $0.01950 (n = 40) | 328 s (n = 40) | 7.9 (n = 36); never read 4 of 40 | 0 total, in 0 of 40 runs | 40 of 40; 3537 chars (min 2051, max 6034; n = 40) |
| graph-off | 40 | 13 of 40 | 19 of 40 | budget: tokens 300000 23; finish 15; stopped: stuck 2 (n = 40) | 28.6 (n = 40) | 238370 (n = 40) | $0.02025 (n = 40) | 431 s (n = 40) | 7.6 (n = 39); never read 1 of 40 | 0 total, in 0 of 40 runs | 0 of 40 |

## cross-component (4 tasks)

| Arm | n | Resolved | Verified at stop | End reasons | Steps (mean) | Tokens (mean) | Cost (mean) | Wall time (mean) | First fault-file read (mean step) | Graph tool calls | Packet injected (mean chars) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| graph-on | 20 | 6 of 20 | 6 of 20 | budget: tokens 300000 11; finish 7; budget: steps 40 1; stopped: stuck 1 (n = 20) | 27.4 (n = 20) | 233840 (n = 20) | $0.01711 (n = 20) | 266 s (n = 20) | 11.3 (n = 16); never read 4 of 20 | 0 total, in 0 of 20 runs | 20 of 20; 3060 chars (min 2593, max 4137; n = 20) |
| graph-off | 20 | 5 of 20 | 10 of 20 | budget: tokens 300000 12; finish 6; stopped: stuck 2 (n = 20) | 28.7 (n = 20) | 238423 (n = 20) | $0.01922 (n = 20) | 376 s (n = 20) | 9.3 (n = 19); never read 1 of 20 | 0 total, in 0 of 20 runs | 0 of 20 |

## same-component (4 tasks)

| Arm | n | Resolved | Verified at stop | End reasons | Steps (mean) | Tokens (mean) | Cost (mean) | Wall time (mean) | First fault-file read (mean step) | Graph tool calls | Packet injected (mean chars) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| graph-on | 20 | 5 of 20 | 5 of 20 | budget: tokens 300000 14; finish 6 (n = 20) | 27.2 (n = 20) | 269932 (n = 20) | $0.02188 (n = 20) | 391 s (n = 20) | 5.3 (n = 20); never read 0 of 20 | 0 total, in 0 of 20 runs | 20 of 20; 4014 chars (min 2051, max 6034; n = 20) |
| graph-off | 20 | 8 of 20 | 9 of 20 | budget: tokens 300000 11; finish 9 (n = 20) | 28.4 (n = 20) | 238317 (n = 20) | $0.02128 (n = 20) | 486 s (n = 20) | 6.0 (n = 20); never read 0 of 20 | 0 total, in 0 of 20 runs | 0 of 20 |

## Per task: resolved out of n (verified at stop out of n)

| Task | Group | graph-on resolved | graph-on verified at stop | graph-off resolved | graph-off verified at stop |
|---|---|---|---|---|---|
| recall-heldout-01 | cross-component | 0 of 5 | 0 of 5 | 0 of 5 | 1 of 5 |
| recall-heldout-02 | cross-component | 0 of 5 | 0 of 5 | 0 of 5 | 0 of 5 |
| recall-heldout-03 | cross-component | 2 of 5 | 2 of 5 | 1 of 5 | 4 of 5 |
| recall-heldout-04 | cross-component | 4 of 5 | 4 of 5 | 4 of 5 | 5 of 5 |
| recall-heldout-05 | same-component | 5 of 5 | 5 of 5 | 5 of 5 | 5 of 5 |
| recall-heldout-06 | same-component | 0 of 5 | 0 of 5 | 0 of 5 | 0 of 5 |
| recall-heldout-07 | same-component | 0 of 5 | 0 of 5 | 1 of 5 | 1 of 5 |
| recall-heldout-08 | same-component | 0 of 5 | 0 of 5 | 2 of 5 | 3 of 5 |

## Other counts per arm

| Arm | n | Failed edits (total) | Unknown-tool calls (total) | Cost (total) |
|---|---|---|---|---|
| graph-on | 40 | 4 | 42 | $0.77990 |
| graph-off | 40 | 4 | 26 | $0.80995 |

## Passes

| Pass | Arm order | Status | Reason |
|---|---|---|---|
| pass-1 | on,off | valid | canary-1-after-pass-1 RESOLVED; no FAILED/error runs; baselines 62/62 |
| pass-2 | off,on | valid | canary-after-pass-2 RESOLVED; 2 void runs (model request timeout); baselines 62/62 |
| pass-3 | on,off | valid | canary-after-pass-3 RESOLVED; 2 void runs (model request timeout); baselines 62/62 |
| pass-4 | off,on | valid | canary-after-pass-4 RESOLVED; no void runs; baselines 62/62 |
| pass-5 | on,off | valid | canary-after-pass-5 RESOLVED; no void runs; baselines 62/62 |

## Canaries (oracle patch, recall-heldout-01, no model)

| Canary | State |
|---|---|
| canary-0-before | RESOLVED |
| canary-1-after-pass-1 | RESOLVED |
| canary-after-pass-2 | RESOLVED |
| canary-after-pass-3 | RESOLVED |
| canary-after-pass-4 | RESOLVED |
| canary-after-pass-5 | RESOLVED |
| canary-after-reruns | RESOLVED |

## Void runs

| Pass | Task | Arm | Reason | Re-run |
|---|---|---|---|---|
| pass-2 | recall-heldout-01 | graph-off | infrastructure: model request timeout ("The operation was aborted due to timeout", 60 s client timeout) at step 26; recorded verdict UNRESOLVED | rerun-pass-2-01-off |
| pass-2 | recall-heldout-04 | graph-on | infrastructure: model request timeout ("The operation was aborted due to timeout", 60 s client timeout) at step 13; recorded verdict RESOLVED | rerun-pass-2-04-on |
| pass-3 | recall-heldout-08 | graph-on | infrastructure: model request timeout ("The operation was aborted due to timeout", 60 s client timeout); recorded verdict UNRESOLVED | rerun-pass-3-08-on |
| pass-3 | recall-heldout-08 | graph-off | infrastructure: model request timeout ("The operation was aborted due to timeout", 60 s client timeout); recorded verdict UNRESOLVED | rerun-pass-3-08-off |

Baseline anomaly (runner flag per pass, or the same function over the whole batch): none.

## Every run

| Pass | Task | Arm | Counted | State | End | Verified at stop | Repro | Regressed | Typecheck = baseline | Steps | Tokens | Cost | Wall | Fault read step | Graph calls | Packet chars | Baseline | Record |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pass-1 | recall-heldout-01 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 35 | 316653 | $0.02371 | 396 s | 9 | 0 | 2794 | 62/62 | `b1-nano/pass-1/runs/recall-heldout-01__nemotron__2026-10-05T15-05-15-726Z__f6c65b.json` |
| pass-1 | recall-heldout-01 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 27 | 301308 | $0.02520 | 533 s | 8 | 0 | — | 62/62 | `b1-nano/pass-1/runs/recall-heldout-01__nemotron__2026-10-05T15-11-51-985Z__b3aea1.json` |
| pass-1 | recall-heldout-02 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 27 | 300068 | $0.02333 | 406 s | never | 0 | 4137 | 62/62 | `b1-nano/pass-1/runs/recall-heldout-02__nemotron__2026-10-05T15-20-45-455Z__06ba08.json` |
| pass-1 | recall-heldout-02 | graph-off | yes | UNRESOLVED | finish | no | fail | 0 | yes | 33 | 289928 | $0.02483 | 613 s | 20 | 0 | — | 62/62 | `b1-nano/pass-1/runs/recall-heldout-02__nemotron__2026-10-05T15-27-31-537Z__bf63f4.json` |
| pass-1 | recall-heldout-03 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 29 | 179584 | $0.01330 | 231 s | 10 | 0 | 2714 | 62/62 | `b1-nano/pass-1/runs/recall-heldout-03__nemotron__2026-10-05T15-37-44-680Z__a1426b.json` |
| pass-1 | recall-heldout-03 | graph-off | yes | UNRESOLVED | stopped: stuck | no | fail | 0 | yes | 13 | 51566 | $0.00414 | 107 s | 4 | 0 | — | 62/62 | `b1-nano/pass-1/runs/recall-heldout-03__nemotron__2026-10-05T15-41-35-891Z__f09e0b.json` |
| pass-1 | recall-heldout-04 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 7 | 34750 | $0.00312 | 113 s | 3 | 0 | 2593 | 62/62 | `b1-nano/pass-1/runs/recall-heldout-04__nemotron__2026-10-05T15-43-23-554Z__802fae.json` |
| pass-1 | recall-heldout-04 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 12 | 59087 | $0.00529 | 141 s | 5 | 0 | — | 62/62 | `b1-nano/pass-1/runs/recall-heldout-04__nemotron__2026-10-05T15-45-16-621Z__4319c5.json` |
| pass-1 | recall-heldout-05 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 21 | 163029 | $0.01208 | 191 s | 5 | 0 | 6034 | 62/62 | `b1-nano/pass-1/runs/recall-heldout-05__nemotron__2026-10-05T15-47-37-642Z__ef2565.json` |
| pass-1 | recall-heldout-05 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 18 | 93508 | $0.00770 | 185 s | 4 | 0 | — | 62/62 | `b1-nano/pass-1/runs/recall-heldout-05__nemotron__2026-10-05T15-50-49-073Z__0415a9.json` |
| pass-1 | recall-heldout-06 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 4 | no | 27 | 301429 | $0.02487 | 557 s | 4 | 0 | 4417 | 62/62 | `b1-nano/pass-1/runs/recall-heldout-06__nemotron__2026-10-05T15-53-54-385Z__76bfe8.json` |
| pass-1 | recall-heldout-06 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 30 | 309260 | $0.03021 | 857 s | 4 | 0 | — | 62/62 | `b1-nano/pass-1/runs/recall-heldout-06__nemotron__2026-10-05T16-03-11-875Z__66e85a.json` |
| pass-1 | recall-heldout-07 | graph-on | yes | UNRESOLVED | finish | no | fail | 0 | yes | 26 | 224234 | $0.01562 | 245 s | 4 | 0 | 3554 | 62/62 | `b1-nano/pass-1/runs/recall-heldout-07__nemotron__2026-10-05T16-17-29-681Z__df221b.json` |
| pass-1 | recall-heldout-07 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 32 | 301503 | $0.03114 | 878 s | 4 | 0 | — | 62/62 | `b1-nano/pass-1/runs/recall-heldout-07__nemotron__2026-10-05T16-21-34-508Z__f4e174.json` |
| pass-1 | recall-heldout-08 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 30 | 313035 | $0.02409 | 382 s | 7 | 0 | 2051 | 62/62 | `b1-nano/pass-1/runs/recall-heldout-08__nemotron__2026-10-05T16-36-12-384Z__a735e0.json` |
| pass-1 | recall-heldout-08 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 33 | 307994 | $0.02622 | 658 s | 9 | 0 | — | 62/62 | `b1-nano/pass-1/runs/recall-heldout-08__nemotron__2026-10-05T16-42-34-557Z__a1b4ae.json` |
| pass-2 | recall-heldout-01 | graph-off | no | UNRESOLVED | error: The operation was aborted due to timeout | no | fail | 0 | yes | 26 | 256578 | $0.02118 | 442 s | 9 | 0 | — | 62/62 | `b1-nano/pass-2/runs/recall-heldout-01__nemotron__2026-10-05T16-54-49-468Z__0ec04d.json` |
| pass-2 | recall-heldout-01 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 40 | 312032 | $0.02172 | 288 s | 12 | 0 | 2794 | 62/62 | `b1-nano/pass-2/runs/recall-heldout-01__nemotron__2026-10-05T17-02-12-071Z__c46826.json` |
| pass-2 | recall-heldout-02 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 32 | 303717 | $0.02251 | 373 s | never | 0 | — | 62/62 | `b1-nano/pass-2/runs/recall-heldout-02__nemotron__2026-10-05T17-06-59-895Z__df732b.json` |
| pass-2 | recall-heldout-02 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 33 | 309933 | $0.02207 | 324 s | never | 0 | 4137 | 62/62 | `b1-nano/pass-2/runs/recall-heldout-02__nemotron__2026-10-05T17-13-13-347Z__64062f.json` |
| pass-2 | recall-heldout-03 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | yes | pass | 0 | yes | 40 | 300607 | $0.02175 | 371 s | 5 | 0 | — | 62/62 | `b1-nano/pass-2/runs/recall-heldout-03__nemotron__2026-10-05T17-18-37-180Z__6eb196.json` |
| pass-2 | recall-heldout-03 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 32 | 251418 | $0.01758 | 317 s | 24 | 0 | 2714 | 62/62 | `b1-nano/pass-2/runs/recall-heldout-03__nemotron__2026-10-05T17-24-48-359Z__fc8648.json` |
| pass-2 | recall-heldout-04 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 19 | 86838 | $0.00795 | 256 s | 4 | 0 | — | 62/62 | `b1-nano/pass-2/runs/recall-heldout-04__nemotron__2026-10-05T17-30-06-040Z__155511.json` |
| pass-2 | recall-heldout-04 | graph-on | no | RESOLVED | error: The operation was aborted due to timeout | yes | pass | 0 | yes | 13 | 64185 | $0.00583 | 285 s | 6 | 0 | 2593 | 62/62 | `b1-nano/pass-2/runs/recall-heldout-04__nemotron__2026-10-05T17-34-22-785Z__8d0965.json` |
| pass-2 | recall-heldout-05 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 23 | 131252 | $0.00976 | 193 s | 5 | 0 | — | 62/62 | `b1-nano/pass-2/runs/recall-heldout-05__nemotron__2026-10-05T17-39-08-459Z__82cd6b.json` |
| pass-2 | recall-heldout-05 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 22 | 191208 | $0.01386 | 213 s | 3 | 0 | 6034 | 62/62 | `b1-nano/pass-2/runs/recall-heldout-05__nemotron__2026-10-05T17-42-22-049Z__caebd4.json` |
| pass-2 | recall-heldout-06 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 31 | 306755 | $0.02566 | 481 s | 4 | 0 | — | 62/62 | `b1-nano/pass-2/runs/recall-heldout-06__nemotron__2026-10-05T17-45-55-726Z__05c9cd.json` |
| pass-2 | recall-heldout-06 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 31 | 302203 | $0.02871 | 615 s | 6 | 0 | 4417 | 62/62 | `b1-nano/pass-2/runs/recall-heldout-06__nemotron__2026-10-05T17-53-56-625Z__40548a.json` |
| pass-2 | recall-heldout-07 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 26 | 198307 | $0.01992 | 504 s | 6 | 0 | — | 62/62 | `b1-nano/pass-2/runs/recall-heldout-07__nemotron__2026-10-05T18-04-12-332Z__71bab5.json` |
| pass-2 | recall-heldout-07 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 38 | 309910 | $0.02447 | 405 s | 7 | 0 | 3554 | 62/62 | `b1-nano/pass-2/runs/recall-heldout-07__nemotron__2026-10-05T18-12-37-091Z__cab047.json` |
| pass-2 | recall-heldout-08 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 19 | 144250 | $0.01099 | 187 s | 7 | 0 | — | 62/62 | `b1-nano/pass-2/runs/recall-heldout-08__nemotron__2026-10-05T18-19-22-586Z__9b1fa7.json` |
| pass-2 | recall-heldout-08 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 28 | 307491 | $0.02543 | 456 s | 11 | 0 | 2051 | 62/62 | `b1-nano/pass-2/runs/recall-heldout-08__nemotron__2026-10-05T18-22-29-412Z__55d1e7.json` |
| pass-3 | recall-heldout-01 | graph-on | yes | UNRESOLVED | budget: steps 40 | no | fail | 0 | yes | 40 | 299729 | $0.02110 | 279 s | 6 | 0 | 2794 | 62/62 | `b1-nano/pass-3/runs/recall-heldout-01__nemotron__2026-10-05T18-32-21-869Z__ca8702.json` |
| pass-3 | recall-heldout-01 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 34 | 307288 | $0.02437 | 459 s | 4 | 0 | — | 62/62 | `b1-nano/pass-3/runs/recall-heldout-01__nemotron__2026-10-05T18-37-00-803Z__9af9fe.json` |
| pass-3 | recall-heldout-02 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 28 | 305518 | $0.02172 | 318 s | never | 0 | 4137 | 62/62 | `b1-nano/pass-3/runs/recall-heldout-02__nemotron__2026-10-05T18-44-40-466Z__a11542.json` |
| pass-3 | recall-heldout-02 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 32 | 306052 | $0.02268 | 370 s | 28 | 0 | — | 62/62 | `b1-nano/pass-3/runs/recall-heldout-02__nemotron__2026-10-05T18-49-58-324Z__94179c.json` |
| pass-3 | recall-heldout-03 | graph-on | yes | UNRESOLVED | stopped: stuck | no | fail | 0 | yes | 22 | 139623 | $0.01042 | 205 s | 12 | 0 | 2714 | 62/62 | `b1-nano/pass-3/runs/recall-heldout-03__nemotron__2026-10-05T18-56-08-414Z__3f84e9.json` |
| pass-3 | recall-heldout-03 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 24 | 119785 | $0.00934 | 233 s | 7 | 0 | — | 62/62 | `b1-nano/pass-3/runs/recall-heldout-03__nemotron__2026-10-05T18-59-33-783Z__eb38a0.json` |
| pass-3 | recall-heldout-04 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 15 | 86675 | $0.00793 | 241 s | 5 | 0 | 2593 | 62/62 | `b1-nano/pass-3/runs/recall-heldout-04__nemotron__2026-10-05T19-03-26-865Z__76697f.json` |
| pass-3 | recall-heldout-04 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | yes | pass | 0 | yes | 27 | 315365 | $0.02739 | 578 s | 3 | 0 | — | 62/62 | `b1-nano/pass-3/runs/recall-heldout-04__nemotron__2026-10-05T19-07-28-133Z__f544e9.json` |
| pass-3 | recall-heldout-05 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 20 | 181305 | $0.01360 | 253 s | 2 | 0 | 6034 | 62/62 | `b1-nano/pass-3/runs/recall-heldout-05__nemotron__2026-10-05T19-17-06-921Z__0274a1.json` |
| pass-3 | recall-heldout-05 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 29 | 160104 | $0.01376 | 356 s | 6 | 0 | — | 62/62 | `b1-nano/pass-3/runs/recall-heldout-05__nemotron__2026-10-05T19-21-20-560Z__ca7dcd.json` |
| pass-3 | recall-heldout-06 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 4 | no | 29 | 305372 | $0.02700 | 619 s | 5 | 0 | 4417 | 62/62 | `b1-nano/pass-3/runs/recall-heldout-06__nemotron__2026-10-05T19-27-17-270Z__1651b7.json` |
| pass-3 | recall-heldout-06 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 4 | no | 29 | 304307 | $0.02633 | 599 s | 3 | 0 | — | 62/62 | `b1-nano/pass-3/runs/recall-heldout-06__nemotron__2026-10-05T19-37-36-943Z__b21f86.json` |
| pass-3 | recall-heldout-07 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 29 | 305760 | $0.03026 | 703 s | 3 | 0 | 3554 | 62/62 | `b1-nano/pass-3/runs/recall-heldout-07__nemotron__2026-10-05T19-47-35-917Z__a386d2.json` |
| pass-3 | recall-heldout-07 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 36 | 305702 | $0.03148 | 914 s | 4 | 0 | — | 62/62 | `b1-nano/pass-3/runs/recall-heldout-07__nemotron__2026-10-05T19-59-18-899Z__f172c0.json` |
| pass-3 | recall-heldout-08 | graph-on | no | UNRESOLVED | error: The operation was aborted due to timeout | no | fail | 0 | yes | 13 | 92351 | $0.00742 | 239 s | 6 | 0 | 2051 | 62/62 | `b1-nano/pass-3/runs/recall-heldout-08__nemotron__2026-10-05T20-14-33-384Z__cd3cd3.json` |
| pass-3 | recall-heldout-08 | graph-off | no | UNRESOLVED | error: The operation was aborted due to timeout | no | fail | 0 | yes | 25 | 153645 | $0.01171 | 319 s | 15 | 0 | — | 62/62 | `b1-nano/pass-3/runs/recall-heldout-08__nemotron__2026-10-05T20-18-32-858Z__d0e14a.json` |
| pass-4 | recall-heldout-01 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 31 | 307329 | $0.02353 | 380 s | 6 | 0 | — | 62/62 | `b1-nano/pass-4/runs/recall-heldout-01__nemotron__2026-10-05T20-24-38-913Z__96c52e.json` |
| pass-4 | recall-heldout-01 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 40 | 302399 | $0.02204 | 274 s | 9 | 0 | 2794 | 62/62 | `b1-nano/pass-4/runs/recall-heldout-01__nemotron__2026-10-05T20-30-59-513Z__3ac4cf.json` |
| pass-4 | recall-heldout-02 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 35 | 305574 | $0.02852 | 691 s | 25 | 0 | — | 62/62 | `b1-nano/pass-4/runs/recall-heldout-02__nemotron__2026-10-05T20-35-33-617Z__505931.json` |
| pass-4 | recall-heldout-02 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 24 | 302205 | $0.02123 | 258 s | 15 | 0 | 4137 | 62/62 | `b1-nano/pass-4/runs/recall-heldout-02__nemotron__2026-10-05T20-47-04-794Z__81f1be.json` |
| pass-4 | recall-heldout-03 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | yes | pass | 0 | yes | 40 | 307862 | $0.02424 | 472 s | 9 | 0 | — | 62/62 | `b1-nano/pass-4/runs/recall-heldout-03__nemotron__2026-10-05T20-51-23-504Z__a0c798.json` |
| pass-4 | recall-heldout-03 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 32 | 309796 | $0.02084 | 222 s | never | 0 | 2714 | 62/62 | `b1-nano/pass-4/runs/recall-heldout-03__nemotron__2026-10-05T20-59-16-171Z__4af447.json` |
| pass-4 | recall-heldout-04 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 23 | 127483 | $0.01339 | 397 s | 5 | 0 | — | 62/62 | `b1-nano/pass-4/runs/recall-heldout-04__nemotron__2026-10-05T21-02-58-744Z__18b341.json` |
| pass-4 | recall-heldout-04 | graph-on | yes | UNRESOLVED | finish | no | fail | 0 | yes | 24 | 135510 | $0.01283 | 354 s | 13 | 0 | 2593 | 62/62 | `b1-nano/pass-4/runs/recall-heldout-04__nemotron__2026-10-05T21-09-35-547Z__1b6b1d.json` |
| pass-4 | recall-heldout-05 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 20 | 96547 | $0.00752 | 195 s | 4 | 0 | — | 62/62 | `b1-nano/pass-4/runs/recall-heldout-05__nemotron__2026-10-05T21-15-30-181Z__2cdbd8.json` |
| pass-4 | recall-heldout-05 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 19 | 157407 | $0.01164 | 224 s | 6 | 0 | 6034 | 62/62 | `b1-nano/pass-4/runs/recall-heldout-05__nemotron__2026-10-05T21-18-45-441Z__a288f0.json` |
| pass-4 | recall-heldout-06 | graph-off | yes | UNRESOLVED | finish | no | fail | 0 | yes | 24 | 218436 | $0.01820 | 399 s | 4 | 0 | — | 62/62 | `b1-nano/pass-4/runs/recall-heldout-06__nemotron__2026-10-05T21-22-29-600Z__aedc81.json` |
| pass-4 | recall-heldout-06 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 26 | 317315 | $0.02752 | 551 s | 3 | 0 | 4417 | 62/62 | `b1-nano/pass-4/runs/recall-heldout-06__nemotron__2026-10-05T21-29-09-298Z__90b686.json` |
| pass-4 | recall-heldout-07 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 31 | 300648 | $0.03424 | 905 s | 4 | 0 | — | 62/62 | `b1-nano/pass-4/runs/recall-heldout-07__nemotron__2026-10-05T21-38-20-237Z__e321d1.json` |
| pass-4 | recall-heldout-07 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 38 | 306329 | $0.02496 | 341 s | 7 | 0 | 3554 | 62/62 | `b1-nano/pass-4/runs/recall-heldout-07__nemotron__2026-10-05T21-53-25-449Z__3e14b8.json` |
| pass-4 | recall-heldout-08 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | yes | pass | 0 | yes | 35 | 310122 | $0.02529 | 487 s | 9 | 0 | — | 62/62 | `b1-nano/pass-4/runs/recall-heldout-08__nemotron__2026-10-05T21-59-07-031Z__898285.json` |
| pass-4 | recall-heldout-08 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 29 | 307165 | $0.02434 | 419 s | 4 | 0 | 2051 | 62/62 | `b1-nano/pass-4/runs/recall-heldout-08__nemotron__2026-10-05T22-07-13-991Z__8ee1c9.json` |
| pass-5 | recall-heldout-01 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 38 | 313085 | $0.02357 | 350 s | 11 | 0 | 2794 | 62/62 | `b1-nano/pass-5/runs/recall-heldout-01__nemotron__2026-10-05T22-14-53-192Z__c04417.json` |
| pass-5 | recall-heldout-01 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 31 | 305178 | $0.02312 | 332 s | 12 | 0 | — | 62/62 | `b1-nano/pass-5/runs/recall-heldout-01__nemotron__2026-10-05T22-20-43-198Z__96caf7.json` |
| pass-5 | recall-heldout-02 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 24 | 305806 | $0.02204 | 267 s | 20 | 0 | 4137 | 62/62 | `b1-nano/pass-5/runs/recall-heldout-02__nemotron__2026-10-05T22-26-15-871Z__fb065d.json` |
| pass-5 | recall-heldout-02 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 31 | 304118 | $0.02521 | 383 s | 14 | 0 | — | 62/62 | `b1-nano/pass-5/runs/recall-heldout-02__nemotron__2026-10-05T22-30-43-174Z__f155c7.json` |
| pass-5 | recall-heldout-03 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 31 | 301358 | $0.02124 | 228 s | 18 | 0 | 2714 | 62/62 | `b1-nano/pass-5/runs/recall-heldout-03__nemotron__2026-10-05T22-37-06-825Z__d57138.json` |
| pass-5 | recall-heldout-03 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | yes | pass | 0 | yes | 37 | 315292 | $0.02222 | 270 s | 10 | 0 | — | 62/62 | `b1-nano/pass-5/runs/recall-heldout-03__nemotron__2026-10-05T22-40-55-170Z__637e17.json` |
| pass-5 | recall-heldout-04 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 18 | 122657 | $0.00891 | 146 s | 9 | 0 | 2593 | 62/62 | `b1-nano/pass-5/runs/recall-heldout-04__nemotron__2026-10-05T22-45-25-720Z__ba2018.json` |
| pass-5 | recall-heldout-04 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 20 | 155136 | $0.01446 | 347 s | 3 | 0 | — | 62/62 | `b1-nano/pass-5/runs/recall-heldout-04__nemotron__2026-10-05T22-47-52-364Z__5d6cd2.json` |
| pass-5 | recall-heldout-05 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 17 | 155310 | $0.01107 | 164 s | 3 | 0 | 6034 | 62/62 | `b1-nano/pass-5/runs/recall-heldout-05__nemotron__2026-10-05T22-53-39-366Z__fe3fac.json` |
| pass-5 | recall-heldout-05 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 25 | 134470 | $0.01046 | 213 s | 4 | 0 | — | 62/62 | `b1-nano/pass-5/runs/recall-heldout-05__nemotron__2026-10-05T22-56-23-690Z__0dfa1b.json` |
| pass-5 | recall-heldout-06 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 29 | 317070 | $0.02376 | 330 s | 5 | 0 | 4417 | 62/62 | `b1-nano/pass-5/runs/recall-heldout-06__nemotron__2026-10-05T22-59-56-779Z__162d11.json` |
| pass-5 | recall-heldout-06 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 34 | 302821 | $0.02390 | 378 s | 5 | 0 | — | 62/62 | `b1-nano/pass-5/runs/recall-heldout-06__nemotron__2026-10-05T23-05-26-794Z__5e41e2.json` |
| pass-5 | recall-heldout-07 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 31 | 313532 | $0.02177 | 230 s | 5 | 0 | 3554 | 62/62 | `b1-nano/pass-5/runs/recall-heldout-07__nemotron__2026-10-05T23-11-44-926Z__08afae.json` |
| pass-5 | recall-heldout-07 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 30 | 308525 | $0.03283 | 752 s | 4 | 0 | — | 62/62 | `b1-nano/pass-5/runs/recall-heldout-07__nemotron__2026-10-05T23-15-35-162Z__4a0bed.json` |
| pass-5 | recall-heldout-08 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 27 | 316261 | $0.02661 | 459 s | 8 | 0 | 2051 | 62/62 | `b1-nano/pass-5/runs/recall-heldout-08__nemotron__2026-10-05T23-28-07-036Z__be9809.json` |
| pass-5 | recall-heldout-08 | graph-off | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 35 | 304846 | $0.02349 | 347 s | 18 | 0 | — | 62/62 | `b1-nano/pass-5/runs/recall-heldout-08__nemotron__2026-10-05T23-35-45-883Z__56f780.json` |
| rerun-pass-2-01-off | recall-heldout-01 | graph-off | yes | UNRESOLVED | stopped: stuck | yes | pass | 0 | yes | 33 | 198938 | $0.01421 | 211 s | 4 | 0 | — | 62/62 | `b1-nano/rerun-pass-2-01-off/runs/recall-heldout-01__nemotron__2026-10-05T23-42-24-914Z__abd206.json` |
| rerun-pass-2-04-on | recall-heldout-04 | graph-on | yes | RESOLVED | finish | yes | pass | 0 | yes | 10 | 48000 | $0.00359 | 101 s | 4 | 0 | 2593 | 62/62 | `b1-nano/rerun-pass-2-04-on/runs/recall-heldout-04__nemotron__2026-10-05T23-45-56-614Z__99bb9f.json` |
| rerun-pass-3-08-on | recall-heldout-08 | graph-on | yes | UNRESOLVED | budget: tokens 300000 | no | fail | 0 | yes | 27 | 303274 | $0.02600 | 463 s | 8 | 0 | 2051 | 62/62 | `b1-nano/rerun-pass-3-08-on/runs/recall-heldout-08__nemotron__2026-10-05T23-47-38-810Z__7d476a.json` |
| rerun-pass-3-08-off | recall-heldout-08 | graph-off | yes | RESOLVED | finish | yes | pass | 0 | yes | 28 | 226988 | $0.01650 | 235 s | 13 | 0 | — | 62/62 | `b1-nano/rerun-pass-3-08-off/runs/recall-heldout-08__nemotron__2026-10-05T23-55-22-124Z__7270b0.json` |
