# Diff-only baseline reviewer: review-diff-v1 (decision 055)

The reviewer reads a pull request's title, description and unified diff, nothing else, and writes
line comments (`tracehound review`). Run 2026-10-15 on the 40 dev pull requests (sentry, grafana,
keycloak, discourse); Cal.com was not read, fetched or reviewed. Scored with `bench-judge-v1`
unchanged (Nemotron Super, temperature 0, reasoning on, one judge, prompt sha256
`23de4e9e…058460`, as in `docs/bench/scorer-validation.md`). Reviewer prompt sha256
`f77c2031…dea4849`, frozen before the first run. One run per model, temperature 0, reasoning on.
Counts only; comment text and per-comment detail stay in `~/Projects/tracehound-bench/`.

Precision = TP / (TP + FP), recall = TP / (TP + FN), F = their harmonic mean, from summed counts.
"low" = comments that matched a Low golden comment (they count as nothing). n = 74 golden
comments of Medium or higher (sentry 21, grafana 16, keycloak 18, discourse 19). Every review file
mapped to its golden entry (40 of 40 per model); 0 JUDGE_FAILED.

## Overall (dev repos), beside the five recorded tools

The tools' rows are sums of their four dev per-repo rows in `docs/bench/scorer-validation.md`,
not re-judged.

| Reviewer | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| **review-diff-v1, Super** | 143 | 32 | 93 | 8 | 10 | 42 | 0 | 25.6% (32/125) | 43.2% (32/74) | 32.2% |
| **review-diff-v1, Nano** | 66 | 16 | 47 | 2 | 1 | 58 | 0 | 25.4% (16/63) | 21.6% (16/74) | 23.4% |
| Greptile | 84 | 35 | 33 | 4 | 12 | 39 | 0 | 51.5% (35/68) | 47.3% (35/74) | 49.3% |
| CodeRabbit | 93 | 32 | 50 | 3 | 8 | 42 | 0 | 39.0% (32/82) | 43.2% (32/74) | 41.0% |
| Augment | 69 | 41 | 13 | 7 | 8 | 33 | 0 | 75.9% (41/54) | 55.4% (41/74) | 64.1% |
| Cursor | 55 | 29 | 14 | 2 | 10 | 45 | 0 | 67.4% (29/43) | 39.2% (29/74) | 49.6% |
| Copilot | 131 | 28 | 77 | 4 | 22 | 46 | 0 | 26.7% (28/105) | 37.8% (28/74) | 31.3% |

Super's recall equals CodeRabbit's (32/74), but its precision is the lowest in the table apart
from Nano's. Its F is above Copilot's and below the other four tools'. Nano is below all five on
recall and F. With one run, one judge and n = 74 these are not separated from noise by a few
points.

## Per repo

| Reviewer | Repo | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|---|
| review-diff-v1, Super | sentry | 40 | 8 | 27 | 2 | 3 | 13 | 0 | 22.9% (8/35) | 38.1% (8/21) | 28.6% |
| review-diff-v1, Super | grafana | 20 | 5 | 8 | 3 | 4 | 11 | 0 | 38.5% (5/13) | 31.3% (5/16) | 34.5% |
| review-diff-v1, Super | keycloak | 53 | 9 | 43 | 1 | 0 | 9 | 0 | 17.3% (9/52) | 50.0% (9/18) | 25.7% |
| review-diff-v1, Super | discourse | 30 | 10 | 15 | 2 | 3 | 9 | 0 | 40.0% (10/25) | 52.6% (10/19) | 45.5% |
| review-diff-v1, Nano | sentry | 21 | 2 | 19 | 0 | 0 | 19 | 0 | 9.5% (2/21) | 9.5% (2/21) | 9.5% |
| review-diff-v1, Nano | grafana | 10 | 3 | 6 | 0 | 1 | 13 | 0 | 33.3% (3/9) | 18.8% (3/16) | 24.0% |
| review-diff-v1, Nano | keycloak | 21 | 7 | 13 | 1 | 0 | 11 | 0 | 35.0% (7/20) | 38.9% (7/18) | 36.8% |
| review-diff-v1, Nano | discourse | 14 | 4 | 9 | 1 | 0 | 15 | 0 | 30.8% (4/13) | 21.1% (4/19) | 25.0% |
| Greptile | sentry | 26 | 9 | 15 | 1 | 1 | 12 | 0 | 37.5% (9/24) | 42.9% (9/21) | 40.0% |
| Greptile | grafana | 19 | 8 | 3 | 1 | 7 | 8 | 0 | 72.7% (8/11) | 50.0% (8/16) | 59.3% |
| Greptile | keycloak | 14 | 6 | 6 | 0 | 2 | 12 | 0 | 50.0% (6/12) | 33.3% (6/18) | 40.0% |
| Greptile | discourse | 25 | 12 | 9 | 2 | 2 | 7 | 0 | 57.1% (12/21) | 63.2% (12/19) | 60.0% |
| CodeRabbit | sentry | 25 | 9 | 13 | 1 | 2 | 12 | 0 | 40.9% (9/22) | 42.9% (9/21) | 41.9% |
| CodeRabbit | grafana | 11 | 6 | 3 | 0 | 2 | 10 | 0 | 66.7% (6/9) | 37.5% (6/16) | 48.0% |
| CodeRabbit | keycloak | 26 | 8 | 15 | 1 | 2 | 10 | 0 | 34.8% (8/23) | 44.4% (8/18) | 39.0% |
| CodeRabbit | discourse | 31 | 9 | 19 | 1 | 2 | 10 | 0 | 32.1% (9/28) | 47.4% (9/19) | 38.3% |
| Augment | sentry | 16 | 11 | 3 | 0 | 2 | 10 | 0 | 78.6% (11/14) | 52.4% (11/21) | 62.9% |
| Augment | grafana | 14 | 8 | 3 | 2 | 1 | 8 | 0 | 72.7% (8/11) | 50.0% (8/16) | 59.3% |
| Augment | keycloak | 14 | 11 | 1 | 2 | 0 | 7 | 0 | 91.7% (11/12) | 61.1% (11/18) | 73.3% |
| Augment | discourse | 25 | 11 | 6 | 3 | 5 | 8 | 0 | 64.7% (11/17) | 57.9% (11/19) | 61.1% |
| Cursor | sentry | 11 | 9 | 2 | 0 | 0 | 12 | 0 | 81.8% (9/11) | 42.9% (9/21) | 56.3% |
| Cursor | grafana | 14 | 7 | 4 | 1 | 2 | 9 | 0 | 63.6% (7/11) | 43.8% (7/16) | 51.9% |
| Cursor | keycloak | 8 | 6 | 1 | 0 | 1 | 12 | 0 | 85.7% (6/7) | 33.3% (6/18) | 48.0% |
| Cursor | discourse | 22 | 7 | 7 | 1 | 7 | 12 | 0 | 50.0% (7/14) | 36.8% (7/19) | 42.4% |
| Copilot | sentry | 33 | 6 | 25 | 0 | 2 | 15 | 0 | 19.4% (6/31) | 28.6% (6/21) | 23.1% |
| Copilot | grafana | 24 | 6 | 7 | 0 | 11 | 10 | 0 | 46.2% (6/13) | 37.5% (6/16) | 41.4% |
| Copilot | keycloak | 35 | 8 | 21 | 3 | 3 | 10 | 0 | 27.6% (8/29) | 44.4% (8/18) | 34.0% |
| Copilot | discourse | 39 | 8 | 24 | 1 | 6 | 11 | 0 | 25.0% (8/32) | 42.1% (8/19) | 31.4% |

## The reviewer's own record

| | Super | Nano |
|---|---|---|
| pull requests | 40 | 40 |
| chunks (one-chunk PRs / multi-chunk PRs) | 48 (35 / 5) | 48 (35 / 5) |
| reviewer requests (ledger) | 51 | 53 |
| retries after an invalid reply | 3 | 5 |
| CHUNK_FAILED | 0 | 1 (`request failed: fetch failed`, not retried) |
| findings returned | 148 | 69 |
| comments kept | 143 | 66 |
| dropped: malformed | 1 | 0 |
| dropped: path not in the diff | 4 | 2 |
| dropped: file deleted | 0 | 0 |
| dropped: line not an added/context line in the new version | 0 | 1 |
| pull requests with no comment | 3 | 4 |
| input / output tokens (ledger) | 511,657 / 383,720 | 552,996 / 391,041 |
| cost (ledger) | $0.49885 | $0.12703 |
| wall time per pull request, median / max | 31.5 s / 213.9 s | 25.6 s / 620.1 s |
| judge calls / cost for this run | 37 / $0.0268 | 36 / $0.0192 |

Nano's ledger figures include one request that ended in `fetch failed` (charged at the upper
bound, 22,877 estimated input and 32,000 output tokens) and two HTTP-OK responses that reported no
usage (charged at the estimate); the token sums read from the responses are 514,981 / 295,041,
$0.1180. Three Nano and two Super requests reported the full 32,000 output tokens (the
`max_tokens` limit). Wall time is per pull request, its chunks in
sequence, four pull requests in parallel. Pull requests with no comment are scored without a judge
call (FN for their golden comments).

## Spend

Ledger total before $9.52103, after $10.19290: $0.67187 for this job. Reviewer (purpose
`review`): 104 requests, $0.62587 (Super $0.49885, Nano $0.12703). Judge (purpose `bench-judge`):
73 requests, $0.04599. Prices are third-party rates in `config/prices.json`, not confirmed in the
Nebius console.
