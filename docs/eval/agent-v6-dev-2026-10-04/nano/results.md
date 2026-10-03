# Evaluation results

Tasks: `eval/tasks (kind dev)` · arms: graph-on, graph-off · repeats: 2 · 2026-10-03T20:23:02.007Z

| Task | Arm | Rep | State | End | Steps | Tokens | Cost | Wall time | Files opened | Graph tool calls | Failed edits | Unknown-tool calls | Fault file first read: step (tokens) | Baseline tests passed / total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| recall-dev-chat-recent | graph-on | 1 | UNRESOLVED | budget: tokens 300000 | 35 | 307928 | $0.02156 | 418 s | 5 | 0 | 0 | 0 | 9 (38231) | 62 / 62 |
| recall-dev-chat-recent | graph-off | 1 | RESOLVED | finish | 20 | 103347 | $0.00721 | 172 s | 2 | 0 | 0 | 0 | 8 (20304) | 62 / 62 |
| recall-dev-chat-recent | graph-on | 2 | UNRESOLVED | budget: tokens 300000 | 40 | 303195 | $0.02220 | 454 s | 2 | 0 | 0 | 0 | 21 (104538) | 62 / 62 |
| recall-dev-chat-recent | graph-off | 2 | RESOLVED | finish | 23 | 100896 | $0.00810 | 276 s | 1 | 0 | 0 | 0 | 11 (32136) | 62 / 62 |
| recall-dev-search-description | graph-on | 1 | RESOLVED | finish | 19 | 146236 | $0.01158 | 222 s | 2 | 0 | 0 | 0 | 7 (31273) | 62 / 62 |
| recall-dev-search-description | graph-off | 1 | UNRESOLVED | error: The operation was aborted due to timeout | 26 | 236425 | $0.02203 | 545 s | 7 | 0 | 0 | 5 | 8 (24441) | 62 / 62 |
| recall-dev-search-description | graph-on | 2 | UNRESOLVED | budget: tokens 300000 | 26 | 314568 | $0.02776 | 589 s | 4 | 0 | 0 | 1 | 6 (25363) | 62 / 62 |
| recall-dev-search-description | graph-off | 2 | UNRESOLVED | budget: tokens 300000 | 27 | 313061 | $0.02845 | 647 s | 3 | 0 | 0 | 0 | 6 (18095) | 62 / 62 |
| recall-dev-session-expiry | graph-on | 1 | RESOLVED | finish | 23 | 178439 | $0.01182 | 197 s | 3 | 0 | 0 | 1 | 7 (32948) | 62 / 62 |
| recall-dev-session-expiry | graph-off | 1 | RESOLVED | finish | 19 | 75890 | $0.00553 | 167 s | 2 | 0 | 0 | 0 | 9 (20286) | 62 / 62 |
| recall-dev-session-expiry | graph-on | 2 | RESOLVED | finish | 22 | 160043 | $0.01062 | 174 s | 3 | 0 | 0 | 0 | 5 (22483) | 62 / 62 |
| recall-dev-session-expiry | graph-off | 2 | RESOLVED | finish | 20 | 119767 | $0.00836 | 211 s | 3 | 0 | 0 | 0 | 5 (11127) | 62 / 62 |
| recall-dev-short-summary | graph-on | 1 | UNRESOLVED | budget: tokens 300000 | 32 | 309009 | $0.02323 | 403 s | 4 | 0 | 1 | 0 | 9 (44360) | 62 / 62 |
| recall-dev-short-summary | graph-off | 1 | UNRESOLVED | budget: tokens 300000 | 36 | 304181 | $0.02337 | 388 s | 3 | 0 | 0 | 0 | 6 (15011) | 62 / 62 |
| recall-dev-short-summary | graph-on | 2 | UNRESOLVED | budget: tokens 300000 | 27 | 307227 | $0.02616 | 469 s | 3 | 0 | 0 | 1 | 8 (43529) | 62 / 62 |
| recall-dev-short-summary | graph-off | 2 | UNRESOLVED | budget: tokens 300000 | 35 | 301180 | $0.02321 | 377 s | 3 | 0 | 0 | 1 | 16 (73758) | 62 / 62 |

## Per arm (totals; n = runs with a record)

| Arm | n | Resolved | Unresolved | Failed | Steps (mean) | Tokens (mean) | Cost (mean) | Wall time (mean) | Files opened (mean) | Graph tool calls | Failed edits | Unknown-tool calls | Fault file read (mean step) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| graph-on | 8 | 3 of 8 | 5 of 8 | 0 of 8 | 224 (28.0; n = 8) | 2026645 (253331; n = 8) | $0.15493 ($0.01937; n = 8) | 2926 s (366 s; n = 8) | 26 (3.3; n = 8) | 0 (n = 8) | 1 (n = 8) | 3 (n = 8) | 8 of 8 (9.0; n = 8) |
| graph-off | 8 | 4 of 8 | 4 of 8 | 0 of 8 | 206 (25.8; n = 8) | 1554747 (194343; n = 8) | $0.12626 ($0.01578; n = 8) | 2782 s (348 s; n = 8) | 24 (3.0; n = 8) | 0 (n = 8) | 0 (n = 8) | 6 (n = 8) | 8 of 8 (8.6; n = 8) |

baseline-anomaly: none (every run's baseline passed-count is the most common one for its task in this batch).

Counts and sums over the runs above, with the sample size beside each. No significance test was run and none is implied.
