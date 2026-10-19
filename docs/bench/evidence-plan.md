# Evidence verifier + deterministic gate: plan (decision 065, pre-registered)

Written and pushed before any model call of job 065. Dev only: Cal.com is not opened, run or scored.
Brief: `docs/prompts/065-evidence-gate.md`.

064 showed that one dev run proves nothing: pool-verify-v1's F ranged from 35.6% to 48.0% over five
dev runs at temperature 0. So every comparison here uses the **mean over the same five dev runs**
(1, 2r, 4, 5, 6). The hypothesis: a verifier that has to prove a finding (quote the failing code,
name a concrete failure) plus a deterministic gate that checks the proof raises precision more than
it costs recall.

## The verifier, verify-evidence-v1 (frozen)

- Code: `packages/analyzer/src/review/verify-evidence.ts`, prompt `verify-evidence-prompt.ts`, CLI
  `tracehound verify-evidence`.
- **System prompt sha256 `004be1d682d6a92a1e0ed184772419724be4c58818f25421e7c2ba4482b651a4`**
  (pinned in `packages/analyzer/test/verify-evidence.test.ts`). The user message is verify-ctx-v1's,
  byte-identical (`verifyCtxUserMessage`), with exactly verify-ctx-v1's per-finding context
  (`buildFindingContext` in `verify-context.ts`, unchanged).
- Model `nvidia/nemotron-3-super-120b-a12b` (Super), reasoning on, temperature 0, max_tokens 16,000,
  one call per finding, findings of one pull request four at a time.
- Reply: `{"verdict", "evidence": [{"path", "line", "quote"}], "scenario", "severity", "category"}`.
  A keep needs 1–3 evidence items, each a single non-empty line, and a non-empty scenario. A drop may
  cite nothing (`evidence: []`) and its scenario may be empty: a verifier that cannot quote the
  failing code is told to drop, so demanding a quote on a drop would only turn drops into invalid
  replies. Enums are matched after trimming and lower-casing.
- Invalid reply: retried once (the reply and the reason it was invalid are shown). Still invalid, or
  a failed request: `VERIFY_FAILED`, the finding is kept with no evidence, severity or category, so
  a gate with `--require-evidence` drops it as `evidence-missing`. The count is reported.
- The verifier never checks its own quotes; the gate does (`evidence-mismatch`: the quote's line,
  trimmed, must equal a head-file line, trimmed, within ±3 of the cited line).

## Variants

Each variant is computed on all 5 dev runs, scored with bench-judge-v1 (the scorer of record) and
bench-judge-x1.

- **A, gate-only:** pool-verify-v1's outputs → `tracehound gate` with default options. $0 to compute.
- **B, ev-gate:** pool-raw → verify-evidence-v1 → keep verdict `keep` (and VERIFY_FAILED) →
  `gate --require-evidence --min-severity medium`.
- **B-all (report only):** the same as B, without `--min-severity`.
- **C, contracts (report only):** for each pull request of run 1's list, `tracehound contracts` on its
  merge base and head in the bare repo. Report the finding count per repo and how many the judge maps
  to a golden comment. Run on run 1's list only, since it is deterministic.
- **Baseline:** pool-verify-v1, each run's F and P and the 5-run mean (v1: F 42.3, P 40.5; x1: F 51.3,
  P 50.9).

## Adoption rules (pre-registered, as the brief states them)

Use 5-run means throughout.

- **A is adopted** as a default stage if its mean P is above the baseline's mean P under v1, **and**
  its mean F is at least the baseline's mean F under both v1 and x1. A is deterministic and free; its
  job is to cut noise without losing anything.
- **B is adopted** (it replaces verify-ctx-v1 in the pipeline) if all three hold:
  - its mean F under v1 is at least **3.0 points** above the baseline's;
  - its mean P under v1 is at least **8.0 points** above the baseline's;
  - its mean F under x1 is at least the baseline's.
- If both A and B pass, the pipeline is B, with A's rules applied inside the gate.
- If neither passes, the job is a loss. Report it plainly.

## Definitions fixed here (before the first model call)

- **Runs and inputs** (as `docs/bench/vote-plan.md`). pool-verify-v1: run 1 from
  `<bench>/reviews/pool-verify-v1/super/<repo>/<n>.json`, runs 2r, 4, 5, 6 from
  `<bench>/reviews/dev-repeat/run-<n>/pool-verify-v1/<repo>/<n>.json`. pool-raw: run 1 from
  `<bench>/reviews/pool-raw/super/<repo>/<n>.json`, the others from `run-<n>/pool-raw/`. Pull request
  inputs (title, description, diff) from `<bench>/prs/<repo>/<n>.json`; head and merge base from
  `<bench>/repos/<repo>.heads.json`; bare clones `<bench>/repos/<repo>`.
- **The gate's checkout.** Per pull request, a temporary `git worktree add --detach` of the bare repo
  at the head, removed (`git worktree remove`) after that pull request's gate calls. `--repo` is the
  worktree, `--base` the merge base, `--pr` the pull request input, `--findings` the variant's input
  file. The gate is called through its CLI entry point (`gate/cli.ts`'s `main`), unchanged. The
  gate's kept findings become the variant's review file (path, line, body; order kept).
- **Means.** Per run, counts are summed over the four dev repos and P/R/F micro-averaged; the mean P
  (F) of a variant or the baseline is the plain mean of its per-run P (F). Precision "above" is
  strict; "at least" allows equality (1e-12 tolerance). Margins are in points: 3.0 points = 0.030.
- **Baseline counts.** Each run's own pool-verify-v1 scoring, as in 064: run 1 from
  `<bench>/scores/pool-verify-v1-super-<repo>.summary.json` (v1) and
  `<bench>/scores/judge-x1/…` (x1); the others from `run-<n>/scores/<judge>/pool-verify-v1-<repo>.summary.json`.
- **Scoring.** `scoreRepo` with `LlmJudge` (bench-judge-v1: Super, reasoning on; bench-judge-x1:
  Qwen3-235B, reasoning off; temperature 0), judge cache reads allowed (as in 061 and 064), per
  variant, run and repo. JUDGE_FAILED pull requests are left out and counted. Scoring order: A, B,
  B-all, C; under each variant v1 then x1.
- **Verifier calls** go through a client with response-cache reads off (as 061's reviewer client), so
  each run's verdicts are real, independent calls. A pull request with a failed request (not an
  invalid reply) is verified once more as a whole, and the second result stands (061's rerun rule).
  Order: run 1, 2r, 4, 5, 6; within a run, repos sentry, grafana, keycloak, discourse; pull requests
  in file order; up to three pull requests at a time.
- **Drop log.** For A, B and B-all, every finding a stage removed is listed by rule id: the gate's
  rule ids, plus `verifier-drop` (verdict drop) for B and B-all. For each rule: how many findings it
  dropped and how many of those the judge had scored TP in the source row's own scoring of that run
  (A: that run's pool-verify-v1 detail; B, B-all: that run's pool-raw detail), matched by review file,
  path, line and body. Reported under v1 and x1.
- **Cost per pull request of B.** The verifier's cost for that pull request, and the pipeline cost:
  the two reviewers (review-diff-v1 and review-ctx-v1, from run 1's 059 records and the used attempt
  of runs 2r–6) plus the verifier. Median and max over the 200 run × pull request pairs.
- **Outputs** go to `<bench>/reviews/evidence/` (outside this repo), written with `wx` (never
  overwritten). Docs get counts, rates and three kept example findings from the reviewer's own
  output (dev only; never golden comment text).

## Caps (fixed before the first model call)

- Job Nebius cap $5 (ledger at $23.17 before the job; total cap $45).
- Sub-cap **$4.0 for the verifier** (B's verify-evidence-v1 calls over all five runs). The driver
  sets the process's run cap to $4.0 minus what earlier verifier records already spent.
- Sub-cap **$1.0 for judging** (both judges, all variants), the same way from earlier score files.

## Fallback if the cap stops B (fixed before the first model call)

- A run counts for B only if all 40 of its pull requests have verifier records. The cap stops the
  verifier at a call; that run and later ones are not done.
- B, B-all and the baseline (for B's rule only) are then computed over the runs that finished, with
  means over those runs for both B and the baseline. A keeps all five runs.
- If no run finished, B is not evaluated and only A can be adopted.
- If the judging cap stops scoring, variants not fully scored are reported as not scored (in the order
  above, so C and B-all go first) and the adoption rule applies only to fully scored variants.
