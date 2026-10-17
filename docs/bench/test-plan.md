# The Cal.com test-set run: commands for job 062 (decision 061)

The plan (configuration, rows, scorer, metrics, runs, rerun rule, cap, predictions, limits) is
decision 061 in `docs/decisions.md`. This file lists what 062 runs, in order, and what each
command should print. Every output is counts only. Full records (comment, golden and code text)
stay in `~/Projects/tracehound-bench/` and never enter this repo, a pull request or a message.

## Sunny's manual steps, before 062 starts

1. Merge the 061 pull request first. Its merge commit is the frozen code.
2. Set `nebiusCapUsd` to 15.
3. Check that `TRACEHOUND_BUDGET_TOTAL_USD` in `.env` is at least 52. The client refuses any
   request that would take the ledger total over it.

## Commands, in order

Each command runs from the repo root in a plain shell (no git hook, no `git rebase --exec`), with
`TRACEHOUND_BUDGET_RUN_USD=15` in its environment so the per-process cap does not stop a long run.
The runner still holds each run to its allowance under the $15 cap. Commands that touch Cal.com
also need `TRACEHOUND_TEST_RUN=061`; nothing else sets it.

0. **Freeze.** Tag the merge commit and check the frozen paths:

   ```
   git switch main && git pull --ff-only
   git tag review-freeze-1 <merge commit of the 061 pull request> && git push origin review-freeze-1
   git diff review-freeze-1 HEAD -- packages/analyzer/src scripts/bench config    # must print nothing
   ```

   The runner refuses to start without the tag, when that diff is not empty, or when those paths
   have uncommitted changes.

1. **Cal.com inputs** (no model call):

   ```
   TRACEHOUND_BUDGET_RUN_USD=15 TRACEHOUND_TEST_RUN=061 node scripts/bench/fetch-prs.ts --test-set cal_dot_com
   ```

   Expected: `cal_dot_com: saved 10 · unmatched golden 0 · diff chars min … · median … · max … ·
   coderabbit diff sha256 same <k>/10 …`, then `all: 10 pull requests · diff chars …`. It writes
   `~/Projects/tracehound-bench/test/prs/cal_dot_com/0.json` … `9.json`.

2. **Cal.com bare clone and heads** (no model call):

   ```
   TRACEHOUND_BUDGET_RUN_USD=15 TRACEHOUND_TEST_RUN=061 node scripts/bench/fetch-repos.ts --test-set cal_dot_com
   ```

   Expected: `cal_dot_com: diff matches 10/10 (sha256 exact <k>) · clone <size> MB · <t> s`, then
   `all: diff matches 10/10`. It writes `test/repos/cal_dot_com` and
   `test/repos/cal_dot_com.heads.json`. If this is not 10/10, 062 stops before any model call.

3. **Cal.com run 1, the primary result** (allowance: the whole $15; planned at most $6):

   ```
   TRACEHOUND_BUDGET_RUN_USD=15 TRACEHOUND_TEST_RUN=061 node scripts/bench/run-test-set.ts --set cal_dot_com --run 1
   ```

   stderr gets one line per pull request: `[run-test-set] cal_dot_com run 1: pull request <k>/10
   done · attempts <1|2> · run spend $<x>`. stdout:

   ```
   ## cal_dot_com run 1 (decision 061)

   pull requests 10 · reruns <r> · still with failed requests after the rerun <s>
   cost per pull request: median $<x> · max $<x> · wall time median <t> s · max <t> s
   run spend $<x> of allowance $15.0000

   ### bench-judge-v1 (scorer of record)

   | row | comments | TP | FP | dup | low | FN | JUDGE_FAILED | precision (n) | recall (n) | F |
   |---|---|---|---|---|---|---|---|---|---|---|
   | pool-verify-v1 | … |
   | review-diff-v1 | … |
   | pool-raw | … |
   | greptile | … |
   | coderabbit | … |
   | augment | … |
   | cursor | … |
   | copilot | … |

   ### bench-judge-x1 (report only)

   (the same eight rows)
   ```

   Exit 0 means complete. Exit 2 means stopped at the cap, and every later item is then not done.
   Exit 3 means the run failed and is void (the message is in `test/run-1/run.json`). Exit 1 means
   refused, with nothing written. Records go to `~/Projects/tracehound-bench/test/run-1/`:
   `run.json` (status, spend, per-pull-request cost, time and attempts), `attempts/`,
   `review-diff-v1/`, `pool-raw/`, `pool-verify-v1/` and `scores/judge-v1|judge-x1/`.

4. **Cal.com runs 2 and 3, repeats** (at most $5 together):

   ```
   TRACEHOUND_BUDGET_RUN_USD=15 TRACEHOUND_TEST_RUN=061 node scripts/bench/run-test-set.ts --set cal_dot_com --run 2
   TRACEHOUND_BUDGET_RUN_USD=15 TRACEHOUND_TEST_RUN=061 node scripts/bench/run-test-set.ts --set cal_dot_com --run 3
   ```

   The output has the same shape as run 1, with three rows per table (pool-verify-v1,
   review-diff-v1, pool-raw).

5. **Dev runs 2 and 3, repeats** (at most $4 together; 40 pull requests each):

   ```
   TRACEHOUND_BUDGET_RUN_USD=15 node scripts/bench/run-test-set.ts --set dev --run 2
   TRACEHOUND_BUDGET_RUN_USD=15 node scripts/bench/run-test-set.ts --set dev --run 3
   ```

   Records go to `~/Projects/tracehound-bench/reviews/dev-repeat/run-<n>/`. stdout has
   `pull requests 40 · …` and three rows per table.

6. **Spread** (no model call):

   ```
   TRACEHOUND_BUDGET_RUN_USD=15 TRACEHOUND_TEST_RUN=061 node scripts/bench/spread.ts --set cal_dot_com
   TRACEHOUND_BUDGET_RUN_USD=15 node scripts/bench/spread.ts --set dev
   ```

   For each judge, one row per TraceHound row: `| row | runs done | F run 1 / 2 / 3 | P min /
   median / max | R min / median / max | F min / median / max |`. Dev run 1 is 059's scoring. On
   061's tree, before any repeat, `--set dev` prints pool-verify-v1 `35.6% / not done / not done`
   under bench-judge-v1 and `44.6% / not done / not done` under bench-judge-x1.

The order is enforced: each run refuses to start until every earlier item has run. If a cap stop
happens, every later item is refused with `not done: the cap stopped …`. 062 reports these as not
done.
