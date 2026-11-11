# Runbook F1: the freeze (`review-freeze-3`) and the predictions

For artu1 (does it), codex (freeze check, held-out side), Sunny (go). Planner A, 2026-11-11.
Plan: [`plan-v2`](../plan/2026-11-11-plan-v2.md) §6. Protocol: `docs/eval/ts-protocol.md` §11–§12 (Planner B's; where
it and this runbook differ, the protocol wins and the difference is reported). Cost: $0.

After F1, artu1 and bunny change no reviewer code, no prompt, no flag and no scoring rule until the held-out score
files are hashed. F1 is finished only when every box below is ticked; a box that cannot be ticked stops the freeze.

## 1. Before tagging: everything that must already be true
| # | check | how | who |
|---|---|---|---|
| 1 | R2's gate has a verdict (PASS, FAIL with the revert done, or NOT RUN as a replay) | `docs/bench/ts-dev.md`; `docs/specs/R2.md` §3 | artu1 |
| 2 | Decision 077 names the candidate arm, attempts, K, and the H1 cap | `docs/decisions.md` 077 | artu1 |
| 3 | `docs/eval/ts-protocol.md` is on `main` and every row of its §12 "pre-freeze slots" is filled: CodeRabbit's measured rate and the trigger schedule, the 72-hour window in UTC, the tool logins and the terminal-review evidence rule, the caps | read §12; no "FILL", "pending" or "proposed" remains outside the predictions table | artu1, Planner B |
| 4 | The re-trigger collision (plan-v2 R-1) has a recorded ruling, and the schedule in `docs/runbooks/H1-window.md` §3 matches it | `docs/decisions.md`; if H1's runbook still says "assumption", it is not ruled | artu1 |
| 5 | Sunny has confirmed the window dates and the hand-check sitting (S0.6) | written in `docs/decisions.md` 078 | Sunny |
| 6 | `scripts/testset/tools.json` (from S1), `scripts/testset/strip.json` (from P1's dev comments), the 076a policy file exist on `main` | `ls scripts/testset` | artu1 |
| 7 | Greptile: credits ≥ 29 + the number of re-triggers the schedule allows for (at least 35), all inside one credit period that covers the whole window | Sunny reads the dashboard; number and reset date written into 078 | Sunny |
| 8 | CodeRabbit and Greptile apps are installed on the four forks only; Greptile "Automatic reviews: Never"; Actions off on the four forks | `docs/live-setup.md` §1–3 commands | Sunny, artu1 |
| 9 | Fork default branches are still the pre-2026-07-01 snapshot commits of `.agents/STATE.md` (medusa `5296f51`, twenty `1df0069`, payload `1734efc`, bullmq `c2c3d1d`) | `gh api repos/SunnyBagal/<f>/branches/<default> --jq .commit.sha` | artu1 |
| 10 | Money: unspent ≥ H1 cap + $0.40 (H2) + $3.00 (reserve); last console ÷ ledger ratio ≤ 1.08 | `docs/budget.md` log | artu1 |
| 11 | No dev PR, dev comment or dev result is going to change: P1's collection is done and hashed | `run/out/artu1.dev-coderabbit.md` | artu1 |

## 2. The tag
1. `cd ~/Projects/TraceHound && git status` is clean on `main`; `git pull --rebase`; HEAD is the commit R2 ran from
   (or the revert commit after an R2 FAIL). If it is not, stop: the frozen code would not be the code R2 measured.
2. Gates in a plain shell (`env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'`
   prints nothing): `pnpm test`, `pnpm typecheck`. Record the three test counts.
3. Write `docs/bench/ts-freeze.md` (§3 below), commit, push. (`docs/freeze.md` belongs to `eval-freeze-2`; do not edit it.)
4. `git tag -a review-freeze-3 -m "TS held-out run: <candidate arm>, attempts <2|3>, decision 078" && git push origin review-freeze-3`.
5. `git rev-parse review-freeze-3^{commit}` equals the commit written in `ts-freeze.md`.

## 3. `docs/bench/ts-freeze.md`: what it must list
| item | value comes from |
|---|---|
| commit and tag | step 2 |
| candidate arm; attempts; comment cap 15 | decision 077 |
| model ids: reviewer and verifier `nvidia/Nemotron-3.5-Super-VL`; judges `bench-judge-v1` (default model of `bench score`, reasoning on) and `bench-judge-x1` (`Qwen/Qwen3-235B-A22B-Instruct-2507`, reasoning off) | `scripts/run-tracehound.ts:69` (`ACTION_DEFAULTS`); `scripts/bench/run-test-set.ts:105-109` |
| prompt sha256: review-diff-v1, review-ctx-v1, verify-ctx-v1 | the `prompts` field of any R2 record (`scripts/run-tracehound.ts:484-485`) |
| the exact runner line | `docs/specs/R2.md` §2, with `<manifest> <clone> <ids> <out-dir> <run cap>` left as the only placeholders |
| case cap $0.40; H1 job cap; the rolling batch rule; the reserve rule for unstarted cases | decisions 076a, 077 |
| sha256 of: `scripts/run-tracehound.ts`, every file in `scripts/testset/`, `tools.json`, `strip.json`, the policy file, `docs/eval/ts-protocol.md`, `config/prices.json`, `pnpm-lock.yaml` | `shasum -a 256 <files>` |
| the hand-check seed (an integer chosen now: the tag date as `YYYYMMDD`) | this runbook |
| the frozen PR order: repositories medusa, payload, twenty, bullmq; manifest order inside each; positions 1–29 | plan-v2 F-b |
| the trigger schedule (file and sha256) | protocol §7, `H1-window.md` §3 |
| node and pnpm versions | `node -v`, `pnpm -v` |

## 4. Held-out side (codex only; artu1 and bunny do not see these files)
1. Private directory: `HO=~/Projects/tracehound-ho-window` (created by codex; artu1 adds it to the firewall list in
   `.agents/STATE.md` and `AGENTS.md` before F1).
2. `git -C ~/Projects/TraceHound worktree add ~/Projects/th-h1 review-freeze-3` (detached at the tag). H1 and H2 run
   from this worktree only.
3. Goldens: `node scripts/testset/build-goldens.ts --side heldout --heldout-ok --manifest <held-out manifest> --labels <held-out label files, in the order of record> --overlay <held-out multifile overlay> --repos <held-out clones> --out $HO/goldens`.
   Expected counts: **29 cases, 20 bug, 9 clean, 1 alternate** (`run/out/codex.kit-review.md`). A preflight refusal
   stops the freeze; it is reported blind (count and kind, no case detail) and Sunny rules.
4. Runner dry run, per repository, no `--execute`: 4 invocations (medusa 8, payload 10, twenty 10, bullmq 1; the
   counts are from the planning brief and are confirmed here). Expected: 29 cases planned in total, 0 refusals, clone
   complete (no lazy fetch needed).
5. `open-prs.ts` dry run per repository: 29 PRs would be opened; none targets a default branch.
6. Hashes: `shasum -a 256` of the held-out manifest, label files, overlay, `$HO/goldens/*` into `$HO/hashes.freeze.txt`;
   codex commits **only the sha256 of that file** and the counts above, in `run/out/codex.ho-freeze.md`.
7. codex's freeze check (GO or NO-GO in the same file): §1 rows 1–11 re-read; `docs/specs/B1-review.md` and
   `docs/specs/B2.md` §8 re-run on the tag; `ts-freeze.md`'s hashes recomputed and equal.

## 5. Predictions (decision 078; committed and pushed before the first held-out action)
artu1 writes them, Sunny reads them. Each field gets a number or the words "no quantitative prediction"; nothing is
filled in later. Fields (protocol §11):
1. TraceHound bugs caught of 20, as a range.
2. CodeRabbit's and Greptile's bugs caught of 20, as ranges; expected discordant counts for each pair.
3. Comments per PR for each tool; comments on the 9 clean cases; completion (reviews delivered of 29) per tool.
4. TraceHound cost per PR and total; failed chunks; empty cases.
5. Which pairs will reject at α = 0.05 (expected: none; say so if that is the prediction) and the assumption behind it.
Basis to cite: dev runs 1 and 2 (`docs/bench/ts-dev.md`), CodeRabbit's dev row, and the power table of plan-v2 §2.
078 also records: the claim wording for each outcome (`docs/runbooks/W1-writeup.md` §3, copied), the window's UTC
start and end, the Greptile credit reading, and the sha256 of `ts-freeze.md`.

## 6. Go
Sunny writes "go" for the window in `docs/decisions.md` 078 (or tells artu1, who records it with the date). Without
it H1 does not start, whatever the calendar says.

## 7. The three most likely ways to get this wrong
1. **Tagging a commit R2 did not run.** A doc-only commit after R2 is fine; a code commit is not. Compare
   `git diff --stat <R2's commit> review-freeze-3 -- packages scripts config` : it must be empty.
2. **Leaving a slot "pending" and deciding it during the window.** Every choice made after the first held-out PR opens
   is a choice made with knowledge of outcomes. An unfilled slot stops the freeze.
3. **Freezing while dev is still moving.** If `strip.json`, `tools.json` or the schedule change after the tag, the
   hashes in `ts-freeze.md` are wrong and the run is disputable. Change them before the tag or not at all.
