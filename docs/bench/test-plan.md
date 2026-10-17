# The Cal.com test-set run: commands for job 062 (decision 061)

The plan (configuration, rows, scorer, metrics, runs, rerun rule, cap, predictions, limits) is
decision 061 in `docs/decisions.md`. This file lists what 062 runs, in order, and what each
command should print. Every output is counts only. Full records (comment, golden and code text)
stay in `~/Projects/tracehound-bench/` and never enter this repo, a pull request or a message.

## Sunny's manual steps, before 062 starts

1. Merge the 061 pull request first ("Create a merge commit"). Its merge commit is the frozen
   code, unless a fetch below needs a fix (then the fix's merge commit is).
2. Set `nebiusCapUsd` to 15.
3. The ledger total plus $15 must fit under `TRACEHOUND_BUDGET_TOTAL_USD`; the $45 default is
   enough at a $12.45 ledger (`pnpm spend` prints the total). The client refuses any request that
   would take the ledger total over it.
4. During 062, nothing else calls Nebius on this key: no UI naming pass, no Action runs on the demo
   or dogfood PRs.

## Commands, in order

Each command runs from the repo root in a plain shell (no git hook, no `git rebase --exec`), with
`TRACEHOUND_BUDGET_RUN_USD=15` in its environment so the per-process cap does not stop a long run.
The runner still holds each run to its allowance under the $15 cap. Commands that touch Cal.com
also need `TRACEHOUND_TEST_RUN=061`; nothing else sets it.

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

   If either fetch fails, 062 stops: a fix goes through a pull request, and its merge commit is
   then the one tagged in step 3. No tag exists yet, so none is ever moved.

3. **Freeze** (after the fetches, before the first model call). Tag the frozen commit with an
   annotated tag, push only that tag, and check the frozen paths:

   ```
   git switch main && git pull --ff-only
   git tag -a review-freeze-1 -m "061 frozen code for the Cal.com run" <sha>
   git push origin review-freeze-1
   git diff review-freeze-1 HEAD -- packages/analyzer/src scripts/bench config    # must print nothing
   ```

   `<sha>` is the merge commit of the 061 pull request (or of the fetch fix, if one was needed).
   The runner refuses to start without the tag, when that diff is not empty, or when those paths
   have uncommitted changes.

4. **Cal.com run 1, the primary result** (allowance: the whole $15; planned at most $6):

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
   Exit 3 means the run failed and is void (the message is in `test/run-1/run.json`); see "If a
   run crashes" below. Exit 1 means refused, with nothing written. Records go to `~/Projects/tracehound-bench/test/run-1/`:
   `run.json` (status, spend, per-pull-request cost, time and attempts), `attempts/`,
   `review-diff-v1/`, `pool-raw/`, `pool-verify-v1/` and `scores/judge-v1|judge-x1/`.

5. **Cal.com runs 2 and 3, repeats** (at most $5 together):

   ```
   TRACEHOUND_BUDGET_RUN_USD=15 TRACEHOUND_TEST_RUN=061 node scripts/bench/run-test-set.ts --set cal_dot_com --run 2
   TRACEHOUND_BUDGET_RUN_USD=15 TRACEHOUND_TEST_RUN=061 node scripts/bench/run-test-set.ts --set cal_dot_com --run 3
   ```

   The output has the same shape as run 1, with three rows per table (pool-verify-v1,
   review-diff-v1, pool-raw).

6. **Dev runs 2 and 3, repeats** (at most $4 together; 40 pull requests each):

   ```
   TRACEHOUND_BUDGET_RUN_USD=15 node scripts/bench/run-test-set.ts --set dev --run 2
   TRACEHOUND_BUDGET_RUN_USD=15 node scripts/bench/run-test-set.ts --set dev --run 3
   ```

   Records go to `~/Projects/tracehound-bench/reviews/dev-repeat/run-<n>/`. stdout has
   `pull requests 40 · …` and three rows per table.

7. **Spread** (no model call):

   ```
   TRACEHOUND_BUDGET_RUN_USD=15 TRACEHOUND_TEST_RUN=061 node scripts/bench/spread.ts --set cal_dot_com
   TRACEHOUND_BUDGET_RUN_USD=15 node scripts/bench/spread.ts --set dev
   ```

   For each judge, one row per TraceHound row: `| row | runs done | F run 1 / 2 / 3 | P min /
   median / max | R min / median / max | F min / median / max |`. A restarted run's F carries
   "(restarted)". Dev run 1 is 059's scoring. On
   061's tree, before any repeat, `--set dev` prints pool-verify-v1 `35.6% / not done / not done`
   under bench-judge-v1 and `44.6% / not done / not done` under bench-judge-x1.

The order is enforced: each run refuses to start until every earlier item has run. If a cap stop
happens, every later item is refused with `not done: the cap stopped …`. 062 reports these as not
done. A crashed run that may still be restarted blocks every later item until it is restarted.

## If a run crashes

A run crashed when it exited 3, or when its process died (check that the process has exited
before going on). Decision 061 allows one restart per run, before any score of it exists:

1. Check the status: `node -e 'console.log(require(process.argv[1]).status)' <run dir>/run.json`
   must print `running` (`<run dir>` is `~/Projects/tracehound-bench/test/run-<n>` for Cal.com,
   `~/Projects/tracehound-bench/reviews/dev-repeat/run-<n>` for dev). `complete` or
   `stopped-at-cap` is not a crash and is never restarted.
2. `ls <run dir>/scores` must print nothing (or report that there is no such directory).
3. Restart it, with the same environment as the run's own command:

   ```
   TRACEHOUND_BUDGET_RUN_USD=15 TRACEHOUND_TEST_RUN=061 node scripts/bench/run-test-set.ts --set cal_dot_com --run <n> --restart
   TRACEHOUND_BUDGET_RUN_USD=15 node scripts/bench/run-test-set.ts --set dev --run <n> --restart
   ```

   It writes `run-<n>r/` and first prints `<set> run <n> (restarted): void run-<n>/ left untouched,
   never scored · spend $<x> (run.json $<x>, ledger since its start $<x>) · stopped at <pull request
   k of N | judging> · error <name>`. Its output then has the run's shape, headed `## <set> run <n>
   (restarted)`. Its result is used whatever it is and stands for run n (run 1r is the headline if
   run 1 was void). The void run's spend counts toward the item, and the restart gets what is left.
4. If any file exists under `<run dir>/scores`, the run is void, with no restart. If the restart
   itself crashes, the run is void, with no further restart. Both are reported as void, and the
   order then goes on.
