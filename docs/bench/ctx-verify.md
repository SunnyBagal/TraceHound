# Context-aware verifier: verify-ctx-v1 (decision 058)

review-diff-v1 (055, Super) stays the generator; verify-ctx-v1 checks each of its 143 dev findings
with repository context around the finding (`src/review/verify-context.ts`) and answers keep or
drop (`src/review/verify-ctx.ts`, prompt sha256
`75703fc6b34910f5bdebf29703023d6ec8e8cbbbfbc35574bfbf60830a383e70`). agree-diff-ctx keeps a
review-diff-v1 finding when review-ctx-v1 (057) has a finding on the same path within 3 lines;
report only. All runs Super, reasoning on, temperature 0, one run each. Judge `bench-judge-v1`,
unchanged; the verify-ctx-v1 and agree-diff-ctx comment sets were judged as their own sets (not
by reusing 055's matches). Dev repos only (40 pull requests); Cal.com was not read, fetched,
cloned, reviewed or scored. Counts only.

**Adoption rule (pre-registered: F ≥ 35.0%): not met.** verify-ctx-v1 F 32.8%.

Reproduce: `node scripts/bench/agree-diff-ctx.ts`, then per repo `pnpm tracehound verify-ctx
--reviews <bench>/reviews/review-diff-v1/nemotron-3-super-120b-a12b/<repo> --prs <bench>/prs/<repo>
--heads <bench>/repos/<repo>.heads.json --repo <bench>/repos/<repo> --out
<bench>/reviews/verify-ctx-v1/super/<repo>/verdicts --kept <bench>/reviews/verify-ctx-v1/super/<repo>/kept`,
then `node scripts/bench/score-ctx-verify.ts` (prints the tables below).

## Overall (40 dev pull requests)

| run | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| review-diff-v1 | 143 | 32 | 93 | 8 | 10 | 42 | 0 | 25.6% (32/125) | 43.2% (32/74) | 32.2% |
| review-ctx-v1 | 133 | 21 | 37 | 4 | 71 | 53 | 0 | 36.2% (21/58) | 28.4% (21/74) | 31.8% |
| verify-ctx-v1 | 63 | 21 | 33 | 3 | 6 | 53 | 0 | 38.9% (21/54) | 28.4% (21/74) | 32.8% |
| agree-diff-ctx | 33 | 15 | 11 | 2 | 5 | 59 | 0 | 57.7% (15/26) | 20.3% (15/74) | 30.0% |

## sentry

| run | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| review-diff-v1 | 40 | 8 | 27 | 2 | 3 | 13 | 0 | 22.9% (8/35) | 38.1% (8/21) | 28.6% |
| review-ctx-v1 | 24 | 6 | 15 | 2 | 1 | 15 | 0 | 28.6% (6/21) | 28.6% (6/21) | 28.6% |
| verify-ctx-v1 | 18 | 5 | 11 | 1 | 1 | 16 | 0 | 31.3% (5/16) | 23.8% (5/21) | 27.0% |
| agree-diff-ctx | 12 | 4 | 6 | 1 | 1 | 17 | 0 | 40.0% (4/10) | 19.0% (4/21) | 25.8% |

## grafana

| run | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| review-diff-v1 | 20 | 5 | 8 | 3 | 4 | 11 | 0 | 38.5% (5/13) | 31.3% (5/16) | 34.5% |
| review-ctx-v1 | 9 | 3 | 3 | 1 | 2 | 13 | 0 | 50.0% (3/6) | 18.8% (3/16) | 27.3% |
| verify-ctx-v1 | 6 | 2 | 2 | 0 | 2 | 14 | 0 | 50.0% (2/4) | 12.5% (2/16) | 20.0% |
| agree-diff-ctx | 2 | 1 | 0 | 0 | 1 | 15 | 0 | 100.0% (1/1) | 6.3% (1/16) | 11.8% |

## keycloak

| run | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| review-diff-v1 | 53 | 9 | 43 | 1 | 0 | 9 | 0 | 17.3% (9/52) | 50.0% (9/18) | 25.7% |
| review-ctx-v1 | 18 | 7 | 10 | 1 | 0 | 11 | 0 | 41.2% (7/17) | 38.9% (7/18) | 40.0% |
| verify-ctx-v1 | 22 | 7 | 14 | 1 | 0 | 11 | 0 | 33.3% (7/21) | 38.9% (7/18) | 35.9% |
| agree-diff-ctx | 7 | 6 | 0 | 1 | 0 | 12 | 0 | 100.0% (6/6) | 33.3% (6/18) | 50.0% |

## discourse

| run | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| review-diff-v1 | 30 | 10 | 15 | 2 | 3 | 9 | 0 | 40.0% (10/25) | 52.6% (10/19) | 45.5% |
| review-ctx-v1 | 82 | 5 | 9 | 0 | 68 | 14 | 0 | 35.7% (5/14) | 26.3% (5/19) | 30.3% |
| verify-ctx-v1 | 17 | 7 | 6 | 1 | 3 | 12 | 0 | 53.8% (7/13) | 36.8% (7/19) | 43.8% |
| agree-diff-ctx | 12 | 4 | 5 | 0 | 3 | 15 | 0 | 44.4% (4/9) | 21.1% (4/19) | 28.6% |

Judge on this job's scoring (verify-ctx-v1 + agree-diff-ctx): verify-ctx-v1 8 uncached calls, $0.0060; agree-diff-ctx 13 uncached calls, $0.0049.

## Per pull request TP / FP (golden index)

| repo | golden index | review-diff-v1 TP/FP | review-ctx-v1 TP/FP | verify-ctx-v1 TP/FP | agree-diff-ctx TP/FP |
|---|---|---|---|---|---|
| sentry | 0 | 1/0 | 1/0 | 1/0 | 1/0 |
| sentry | 1 | 2/4 | 0/4 | 1/3 | 0/4 |
| sentry | 2 | 0/2 | 0/1 | 0/0 | 0/0 |
| sentry | 3 | 1/1 | 0/2 | 0/1 | 0/1 |
| sentry | 4 | 0/12 | 1/2 | 0/3 | 0/0 |
| sentry | 5 | 0/2 | 1/1 | 0/1 | 0/1 |
| sentry | 6 | 2/0 | 1/2 | 1/0 | 1/0 |
| sentry | 7 | 0/1 | 0/2 | 0/0 | 0/0 |
| sentry | 8 | 1/3 | 1/1 | 1/3 | 1/0 |
| sentry | 9 | 1/2 | 1/0 | 1/0 | 1/0 |
| grafana | 0 | 0/1 | 0/0 | 0/1 | 0/0 |
| grafana | 1 | 1/1 | 0/0 | 0/0 | 0/0 |
| grafana | 2 | 0/1 | 0/0 | 0/0 | 0/0 |
| grafana | 3 | 0/0 | 0/2 | 0/0 | 0/0 |
| grafana | 4 | 1/1 | 0/1 | 0/0 | 0/0 |
| grafana | 5 | 1/1 | 1/0 | 0/1 | 0/0 |
| grafana | 6 | 0/2 | 0/0 | 0/0 | 0/0 |
| grafana | 7 | 1/0 | 0/0 | 1/0 | 0/0 |
| grafana | 8 | 1/1 | 2/0 | 1/0 | 1/0 |
| grafana | 9 | 0/0 | 0/0 | 0/0 | 0/0 |
| keycloak | 0 | 1/0 | 1/1 | 1/0 | 1/0 |
| keycloak | 1 | 1/0 | 0/3 | 1/0 | 1/0 |
| keycloak | 2 | 1/18 | 1/0 | 1/8 | 1/0 |
| keycloak | 3 | 0/2 | 0/0 | 0/0 | 0/0 |
| keycloak | 4 | 1/2 | 0/4 | 0/1 | 0/0 |
| keycloak | 5 | 1/2 | 1/0 | 1/2 | 1/0 |
| keycloak | 6 | 1/19 | 1/1 | 1/3 | 1/0 |
| keycloak | 7 | 2/0 | 1/1 | 2/0 | 1/0 |
| keycloak | 8 | 0/0 | 1/0 | 0/0 | 0/0 |
| keycloak | 9 | 1/0 | 1/0 | 0/0 | 0/0 |
| discourse | 0 | 1/1 | 1/1 | 0/1 | 0/0 |
| discourse | 1 | 1/0 | 1/1 | 1/0 | 1/0 |
| discourse | 2 | 1/3 | 1/1 | 1/1 | 1/0 |
| discourse | 3 | 3/2 | 0/1 | 3/0 | 0/1 |
| discourse | 4 | 0/4 | 0/0 | 0/1 | 0/1 |
| discourse | 5 | 1/0 | 0/0 | 1/0 | 0/0 |
| discourse | 6 | 0/0 | 0/2 | 0/0 | 0/0 |
| discourse | 7 | 2/2 | 2/0 | 1/2 | 2/0 |
| discourse | 8 | 0/1 | 0/1 | 0/0 | 0/1 |
| discourse | 9 | 1/2 | 0/2 | 0/1 | 0/2 |

## Verifier

| statistic | value |
|---|---|
| findings in | 143 (40 pull requests) |
| kept (verdict keep) | 63 |
| dropped (verdict drop) | 80 |
| VERIFY_FAILED (kept by the verdict rule) | 0 |
| findings retried once | 3 (all valid after the retry) |

review-diff-v1 findings by their 055 judge outcome, kept or dropped by verify-ctx-v1 (re-judged as
its own set, the kept set scores 21 TP, one fewer than the 22 kept 055 TPs):

| 055 outcome | kept | dropped |
|---|---|---|
| tp | 22 | 10 |
| fp | 31 | 62 |
| duplicate | 4 | 4 |
| low | 6 | 4 |

## Context

| statistic | value |
|---|---|
| findings | 143 |
| characters per finding, median / max | 12,329 / 23,815 (budget 24,000) |
| references shown per finding, median / max / total | 6 / 15 / 794 |
| findings with at least one reference | 97 |
| names per finding, median | 1 |
| window missing (file not at head) | 0 |
| diff missing | 0 |
| diff: hunks omitted at the 12,000-character limit | 3 findings |
| diff: nearest hunk alone over the limit, cut at a line | 9 findings |
| budget cut 1, references dropped | 5 findings |
| budget cut 2, window shrunk | 0 |
| budget cut 3, hunks dropped | 0 |
| still over budget | 0 |

## Calls, tokens, cost, latency

| | requests | in tokens | out tokens | cost |
|---|---|---|---|---|
| verifier (purpose `review`) | 146 (143 findings + 3 retries), 0 failed | 681,007 | 131,377 | $0.3225 |
| judge, this job's sets | 21 uncached (+30 served from the response cache, byte-identical requests), 0 failed | 11,918 | 8,152 | $0.0109 |

Verifier latency per finding median 4.6 s, max 23.8 s; wall time per pull request (4 findings in
parallel) median 6.5 s, max 31.0 s. Ledger $11.2687 before, $11.6021 after.

## The five recorded tools (dev only, from `docs/bench/baseline-diff.md`)

| run | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| Greptile | 84 | 35 | 33 | 4 | 12 | 39 | 0 | 51.5% (35/68) | 47.3% (35/74) | 49.3% |
| CodeRabbit | 93 | 32 | 50 | 3 | 8 | 42 | 0 | 39.0% (32/82) | 43.2% (32/74) | 41.0% |
| Augment | 69 | 41 | 13 | 7 | 8 | 33 | 0 | 75.9% (41/54) | 55.4% (41/74) | 64.1% |
| Cursor | 55 | 29 | 14 | 2 | 10 | 45 | 0 | 67.4% (29/43) | 39.2% (29/74) | 49.6% |
| Copilot | 131 | 28 | 77 | 4 | 22 | 46 | 0 | 26.7% (28/105) | 37.8% (28/74) | 31.3% |

Per repo:

| Reviewer | Repo | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|---|
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
