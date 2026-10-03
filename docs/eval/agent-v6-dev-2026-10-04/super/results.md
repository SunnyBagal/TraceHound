# Evaluation results

Tasks: `eval/tasks` · arms: graph-on, graph-off · repeats: 1 · 2026-10-03T20:35:35.644Z

| Task | Arm | Rep | State | End | Steps | Tokens | Cost | Wall time | Files opened | Graph tool calls | Failed edits | Unknown-tool calls | Fault file first read: step (tokens) | Baseline tests passed / total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| recall-dev-chat-recent | graph-on | 1 | RESOLVED | finish | 26 | 213244 | $0.06560 | 85 s | 4 | 0 | 0 | 0 | 13 (71627) | 62 / 62 |
| recall-dev-chat-recent | graph-off | 1 | RESOLVED | finish | 14 | 56694 | $0.01789 | 67 s | 1 | 0 | 0 | 0 | 6 (13584) | 62 / 62 |
| recall-dev-search-description | graph-on | 1 | RESOLVED | finish | 16 | 132154 | $0.04145 | 88 s | 3 | 0 | 1 | 0 | 3 (11771) | 62 / 62 |
| recall-dev-search-description | graph-off | 1 | UNRESOLVED | budget: tokens 300000 | 27 | 311723 | $0.10090 | 130 s | 8 | 0 | 0 | 0 | 5 (13084) | 62 / 62 |
| recall-dev-session-expiry | graph-on | 1 | RESOLVED | finish | 9 | 52143 | $0.01632 | 67 s | 3 | 0 | 0 | 0 | 3 (12914) | 62 / 62 |
| recall-dev-session-expiry | graph-off | 1 | RESOLVED | finish | 8 | 19773 | $0.00626 | 62 s | 1 | 0 | 0 | 0 | 5 (10241) | 62 / 62 |
| recall-dev-short-summary | graph-on | 1 | UNRESOLVED | stopped: stuck | 16 | 127836 | $0.04202 | 78 s | 3 | 0 | 0 | 0 | 4 (18068) | 62 / 62 |
| recall-dev-short-summary | graph-off | 1 | UNRESOLVED | budget: tokens 300000 | 31 | 305522 | $0.10075 | 144 s | 5 | 0 | 0 | 0 | 6 (15190) | 62 / 62 |

## Per arm (totals; n = runs with a record)

| Arm | n | Resolved | Unresolved | Failed | Steps (mean) | Tokens (mean) | Cost (mean) | Wall time (mean) | Files opened (mean) | Graph tool calls | Failed edits | Unknown-tool calls | Fault file read (mean step) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| graph-on | 4 | 3 of 4 | 1 of 4 | 0 of 4 | 67 (16.8; n = 4) | 525377 (131344; n = 4) | $0.16540 ($0.04135; n = 4) | 317 s (79 s; n = 4) | 13 (3.3; n = 4) | 0 (n = 4) | 1 (n = 4) | 0 (n = 4) | 4 of 4 (5.8; n = 4) |
| graph-off | 4 | 2 of 4 | 2 of 4 | 0 of 4 | 80 (20.0; n = 4) | 693712 (173428; n = 4) | $0.22580 ($0.05645; n = 4) | 403 s (101 s; n = 4) | 15 (3.8; n = 4) | 0 (n = 4) | 0 (n = 4) | 0 (n = 4) | 4 of 4 (5.5; n = 4) |

baseline-anomaly: none (every run's baseline passed-count is the most common one for its task in this batch).

Counts and sums over the runs above, with the sample size beside each. No significance test was run and none is implied.
