# Scorer validation: five recorded tools (decision 054)

Our scorer (`tracehound bench score`, judge `bench-judge-v1`: Nemotron Super
`nvidia/nemotron-3-super-120b-a12b`, temperature 0, reasoning on, one judge, prompt sha256
`23de4e9e…058460`) run on the recorded reviews of five tools in
`ai-code-review-evaluations/<tool>-<repo>`, against `golden_comments` @ `3f2c8ab`. Run
2026-10-14. Counts and percentages only; per-comment detail stays in
`~/Projects/tracehound-bench/scores/`, outside the repo.

Counted comments: top-level line-level review comments by a bot or the tool's own account, on
pull requests whose title maps to a golden entry. Precision = TP / (TP + FP), recall =
TP / (TP + FN), F = their harmonic mean, all from summed counts. "low" = tool comments that
matched a Low golden comment (they count as nothing). Golden comments of Medium or higher: 97
(sentry 21, cal_dot_com 23, grafana 16, keycloak 18, discourse 19); Low ones (40: 11, 8, 6, 6, 9) count as
nothing. Every tool: 50 of 50 golden pull requests mapped, 0 JUDGE_FAILED.

Published figures: Augment's write-up of this dataset (updated 18 June 2026, all 50 pull
requests); their judge model is not stated.

## Overall, beside the published figure

| Tool | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F | published P / R / F | difference P / R / F (points) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Greptile | 108 | 45 | 40 | 5 | 18 | 52 | 0 | 52.9% (45/85) | 46.4% (45/97) | 49.5% | 45 / 45 / 45 | +7.9 / +1.4 / +4.5 |
| CodeRabbit | 124 | 41 | 67 | 6 | 10 | 56 | 0 | 38.0% (41/108) | 42.3% (41/97) | 40.0% | 36 / 43 / 39 | +2.0 / −0.7 / +1.0 |
| Augment | 92 | 56 | 16 | 11 | 9 | 41 | 0 | 77.8% (56/72) | 57.7% (56/97) | 66.3% | 65 / 55 / 59 | +12.8 / +2.7 / +7.3 |
| Cursor Bugbot | 76 | 42 | 17 | 6 | 11 | 55 | 0 | 71.2% (42/59) | 43.3% (42/97) | 53.8% | 60 / 41 / 49 | +11.2 / +2.3 / +4.8 |
| GitHub Copilot | 180 | 43 | 104 | 10 | 23 | 54 | 0 | 29.3% (43/147) | 44.3% (43/97) | 35.2% | 20 / 34 / 25 | +9.3 / +10.3 / +10.2 |

Our F-scores are higher than the published ones for all five tools (by 1.0 to 10.2 points), and
our precision is higher for all five (by 2.0 to 12.8 points). Recall is within 3 points for four
tools and 10.3 points higher for Copilot. The order of the five tools by F-score is the same in
both tables (Augment, Cursor, Greptile, CodeRabbit, Copilot). The reasons for the differences
were not investigated; with one judge and n = 97 golden comments they are not separated from
judge noise.

## Per repo

| Tool | Repo | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
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

## Cal.com (the test set; counts only)

| Tool | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
|---|---|---|---|---|---|---|---|---|---|---|
| Greptile | 24 | 10 | 7 | 1 | 6 | 13 | 0 | 58.8% (10/17) | 43.5% (10/23) | 50.0% |
| CodeRabbit | 31 | 9 | 17 | 3 | 2 | 14 | 0 | 34.6% (9/26) | 39.1% (9/23) | 36.7% |
| Augment | 23 | 15 | 3 | 4 | 1 | 8 | 0 | 83.3% (15/18) | 65.2% (15/23) | 73.2% |
| Cursor | 21 | 13 | 3 | 4 | 1 | 10 | 0 | 81.3% (13/16) | 56.5% (13/23) | 66.7% |
| Copilot | 49 | 15 | 27 | 6 | 1 | 8 | 0 | 35.7% (15/42) | 65.2% (15/23) | 46.2% |

## Data fetched (step 2)

Per fork: pull requests found, mapped to golden entries, fork pull requests matching nothing,
golden entries matching nothing; then comments saved by kind (all authors, before filtering).
No fork had two pull requests with one golden title. The unmatched sentry pull requests are the
five extra pull requests in each sentry fork; one extra in two grafana forks.

| Fork | PRs | mapped | unmatched PRs | unmatched golden | line-level | reviews | issue comments | counted (all PRs) |
|---|---|---|---|---|---|---|---|---|
| greptile-sentry | 15 | 10 | 5 | 0 | 30 | 24 | 30 | 30 |
| greptile-cal_dot_com | 10 | 10 | 0 | 0 | 24 | 20 | 20 | 24 |
| greptile-grafana | 10 | 10 | 0 | 0 | 19 | 20 | 41 | 19 |
| greptile-keycloak | 10 | 10 | 0 | 0 | 14 | 20 | 20 | 14 |
| greptile-discourse | 10 | 10 | 0 | 0 | 25 | 20 | 20 | 25 |
| coderabbit-sentry | 15 | 10 | 5 | 0 | 26 | 11 | 68 | 26 |
| coderabbit-cal_dot_com | 10 | 10 | 0 | 0 | 31 | 10 | 56 | 31 |
| coderabbit-grafana | 11 | 10 | 1 | 0 | 11 | 11 | 76 | 11 |
| coderabbit-keycloak | 10 | 10 | 0 | 0 | 26 | 10 | 40 | 26 |
| coderabbit-discourse | 10 | 10 | 0 | 0 | 31 | 12 | 40 | 31 |
| augment-sentry | 15 | 10 | 5 | 0 | 16 | 10 | 0 | 16 |
| augment-cal_dot_com | 10 | 10 | 0 | 0 | 23 | 10 | 0 | 23 |
| augment-grafana | 11 | 10 | 1 | 0 | 14 | 10 | 23 | 14 |
| augment-keycloak | 10 | 10 | 0 | 0 | 14 | 10 | 0 | 14 |
| augment-discourse | 10 | 10 | 0 | 0 | 25 | 10 | 0 | 25 |
| cursor-sentry | 15 | 10 | 5 | 0 | 12 | 15 | 17 | 12 |
| cursor-cal_dot_com | 10 | 10 | 0 | 0 | 21 | 10 | 2 | 21 |
| cursor-grafana | 10 | 10 | 0 | 0 | 14 | 10 | 30 | 14 |
| cursor-keycloak | 10 | 10 | 0 | 0 | 8 | 10 | 10 | 8 |
| cursor-discourse | 10 | 10 | 0 | 0 | 22 | 10 | 10 | 22 |
| copilot-sentry | 15 | 10 | 5 | 0 | 33 | 20 | 0 | 33 |
| copilot-cal_dot_com | 10 | 10 | 0 | 0 | 49 | 20 | 0 | 49 |
| copilot-grafana | 10 | 10 | 0 | 0 | 24 | 10 | 21 | 24 |
| copilot-keycloak | 10 | 10 | 0 | 0 | 35 | 19 | 0 | 35 |
| copilot-discourse | 10 | 10 | 0 | 0 | 39 | 10 | 0 | 39 |

Author logins counted (all five repos): Greptile `greptile-apps[bot]` 112; CodeRabbit
`coderabbitai[bot]` 125; Augment `augmentcode[bot]` 92; Cursor `cursor[bot]` 77; Copilot
`Copilot` 180. Every counted comment in every fork was by that one login per tool (for Cal.com
the script reported only that no other login appeared). "Counted (all PRs)" includes the
unmatched pull requests; the score tables count only mapped ones.

## Changed files by extension (from saved file names, Greptile's forks)

Golden index (order in the golden file) · files · `.ts` · `.tsx` · other.

| grafana | files | .ts | .tsx | other | | cal_dot_com | files | .ts | .tsx | other |
|---|---|---|---|---|---|---|---|---|---|---|
| G#1 | 11 | 2 | 0 | 9 | | G#1 | 12 | 11 | 1 | 0 |
| G#2 | 4 | 0 | 0 | 4 | | G#2 | 16 | 7 | 6 | 3 |
| G#3 | 8 | 0 | 0 | 8 | | G#3 | 22 | 21 | 1 | 0 |
| G#4 | 4 | 4 | 0 | 0 | | G#4 | 2 | 2 | 0 | 0 |
| G#5 | 14 | 4 | 9 | 1 | | G#5 | 10 | 5 | 3 | 2 |
| G#6 | 5 | 0 | 0 | 5 | | G#6 | 4 | 4 | 0 | 0 |
| G#7 | 3 | 0 | 0 | 3 | | G#7 | 40 | 38 | 0 | 2 |
| G#8 | 1 | 0 | 0 | 1 | | G#8 | 3 | 1 | 0 | 2 |
| G#9 | 7 | 0 | 0 | 7 | | G#9 | 15 | 6 | 8 | 1 |
| G#10 | 5 | 0 | 0 | 5 | | G#10 | 17 | 9 | 3 | 5 |
| total | 62 | 10 | 9 | 43 | | total | 141 | 104 | 22 | 15 |

## Spend

Ledger total before $9.29182, after $9.52103: 212 judge calls (Super), all HTTP-OK with usage
reported, 0 retries (every judged pull request took one call), 0 JUDGE_FAILED; $0.22921;
350,532 input and 137,836 output tokens. Pull requests with no counted comment were scored
without a call (FN for their golden comments).
