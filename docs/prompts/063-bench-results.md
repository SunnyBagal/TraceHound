# 063: benchmark results page + README benchmark section (docs only, $0)

Tool: relay (Claude Code builder + reviewer). Folder: `~/Projects/TraceHound`. Start it from `~/Projects/tracehound-ops` with `bun src/relay.ts start tracehound briefs/063-bench-results.md`. Set `nebiusCapUsd` to **0** before starting. This job makes no model call.

Decision number: 063. Spend: $0 of Nebius. Make no model call of any kind.

## Step 0: checks (if any check fails, STOP AND REPORT)
- Run `git fetch origin`. `git status --porcelain` must print nothing.
- If the current branch is main, run `git merge --ff-only origin/main`. If it is not main, run `git fetch origin main:main` (no plus sign), then `git switch main`. Do not push, rename or delete the branch you left.
- HEAD must equal origin/main.
- `gh pr view 36 --json state` must show MERGED, and `gh pr view 35 --json state` must show MERGED.
- `grep -c '^## 062' docs/decisions.md` must print 1, and `grep -c '^## 063' docs/decisions.md` must print 0.
- `docs/bench/test-results.md` and `docs/bench/pool-verify.md` must exist.
- `env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'` must print nothing.

## Steps (one commit per step, each with `pnpm test` and `pnpm typecheck` green in a plain shell; messages in the form `area: what changed`)

1. Create the branch `build/063-bench-results`. Save this prompt verbatim as `docs/prompts/063-bench-results.md`. Commit it.

2. Write `docs/bench/results.md`, one page aimed at a hackathon judge. Use counts only, taken from decisions 054–062, `docs/bench/test-results.md` and `docs/bench/pool-verify.md`. Copy every number from those files and invent none. It must contain, in this order:
   1. **What was measured.** Two or three sentences: the golden set, the scorer of record (bench-judge-v1), the report-only second judge (bench-judge-x1), and the fact that the blind test was pre-registered (061) and frozen (`review-freeze-1` → `6b4276e`).
   2. **Blind test, Cal.com run 1.** The headline table under bench-judge-v1: the six reviewers plus review-diff-v1 and pool-raw, with P/R/F and counts. Put the bench-judge-x1 F in a column alongside.
   3. **Rank in every run.** A small table with one row per TraceHound run (Cal.com 1, 2, 3) and one column per judge. Each cell gives pool-verify-v1's F and its rank among the six, against the five tools' single-judged F. Expected values, computed by the planning chat from `test-results.md`, which you must recompute and report if they differ:
      - v1: 3rd, 3rd, 3rd (58.3, 51.3, 52.8, against greptile 50.0).
      - x1: 3rd, 3rd, 5th (58.3, 57.1, 47.3; run 3 is below greptile 55.0 and copilot 50.8).
      - In words: 3rd in 5 of 6 run×judge cells, 5th in one.
   4. **Dev set.** pool-verify-v1's dev F and rank against the tools, run 1 and run 2r, under both judges, against the tools' dev F from 060. Expected values, which you must recompute:
      - run 1: 5th (v1 35.6, x1 44.6);
      - run 2r: 4th (v1 48.0, below greptile 49.3 and above coderabbit 41.0; x1 53.4, below greptile 55.1 and above coderabbit 47.4).
      - Plus the dev spread.
   5. **Predictions (061), scored:** (a) right, (b) wrong, (c) right, each with its numbers.
   6. **Every loss and void run:** prediction (b); dev run 2 void (the session limit killed it) and restarted as 2r; dev run 3 not done (cap); one JUDGE_FAILED; the $0.0113 ledger gap; under x1, review-diff-v1 beats pool-verify-v1 on run 1.
   7. **Limits:** the limits from 061 and 062, verbatim in substance.
   8. **Cost:** per pull request on Cal.com (median about $0.04), and 062's total of $5.31.

   State plainly, in the page's first paragraph:
   - "On the pre-registered blind test, TraceHound ranked 3rd of six under the scorer of record, behind Augment and Cursor, ahead of Greptile, Copilot and CodeRabbit. On the dev set it ranked 5th of six."
   - "Run-to-run spread at temperature 0 is larger than the margins the reviewer was chosen on, so treat single-run ranks as approximate."

   Never write "beats", "outperforms" or "state of the art". Make no claim that goes beyond these tables. Commit.

3. Append decision 063 to `docs/decisions.md` as a **Choice** (docs only). Context: 062. Choice: the results page and its framing. Rejected: a headline claim of beating Greptile, because the spread is larger than the margin and the x1 run 3 rank is 5th. Do not edit any earlier decision. Commit.

4. In `README.md`, add a short section titled `## PR reviewer benchmark` directly after the opening paragraphs, before the first existing `##` section. Keep it to at most 12 lines: the two plain statements from step 2, one compact table (the six reviewers, F on blind run 1 under v1, and dev F), and a link to `docs/bench/results.md`. Do not change any other README line; the README rewrite for judges is a later job. Add one CLAUDE.md line pointing to `docs/bench/results.md`. Commit.

5. Push. Open a PR to main titled `063: benchmark results page (decision 063)`. Wait for CI on the pushed head. Make one fix attempt if CI is red; if it is red a second time, STOP. Never merge the PR.

## Rules
- May touch: `docs/bench/results.md`, `docs/decisions.md` (append only), `docs/prompts/063-bench-results.md`, `README.md` (the new section only), `CLAUDE.md` (one line), and `runs/`.
- Do not touch code, tests, `config/`, `scripts/`, `packages/`, `viewer/`, `snapshots/`, `.github/`, `AGENTS.md`, `pnpm-lock.yaml`, `docs/action/`, `docs/demo/`, `docs/ui/` or `docs/eval/`.
- **Cal.com is blind.** Do not open anything under `~/Projects/tracehound-bench`. Use only numbers already in the repo. No Cal.com titles, paths or comment text, anywhere.
- No tag operations. No destructive git: no forced pushes, no hard resets, no branch deletion, no history rewriting, no amending.
- Stage only by explicit path. Never use `git add -A`, `git add .` or `git commit -a`.
- A dogfood review comment from the TraceHound Action may appear on the PR. Ignore it, don't reply to it, and don't change anything because of it. Report its comment count only.

## STOP AND REPORT (post as a PR comment via a file under `runs/`, then make it your final message)
- The step 0 results.
- The PR number, head sha, CI run and its conclusion.
- The commits, one line each, with the files in each.
- The rank table you computed, and whether it matches the expected values in step 2.
- The README section exactly as added.
- Anything skipped or changed from this brief, and why.
