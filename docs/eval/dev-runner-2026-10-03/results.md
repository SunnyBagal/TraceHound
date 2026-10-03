# Evaluation results

Tasks: `eval/tasks` · arms: graph-on, graph-off · repeats: 1 · 2026-10-03T13:29:07.679Z

| Task | Arm | Rep | State | Steps | Tokens | Cost | Wall time | Files opened | Graph tool calls |
|---|---|---|---|---|---|---|---|---|---|
| recall-dev-chat-recent | graph-on | 1 | RESOLVED | 31 | 255518 | $0.01738 | 226 s | 1 | 0 |
| recall-dev-chat-recent | graph-off | 1 | UNRESOLVED | 40 | 280433 | $0.01952 | 265 s | 4 | 0 |
| recall-dev-search-description | graph-on | 1 | UNRESOLVED | 28 | 311297 | $0.02266 | 304 s | 4 | 0 |
| recall-dev-search-description | graph-off | 1 | UNRESOLVED | 40 | 284574 | $0.02634 | 583 s | 2 | 0 |
| recall-dev-session-expiry | graph-on | 1 | RESOLVED | 24 | 153318 | $0.00999 | 145 s | 3 | 0 |
| recall-dev-session-expiry | graph-off | 1 | RESOLVED | 25 | 109653 | $0.00748 | 171 s | 2 | 0 |
| recall-dev-short-summary | graph-on | 1 | UNRESOLVED | 28 | 313254 | $0.02337 | 380 s | 2 | 0 |
| recall-dev-short-summary | graph-off | 1 | UNRESOLVED | 32 | 306398 | $0.02159 | 298 s | 3 | 0 |

## Per arm (totals; n = runs with a record)

| Arm | n | Resolved | Unresolved | Failed | Steps (mean) | Tokens (mean) | Cost (mean) | Wall time (mean) | Files opened (mean) | Graph tool calls |
|---|---|---|---|---|---|---|---|---|---|---|
| graph-on | 4 | 2 of 4 | 2 of 4 | 0 of 4 | 111 (27.8; n = 4) | 1033387 (258347; n = 4) | $0.07340 ($0.01835; n = 4) | 1055 s (264 s; n = 4) | 10 (2.5; n = 4) | 0 (n = 4) |
| graph-off | 4 | 1 of 4 | 3 of 4 | 0 of 4 | 137 (34.3; n = 4) | 981058 (245265; n = 4) | $0.07493 ($0.01873; n = 4) | 1317 s (329 s; n = 4) | 11 (2.8; n = 4) | 0 (n = 4) |

Counts and sums over the runs above, with the sample size beside each. No significance test was run and none is implied.
