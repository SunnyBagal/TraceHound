# Pooled candidates filtered by the context verifier: pool-verify-v1 (decision 059)

The candidate pool for each pull request is every review-diff-v1 (055) finding plus every
review-ctx-v1 (057) finding that agrees with none of them (058's agreement rule, unchanged: same
path, both lines non-null, within 3 lines; `scripts/bench/agree-rule.ts`). verify-ctx-v1 (058),
unchanged (prompt sha256 `75703fc6b34910f5bdebf29703023d6ec8e8cbbbfbc35574bfbf60830a383e70`),
filters the pool: review-diff-v1 findings keep their 058 verdicts (reuse check: 143 of 143
matched by path, line and body), and only the 100 ctx-only findings got new verifier calls. All
runs Super, reasoning on, temperature 0, one run each. Judge `bench-judge-v1`, unchanged; pool-raw
and pool-verify-v1 were judged as their own sets (not by reusing earlier matches; requests that
were byte-identical to earlier ones came from the response cache). Rows for review-diff-v1,
review-ctx-v1, verify-ctx-v1 and agree-diff-ctx are copied from `docs/bench/ctx-verify.md`. Dev
repos only (40 pull requests, n = 74); Cal.com was not read, fetched, cloned, reviewed or scored.
Counts only.

**Adoption rule (pre-registered: F ≥ 35.0%): met.** pool-verify-v1 F 35.6%.

Reproduce: `node scripts/bench/pool-verify.ts build`; per repo `pnpm tracehound verify-ctx
--reviews <bench>/reviews/pool-ctx-only/super/<repo> --prs <bench>/prs/<repo> --heads
<bench>/repos/<repo>.heads.json --repo <bench>/repos/<repo> --out
<bench>/reviews/pool-verify-v1/super/<repo>/ctx-only-verdicts --kept
<bench>/reviews/pool-verify-v1/super/<repo>/ctx-only-kept-scratch`; `node scripts/bench/pool-verify.ts
merge`; then `node scripts/bench/score-pool-verify.ts` (scores pool-raw and pool-verify-v1 and
prints the tables below).

### Overall (40 dev pull requests)

| run | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| review-diff-v1 | 143 | 32 | 93 | 8 | 10 | 42 | 0 | 25.6% (32/125) | 43.2% (32/74) | 32.2% |
| review-ctx-v1 | 133 | 21 | 37 | 4 | 71 | 53 | 0 | 36.2% (21/58) | 28.4% (21/74) | 31.8% |
| verify-ctx-v1 | 63 | 21 | 33 | 3 | 6 | 53 | 0 | 38.9% (21/54) | 28.4% (21/74) | 32.8% |
| agree-diff-ctx | 33 | 15 | 11 | 2 | 5 | 59 | 0 | 57.7% (15/26) | 20.3% (15/74) | 30.0% |
| pool-raw | 243 | 38 | 117 | 10 | 78 | 36 | 0 | 24.5% (38/155) | 51.4% (38/74) | 33.2% |
| pool-verify-v1 | 83 | 26 | 46 | 4 | 7 | 48 | 0 | 36.1% (26/72) | 35.1% (26/74) | 35.6% |

### sentry

| run | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| review-diff-v1 | 40 | 8 | 27 | 2 | 3 | 13 | 0 | 22.9% (8/35) | 38.1% (8/21) | 28.6% |
| review-ctx-v1 | 24 | 6 | 15 | 2 | 1 | 15 | 0 | 28.6% (6/21) | 28.6% (6/21) | 28.6% |
| verify-ctx-v1 | 18 | 5 | 11 | 1 | 1 | 16 | 0 | 31.3% (5/16) | 23.8% (5/21) | 27.0% |
| agree-diff-ctx | 12 | 4 | 6 | 1 | 1 | 17 | 0 | 40.0% (4/10) | 19.0% (4/21) | 25.8% |
| pool-raw | 52 | 10 | 35 | 2 | 5 | 11 | 0 | 22.2% (10/45) | 47.6% (10/21) | 30.3% |
| pool-verify-v1 | 25 | 6 | 17 | 1 | 1 | 15 | 0 | 26.1% (6/23) | 28.6% (6/21) | 27.3% |

### grafana

| run | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| review-diff-v1 | 20 | 5 | 8 | 3 | 4 | 11 | 0 | 38.5% (5/13) | 31.3% (5/16) | 34.5% |
| review-ctx-v1 | 9 | 3 | 3 | 1 | 2 | 13 | 0 | 50.0% (3/6) | 18.8% (3/16) | 27.3% |
| verify-ctx-v1 | 6 | 2 | 2 | 0 | 2 | 14 | 0 | 50.0% (2/4) | 12.5% (2/16) | 20.0% |
| agree-diff-ctx | 2 | 1 | 0 | 0 | 1 | 15 | 0 | 100.0% (1/1) | 6.3% (1/16) | 11.8% |
| pool-raw | 27 | 6 | 12 | 4 | 5 | 10 | 0 | 33.3% (6/18) | 37.5% (6/16) | 35.3% |
| pool-verify-v1 | 9 | 4 | 3 | 0 | 2 | 12 | 0 | 57.1% (4/7) | 25.0% (4/16) | 34.8% |

### keycloak

| run | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| review-diff-v1 | 53 | 9 | 43 | 1 | 0 | 9 | 0 | 17.3% (9/52) | 50.0% (9/18) | 25.7% |
| review-ctx-v1 | 18 | 7 | 10 | 1 | 0 | 11 | 0 | 41.2% (7/17) | 38.9% (7/18) | 40.0% |
| verify-ctx-v1 | 22 | 7 | 14 | 1 | 0 | 11 | 0 | 33.3% (7/21) | 38.9% (7/18) | 35.9% |
| agree-diff-ctx | 7 | 6 | 0 | 1 | 0 | 12 | 0 | 100.0% (6/6) | 33.3% (6/18) | 50.0% |
| pool-raw | 64 | 11 | 50 | 2 | 1 | 7 | 0 | 18.0% (11/61) | 61.1% (11/18) | 27.8% |
| pool-verify-v1 | 27 | 8 | 17 | 2 | 0 | 10 | 0 | 32.0% (8/25) | 44.4% (8/18) | 37.2% |

### discourse

| run | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| review-diff-v1 | 30 | 10 | 15 | 2 | 3 | 9 | 0 | 40.0% (10/25) | 52.6% (10/19) | 45.5% |
| review-ctx-v1 | 82 | 5 | 9 | 0 | 68 | 14 | 0 | 35.7% (5/14) | 26.3% (5/19) | 30.3% |
| verify-ctx-v1 | 17 | 7 | 6 | 1 | 3 | 12 | 0 | 53.8% (7/13) | 36.8% (7/19) | 43.8% |
| agree-diff-ctx | 12 | 4 | 5 | 0 | 3 | 15 | 0 | 44.4% (4/9) | 21.1% (4/19) | 28.6% |
| pool-raw | 100 | 11 | 20 | 2 | 67 | 8 | 0 | 35.5% (11/31) | 57.9% (11/19) | 44.0% |
| pool-verify-v1 | 22 | 8 | 9 | 1 | 4 | 11 | 0 | 47.1% (8/17) | 42.1% (8/19) | 44.4% |

Judge on this job's scoring: pool-raw 39 requests, 21 uncached, $0.0209; pool-verify-v1 32 requests, 10 uncached, $0.0075 (the rest were byte-identical to earlier requests and came from the response cache; a pull request with no comment gets no judge request).

pool-raw has the highest recall in the table (51.4%) and the lowest precision. Overall,
pool-verify-v1 has the highest F of the six rows. Per repo it is not the highest in any of the four
(highest: sentry pool-raw 30.3%, grafana pool-raw 35.3%, keycloak agree-diff-ctx 50.0%, discourse
review-diff-v1 45.5%); each repo's n is 16 to 21.

### Per pull request TP / FP (golden index)

| repo | golden index | review-diff-v1 TP/FP | review-ctx-v1 TP/FP | verify-ctx-v1 TP/FP | agree-diff-ctx TP/FP | pool-raw TP/FP | pool-verify-v1 TP/FP |
|---|---|---|---|---|---|---|---|
| sentry | 0 | 1/0 | 1/0 | 1/0 | 1/0 | 1/0 | 1/0 |
| sentry | 1 | 2/4 | 0/4 | 1/3 | 0/4 | 2/4 | 1/3 |
| sentry | 2 | 0/2 | 0/1 | 0/0 | 0/0 | 0/1 | 0/1 |
| sentry | 3 | 1/1 | 0/2 | 0/1 | 0/1 | 2/1 | 0/2 |
| sentry | 4 | 0/12 | 1/2 | 0/3 | 0/0 | 0/16 | 0/5 |
| sentry | 5 | 0/2 | 1/1 | 0/1 | 0/1 | 1/2 | 1/1 |
| sentry | 6 | 2/0 | 1/2 | 1/0 | 1/0 | 2/2 | 1/0 |
| sentry | 7 | 0/1 | 0/2 | 0/0 | 0/0 | 0/3 | 0/2 |
| sentry | 8 | 1/3 | 1/1 | 1/3 | 1/0 | 1/4 | 1/3 |
| sentry | 9 | 1/2 | 1/0 | 1/0 | 1/0 | 1/2 | 1/0 |
| grafana | 0 | 0/1 | 0/0 | 0/1 | 0/0 | 0/1 | 0/1 |
| grafana | 1 | 1/1 | 0/0 | 0/0 | 0/0 | 1/1 | 0/0 |
| grafana | 2 | 0/1 | 0/0 | 0/0 | 0/0 | 0/1 | 0/0 |
| grafana | 3 | 0/0 | 0/2 | 0/0 | 0/0 | 0/2 | 0/1 |
| grafana | 4 | 1/1 | 0/1 | 0/0 | 0/0 | 1/1 | 0/0 |
| grafana | 5 | 1/1 | 1/0 | 0/1 | 0/0 | 1/3 | 1/1 |
| grafana | 6 | 0/2 | 0/0 | 0/0 | 0/0 | 0/2 | 0/0 |
| grafana | 7 | 1/0 | 0/0 | 1/0 | 0/0 | 1/0 | 1/0 |
| grafana | 8 | 1/1 | 2/0 | 1/0 | 1/0 | 2/1 | 2/0 |
| grafana | 9 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 |
| keycloak | 0 | 1/0 | 1/1 | 1/0 | 1/0 | 1/1 | 1/0 |
| keycloak | 1 | 1/0 | 0/3 | 1/0 | 1/0 | 1/1 | 1/1 |
| keycloak | 2 | 1/18 | 1/0 | 1/8 | 1/0 | 1/18 | 1/8 |
| keycloak | 3 | 0/2 | 0/0 | 0/0 | 0/0 | 0/2 | 0/0 |
| keycloak | 4 | 1/2 | 0/4 | 0/1 | 0/0 | 1/6 | 0/2 |
| keycloak | 5 | 1/2 | 1/0 | 1/2 | 1/0 | 1/2 | 1/2 |
| keycloak | 6 | 1/19 | 1/1 | 1/3 | 1/0 | 1/19 | 1/4 |
| keycloak | 7 | 2/0 | 1/1 | 2/0 | 1/0 | 2/1 | 2/0 |
| keycloak | 8 | 0/0 | 1/0 | 0/0 | 0/0 | 1/0 | 1/0 |
| keycloak | 9 | 1/0 | 1/0 | 0/0 | 0/0 | 2/0 | 0/0 |
| discourse | 0 | 1/1 | 1/1 | 0/1 | 0/0 | 2/2 | 1/2 |
| discourse | 1 | 1/0 | 1/1 | 1/0 | 1/0 | 1/1 | 1/1 |
| discourse | 2 | 1/3 | 1/1 | 1/1 | 1/0 | 1/4 | 1/1 |
| discourse | 3 | 3/2 | 0/1 | 3/0 | 0/1 | 3/2 | 3/0 |
| discourse | 4 | 0/4 | 0/0 | 0/1 | 0/1 | 0/4 | 0/1 |
| discourse | 5 | 1/0 | 0/0 | 1/0 | 0/0 | 1/0 | 1/0 |
| discourse | 6 | 0/0 | 0/2 | 0/0 | 0/0 | 0/2 | 0/1 |
| discourse | 7 | 2/2 | 2/0 | 1/2 | 2/0 | 2/2 | 1/2 |
| discourse | 8 | 0/1 | 0/1 | 0/0 | 0/1 | 0/1 | 0/0 |
| discourse | 9 | 1/2 | 0/2 | 0/1 | 0/2 | 1/2 | 0/1 |

### Pool statistics

| repo | pull requests | review-diff-v1 findings | review-ctx-v1 findings | review-ctx-v1 agreed (not added) | ctx-only added | null-line ctx-only | pool |
|---|---|---|---|---|---|---|---|
| sentry | 10 | 40 | 24 | 12 | 12 | 0 | 52 |
| grafana | 10 | 20 | 9 | 2 | 7 | 0 | 27 |
| keycloak | 10 | 53 | 18 | 7 | 11 | 0 | 64 |
| discourse | 10 | 30 | 82 | 12 | 70 | 0 | 100 |
| total | 40 | 143 | 133 | 33 | 100 | 0 | 243 |

"review-ctx-v1 agreed" counts review-ctx-v1 findings that agree with at least one review-diff-v1
finding of the same pull request; they are not added. No review-ctx-v1 finding had a null line.

### Verifier

| repo | set | in | kept | dropped | VERIFY_FAILED | retries |
|---|---|---|---|---|---|---|
| sentry | ctx-only (this job) | 12 | 7 | 5 | 0 | 0 |
| sentry | review-diff-v1 (058, reused) | 40 | 18 | 22 | 0 | 1 |
| grafana | ctx-only (this job) | 7 | 3 | 4 | 0 | 0 |
| grafana | review-diff-v1 (058, reused) | 20 | 6 | 14 | 0 | 0 |
| keycloak | ctx-only (this job) | 11 | 5 | 6 | 0 | 0 |
| keycloak | review-diff-v1 (058, reused) | 53 | 22 | 31 | 0 | 2 |
| discourse | ctx-only (this job) | 70 | 5 | 65 | 0 | 1 |
| discourse | review-diff-v1 (058, reused) | 30 | 17 | 13 | 0 | 0 |

ctx-only, all repos:

```
{
 "in": 100,
 "kept": 20,
 "dropped": 80,
 "verifyFailed": 0,
 "retried": 1,
 "calls": 101,
 "cached": 0,
 "inputTokens": 378459,
 "outputTokens": 81350,
 "costUSD": 0.1868,
 "latencyMsPerFinding": {
  "n": 100,
  "median": 5281.5,
  "max": 14784
 },
 "promptSha256": [
  "75703fc6b34910f5bdebf29703023d6ec8e8cbbbfbc35574bfbf60830a383e70"
 ]
}
```

The reused 058 verdicts cost nothing in this job. Of the 63 review-diff-v1 findings kept in 058
and the 20 ctx-only findings kept here, pool-verify-v1 has 83 comments. The verifier dropped 65
of discourse's 70 ctx-only findings; 68 of review-ctx-v1's 82 discourse comments were Low by the
057 judge.

### Product cost per pull request (review-diff-v1 + review-ctx-v1 + verify-ctx-v1 on the pool; summed, from existing records)

| pull requests | cost median | cost max | wall time median | wall time max |
|---|---|---|---|---|
| 40 | $0.0317 | $0.2308 | 100 s | 581 s |

Summed per pull request: review-diff-v1's and review-ctx-v1's own records (`review.usage.costUSD`,
`review.wallMs`) and verify-ctx-v1's records for both verdict sets (`verify.usage.costUSD`,
`verify.wallMs`; the verifier ran four findings at a time). Summed wall time assumes the two
reviewers and the verifier run one after another; run in parallel, the reviewers would overlap.
Prices are the third-party rates in `config/prices.json`.

## The five recorded tools, dev repos only (copied from `docs/bench/baseline-diff.md`)

| Reviewer | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| Greptile | 84 | 35 | 33 | 4 | 12 | 39 | 0 | 51.5% (35/68) | 47.3% (35/74) | 49.3% |
| CodeRabbit | 93 | 32 | 50 | 3 | 8 | 42 | 0 | 39.0% (32/82) | 43.2% (32/74) | 41.0% |
| Augment | 69 | 41 | 13 | 7 | 8 | 33 | 0 | 75.9% (41/54) | 55.4% (41/74) | 64.1% |
| Cursor | 55 | 29 | 14 | 2 | 10 | 45 | 0 | 67.4% (29/43) | 39.2% (29/74) | 49.6% |
| Copilot | 131 | 28 | 77 | 4 | 22 | 46 | 0 | 26.7% (28/105) | 37.8% (28/74) | 31.3% |

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
