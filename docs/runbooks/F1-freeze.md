# Runbook F1: the freeze (`review-freeze-3`) and the predictions

For artu1 (does it), codex (freeze check, held-out side), Sunny (go). Planner A, 2026-11-11; brought to decision 076d and
to decision 076e with its addendum on 2026-11-13.
Plan: [`plan-v2`](../plan/2026-11-11-plan-v2.md) §6. Protocol: `docs/eval/ts-protocol.md` §11–§12 (codex's file,
`AGENTS.md` "Who owns which files"; where it and this runbook differ, the protocol wins and the difference is
reported). Cost: $0.

After F1, artu1 and bunny change no reviewer code, no prompt, no flag and no scoring rule until the held-out score
files are hashed. F1 is finished only when every box below is ticked; a box that cannot be ticked stops the freeze.

## 1. Before tagging: everything that must already be true
| # | check | how | who |
|---|---|---|---|
| 1 | R2's gate has a verdict (PASS, FAIL with the revert done, or NOT RUN as a replay) | `docs/bench/ts-dev.md`; `docs/specs/R2.md` §3 | artu1 |
| 2 | Decision 077 names the candidate arm, attempts, K, and the H1 cap | `docs/decisions.md` 077 | artu1 |
| 3 | `docs/eval/ts-protocol.md` is on `main` and every row of its §12 "pre-freeze slots" is filled: CodeRabbit's measured rate and the trigger schedule, the 72-hour window in UTC, the tool logins and the terminal-review evidence rule, the caps | read §12; no "FILL", "pending" or "proposed" remains outside the predictions table | artu1, codex |
| 4 | The re-trigger collision (plan-v2 R-1) has a recorded ruling, and the schedule in `docs/runbooks/H1-window.md` §3 matches it | `docs/decisions.md`; if H1's runbook still says "assumption", it is not ruled | artu1 |
| 5 | **The window dates and the hand-check sitting (S0.6) are ruled: decision 076e item 7, option B.** Scheduled T0 Sun 22 Nov 2026, 10:00 IST (04:30 UTC); snapshot Wed 25 Nov, 10:00 IST; hand-check Wed 25 Nov, 16:00–19:00 IST. If S1 did not run on 13 Nov, all three move day for day. To pass: 078 states the three dates actually used, they follow that rule from the day S1 ran, and row 7b holds for the scheduled T0 | `docs/decisions.md` 076e and 078; S1's date in `run/out/artu1.smoke.md` | Sunny, artu1 |
| 6 | `scripts/testset/tools.json` (logins from S1; `notCompletion` lists final after P1: rate-limit, error, "in progress", "review skipped", "paused" and similar messages, each pattern with the saved exact text it was written from, `docs/specs/B2.md` §5.3; decision 076d item 2), `scripts/testset/strip.json` (from P1's dev comments), and the two policy files (`policy.076a.json`; `policy.076c.json` with the registered pairs and the floor of 15, used by H2) exist on `main` | `ls scripts/testset` | artu1 |
| 7 | Greptile: credits ≥ 29 + the number of re-triggers the schedule allows for (at least 35), all inside one credit period that covers the whole window | Sunny reads the dashboard; number and reset date written into 078 | Sunny |
| 7b | CodeRabbit allowance (decision 076b item 3): P1's rate at its end is not below its rate at its start, **or** the window's T0 is at least 7 days after P1's last review | `run/out/artu1.dev-coderabbit.md` item 7; T0 in 078 | artu1 |
| 8 | CodeRabbit and Greptile apps are installed on the four forks only; Greptile "Automatic reviews: Never"; Actions off on the four forks | `docs/live-setup.md` §1–3 commands | Sunny, artu1 |
| 9 | Fork default branches are still the pre-2026-07-01 snapshot commits of `.agents/STATE.md` (medusa `5296f51`, twenty `1df0069`, payload `1734efc`, bullmq `c2c3d1d`) | `gh api repos/SunnyBagal/<f>/branches/<default> --jq .commit.sha` | artu1 |
| 10 | Money: unspent ≥ H1 cap + $0.40 (H2) + $3.00 (reserve, which also holds the canary's $0.40, 076b item 4); last console ÷ ledger ratio ≤ 1.08 | `docs/budget.md` log | artu1 |
| 11 | No dev PR, dev comment or dev result is going to change: P1's collection is done and hashed | `run/out/artu1.dev-coderabbit.md` | artu1 |
| 12 | **Zero-comment reviews (premortem gap G1; decision 076c items 2, 3, 8).** The rule is fixed: a review is completed if the tool's bot posted any review object, inline comment or issue comment after the trigger, except a rate-limit or error message; such a PR is never re-triggered. To pass: (a) S1's report has Greptile's line from the clean dev case and P1's report has CodeRabbit's line from the clean dev cases, each naming the object that marks a zero-comment completion; (b) the dev collection made with the frozen `tools.json` shows those same cases as `completed`; (c) **decision 076d item 2:** "in progress", "review skipped", "paused" and similar messages are not completed reviews. For every such message S1 or P1 saw, the exact text is saved, a `notCompletion` pattern exists, and codex has checked the pattern both ways: it matches its saved text, and it matches none of the walkthrough, summary or "no issues" bodies in the dev raw files (`docs/specs/B2.md` §5.3 point 2). A kind that is none of the named ones and not plainly similar has Sunny's recorded ruling. **Stop** if a tool's clean-case review left no object at all (a zero-comment review would then look like no review), if a pattern fails either check, or if such a kind has no ruling | `run/out/artu1.smoke.md`, `run/out/artu1.dev-coderabbit.md` items 5 and 2; the dev `<tool>.status.json` and `<tool>.collection.json`; `docs/decisions.md` | artu1 |
| 13 | **The hand-checker's inbox and dashboards (gap G2).** Before T0 Sunny unsubscribes from the four forks (Unwatch → Ignore on each) and filters GitHub mail from them; the PRs and trigger comments are made from his login (`OWNER` in `tracehound-testset/scripts/open-prs.ts`), and GitHub subscribes a user to conversations they opened or commented on (https://docs.github.com/en/subscriptions-and-notifications/concepts/about-notifications). He opens no CodeRabbit or Greptile dashboard and no fork PR page from T0 until his filled sheet is hashed (`H2-scoring.md` §6.1). The Greptile credit reading of row 7 is therefore taken **before T0 only** | both sentences written into decision 078, with the time he unsubscribed | Sunny |
| 14 | **The hourly clock (gap G4; decision 076c item 11, amended by 076d item 3).** The slots run from **bunny's window scheduler**, detached, with its own log, not from an agent's session: `scripts/testset/window-scheduler.ts` (`b5-window-scheduler` @ `2c51913`, merged at `4b99fb4`; codex's GO names `2c51913`). To pass: (a) codex's 8-slot rehearsal **on that head** has its final result: `run/out/codex.076d-r3.done` exists, and the report says all 8 real hourly dev slots were assessed (no `--execute`), at most one slot was late by 30 minutes or more, and the scheduler was killed and restarted after slot 0 with that slot in the log once (last slot planned for 2026-11-13T04:26:39Z). The row passes on that final result, not on the code GO; (b) the scheduler file at the tag has the sha256 of the reviewed head (`b13f0a10…c717` at `2c51913`), or a later head has its own GO on its full sha and its own rehearsal; (c) the window's plan values are those of `H1-window.md` §3 (`firstSlot` 0, `retriggerFromSlot` 29, `lastSlot` 63, `firstTriggerAttempts` 2, the `--execute` floors), and `window-scheduler.ts --list --execute` over a 29-row case list prints 64 slots and "EXECUTE plan check passed"; (d) grok has read `H1-window.md` §2–§3 against the scheduler's header and reports no difference; (e) **S1's run of this scheduler with `--execute`** (decision 076e item 1; `docs/specs/S1.md` steps 2–5) ended with both slots `done`, no `missed` slot, one `fork-branches` record before each trigger, and durations that project under `H1-window.md` failure 17's line: longest open + 29 × (longest branch read + longest trigger) is at most 900 s, or Sunny's ruling on a slower run is recorded (`H1-window.md` §3, `timeoutSeconds`). The earlier rehearsal of `run/out/codex.rehearsal.py` is evidence for that script only (076d item 3). More than one slot late by 30 minutes, no restart evidence, or a scheduler head without a GO: stop. **Known and not closed by this row:** the rehearsal is a dry run, so the window is the scheduler's first run with `--execute` (`H1-window.md` §3) | `run/out/codex.076d-r3.{md,done}`, `run/out/codex.076d-r3-rehearsal/`; the scheduler's path and sha256 and the plan values in `ts-freeze.md`. State on 2026-11-12 23:26 UTC: 3 of 8 slots done, each with delay 0 s, 2 starts, 0 missed, no `.done` yet | codex |
| 15 | **Models still served (gap G11).** A models-list read (`TokenFactoryClient.listModels()` in `packages/analyzer/src/llm/client.ts`, "GET /models — free", through the same client configuration the runner uses) shows the three frozen ids: `nvidia/Nemotron-3.5-Super-VL`, `nvidia/nemotron-3-super-120b-a12b` (`SUPER_MODEL` in `packages/analyzer/src/bench/judge.ts`), `Qwen/Qwen3-235B-A22B-Instruct-2507`. Repeated at T0 − 24 h (`H1-window.md` §1). One missing: the tag is not made, or the window does not open | three "present" lines in codex's freeze report; no key printed | codex |
| 16 | **Case branches that carry another case's fix (gap G16 a; decision 076d item 1, its correction and addendum e).** Ruled; no case is excluded. The counts (`run/out/grok.ancestry.md`, `run/out/grok.076d.md`): 11 of the 20 held-out starting fixes are an ancestor of another case's base on the same fork (6 reach only a dev base, 2 only a held-out base, 3 both); a different count, 5 of the 29 held-out bases, contain another case's fix (the two are not the same set). **The row passes because exposure at first review is 0 of 20** under rules 1b and 1c (codex and grok, each on its own). To pass, all of: (a) the dev case branches are gone: the end lines of `scripts/testset/delete-dev-branches.ts` (`docs/specs/P1.md` §3b; decision 076e item 5) show `case-branches=0 open-prs=0` for each of the four forks in P1's report **and again now** (its dry run into a new `--out`, which deletes nothing; before T0 only); (b) codex has built the held-out case list in base-date order (the rule is in `H1-window.md`, "Positions"; the list and its sha256 stay on the held-out side) and grok has re-run the exposure count **on that list**: exposed at first review 0 of 20, plus the number that can become exposed at a re-trigger (reported; at most 5 by the split); (c) codex's private per-bug exposure file for the first review is frozen and its sha256 is in `ts-freeze.md`. **A re-count above 0: stop; Sunny rules again** (item 1f); excluding cases is considered only then | `run/out/artu1.dev-coderabbit.md` item 9; the four lines re-run; grok's count file (counts only); `ts-freeze.md` | grok, codex, artu1 |
| 17 | **Nothing ruled is still unbuilt (decisions 076c, 076d and 076e with its addendum, "Touches").** `.agents/STATE.md`'s open list of 076b, 076c, 076d and 076e Touches is empty: every file that stated an old rule has its owner's commit on `main`. In particular: the kit merges are ancestors of the tag commit (`b6-scorer-pairs` @ `82b65e4`, which holds `b4-076c` @ `85ade2f`: collector, guess column, scorer statuses, registered pairs, the floor of 15, the exposed / unexposed split; `b7-collector-never-opened` @ `b696231`; `b5-window-scheduler` @ `2c51913`); the re-trigger mode of `open-prs.ts` is on the testset repo's `main` (`060c644`) and no hand-typed `gh` re-trigger line is left in `H1-window.md` or `P1.md`; `docs/eval/ts-protocol.md` on `main` is a revision that carries 076d with addendum (e) and the correction, and 076e items 2–4: **revision 9, `5b812d4`** (it replaced revision 8, `1a60db5`, which had grok's NO-GO; grok's GO on `5b812d4` is `run/out/grok.protocol-rev9.md`; on `main` since merge `4d7d159`); `docs/eval/tag-worktree.md` is on `main` on a sha with grok's GO: **`775c3d6`** (it replaced `ffb615b`, which had grok's NO-GO for one sentence about the spend freeze; grok's GO on `775c3d6` is `run/out/grok.tag-worktree-r2.md`; on `main` since merge `64a23a4`), and this runbook, `H1-window.md` and `H2-scoring.md` cite `775c3d6`. To pass, the first line of each of those two GO files names that full sha and both commits are ancestors of the tag commit (both held on `main` at `e4f4d18`, 2026-11-13); `scripts/testset/delete-dev-branches.ts` (decision 076e item 5, addendum a) and `scripts/testset/tools.s1.json` (addendum b) are on `main` with codex's GO, and `P1.md` §3b holds no hand-typed delete refspec; `tools.json` has its final `notCompletion` lists, frozen after P1 (`docs/specs/B2.md` §5.3); bunny's L2 redraw tool and the held-out overlay, both on 076c's list, are done or recorded as not needed. One of these open: stop | `.agents/STATE.md`; `for c in 82b65e4 b696231 2c51913; do git merge-base --is-ancestor $c HEAD \|\| echo MISSING $c; done` prints nothing; `git -C ~/Projects/tracehound-testset merge-base --is-ancestor 060c644 HEAD`; `git -C ~/Projects/tracehound-testset status --short -- scripts` prints nothing (an explicit path: decision 076e addendum d); `grep -c 'gh pr comment' docs/runbooks/H1-window.md docs/specs/P1.md` prints 0 for both; `for c in 775c3d6 5b812d4; do git merge-base --is-ancestor $c HEAD \|\| echo MISSING $c; done` prints nothing; `head -1` of the two GO files; `ls scripts/testset/delete-dev-branches.ts scripts/testset/tools.s1.json`; `grep -c 'ffb615b' docs/runbooks/H1-window.md docs/runbooks/H2-scoring.md` prints 0 for both | artu1, codex |

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
| sha256 of `docs/runbooks/H1-window.md` and `docs/runbooks/H2-scoring.md` (they hold the trigger and re-trigger rules, the re-trigger command and the hand-check's definition of "same bug"; question U10, decision 076c item 5), and the `tracehound-testset` commit that holds `scripts/open-prs.ts` with its re-trigger mode (premortem gap G9) | `shasum -a 256`; `git -C ~/Projects/tracehound-testset rev-parse HEAD` |
| the tag worktree's binding to the main spend state: the commit of `docs/eval/tag-worktree.md` used (`775c3d6`, on `main` since merge `64a23a4`), the verifier's output line (ledger total, hard stop, `envSha256`), the list of the worktree's untracked links; and the window scheduler (`scripts/testset/window-scheduler.ts`, its sha256, the commit `2c51913` or a later reviewed head), the plan values of `H1-window.md` §3 (slots 0–63, 3600 s, grace 1800 s, two tries, the four timeouts; rulings of decision 076e item 2), the rehearsal's final result and the result of S1's `--execute` run | §4.2; §1 row 14 |
| sha256 of: `scripts/run-tracehound.ts`, every file in `scripts/testset/`, `tools.json`, `strip.json`, the policy file, `docs/eval/ts-protocol.md`, `config/prices.json`, `pnpm-lock.yaml` | `shasum -a 256 <files>` |
| the hand-check seed (an integer chosen now: the tag date as `YYYYMMDD`) | this runbook |
| the frozen PR order (decision 076d item 1c; it replaces "medusa, payload, twenty, bullmq, manifest order inside each"): the **rule** in words (all 29 cases in one list by the committer date of the base commit, earliest first, ties by case id; decision 076e item 2, the same in `H1-window.md` "Positions" and the protocol's §7), and the **sha256** of codex's case list and of its first-review exposure file. The list itself is not in the repository | `H1-window.md` "Positions"; §1 row 16; codex, held-out side |
| the trigger schedule (file and sha256) | protocol §7, `H1-window.md` §3 |
| node and pnpm versions | `node -v`, `pnpm -v` |

## 4. Held-out side (codex only; artu1 and bunny do not see these files)
1. Private directory: `HO=~/Projects/tracehound-ho-window` (created by codex; artu1 adds it to the firewall list in
   `.agents/STATE.md` and `AGENTS.md` before F1).
2. **The worktree at the tag, bound to the main checkout's spend state (premortem gap G8; decision 076c item 9).**
   H1 and H2 run from this worktree only. The mechanism is codex's command set, `docs/eval/tag-worktree.md` at
   `775c3d6` (on `main` since merge `64a23a4`; grok's GO in `run/out/grok.tag-worktree-r2.md`). Against `ffb615b`,
   the sha this runbook cited before, that commit changes one line of the file, the opening sentence about the spend
   freeze; the commands and the verifier are the same, and their dry run is the one reported in
   `run/out/codex.tag-worktree.md`. F1 runs the file as it is on `main` and writes its commit into `ts-freeze.md`.
   ```sh
   git -C ~/Projects/TraceHound worktree add --detach ~/Projects/th-h1 review-freeze-3
   export TH_MAIN=~/Projects/TraceHound TH_TAG=~/Projects/th-h1
   # then the two node blocks of docs/eval/tag-worktree.md, unchanged: the setup block once, the verifier block after it
   ```
   - **Setup block (once):** makes `.env` and `.tracehound/spend.jsonl` in the worktree symbolic links to the main
     checkout's files, and the four `node_modules` directories links to the main installation. An existing destination
     that points elsewhere refuses; nothing is overwritten. It prints "state and dependency links ready; no provider call".
   - **Verifier block (now, at T0 − 24 h, and before every paid job of H1 and H2):** exits 0 and prints one JSON line
     with `samePhysicalLedger: true`, `envSame: true`, `trackedClean: true`, the same `ledgerUSD` for `main` and
     `worktree`, and a `hardStopUSD` in both equal to the `TRACEHOUND_BUDGET_TOTAL_USD` of the main `.env`. It refuses
     when a stale budget value is inherited from the shell. Only money totals and the `.env` file's sha256 are printed.
   - **This replaces the first version of this step:** no `pnpm install` in the worktree, no copy of `.env`, and no
     copy-and-merge of the ledger. One physical ledger means H1's spend is in the ledger artu1 reads as it happens.
   - **Commands from the worktree load the environment explicitly:** `node --env-file=.env scripts/run-tracehound.ts …`
     and `node --env-file=.env packages/analyzer/src/spend.ts` (the spend entry point loads no `.env`, and the runner
     loads its own only when no key is inherited; `docs/eval/tag-worktree.md`, last section). `H1-window.md` and
     `H2-scoring.md` use these forms.
   - **Untracked links are listed** in `ts-freeze.md` (`git -C $TH_TAG status --porcelain --untracked-files=all`): the
     runner's `tracehound.dirty` flag looks at tracked files only (`tracehoundHead()` in `scripts/run-tracehound.ts`),
     so a clean tracked tree does not show them.
   - **Two things the command set leaves to this runbook (Planner A's additions; codex confirms or corrects):**
     (i) the worktree's path is `~/Projects/th-h1`, not the document's example `/private/tmp/tracehound-h1-tag`: the
     system may empty `/private/tmp` during a 72-hour window (estimate; not checked on this machine);
     (ii) the worktree runs on the **main checkout's** installed dependencies, so from this step until H2's commit
     nobody runs `pnpm install`, `pnpm add` or `pnpm update` in the main checkout, and
     `git -C $TH_MAIN diff --quiet review-freeze-3 -- pnpm-lock.yaml` exits 0 here and at T0 − 24 h. The same holds for
     the main `.env`: it is not edited while a held-out job runs.
3. Goldens: `node scripts/testset/build-goldens.ts --side heldout --heldout-ok --manifest <held-out manifest> --labels <held-out label files, in the order of record> --overlay <held-out multifile overlay> --repos <held-out clones> --out $HO/goldens`.
   Expected counts: **29 cases, 20 bug, 9 clean, 1 alternate** (`run/out/codex.kit-review.md`). A preflight refusal
   stops the freeze; it is reported blind (count and kind, no case detail) and Sunny rules.
4. Runner dry run, per repository, no `--execute`: 4 invocations (medusa 8, payload 10, twenty 10, bullmq 1; the
   counts are from the planning brief and are confirmed here). Expected: 29 cases planned in total, 0 refusals, clone
   complete (no lazy fetch needed).
5. `open-prs.ts` dry run per repository: 29 PRs would be opened; none targets a default branch. **Dry run only, here
   and always:** with `--execute` this command pushes every case of a repository at once, which decision 076d item 1c
   forbids. In the window only the scheduler pushes, one case per slot (`H1-window.md` §3).
5b. **The case list, the exposure count and the slot table (decision 076d items 1c, 1f, 3).** codex builds the case
   list by the base-date rule and prints three numbers (29 rows, 0 adjacent pairs out of order, the number of ties);
   grok recomputes them and re-runs the exposure count on that list (§1 row 16 b). Then, with a plan file whose `t0` is
   the scheduled T0 of decision 078: `window-scheduler.ts … --list --execute` prints 64 slots, the first at the scheduled T0
   (§1 row 14 c). The sha256 of the list and of the first-review exposure file go into `run/out/codex.ho-freeze.md`.
6. Hashes: `shasum -a 256` of the held-out manifest, label files, overlay, `$HO/goldens/*` into `$HO/hashes.freeze.txt`;
   codex commits **only the sha256 of that file** and the counts above, in `run/out/codex.ho-freeze.md`.
7. **A second pair of eyes on the held-out side (gap G7).** grok, who may read held-out, recomputes on its own the
   sha256 of the manifest, the label files, the overlay and `$HO/goldens/*` and reports only "equal to
   `hashes.freeze.txt`: yes / no" and the four counts (29, 20, 9, 1) in `run/out/grok.ho-freeze-check.md`. "No" stops
   the freeze.
8. codex's freeze check (GO or NO-GO in the same file): §1 rows 1–17 re-read; `docs/specs/B1-review.md` and
   `docs/specs/B2.md` §8 re-run on the tag; `ts-freeze.md`'s hashes recomputed and equal.

## 5. Predictions (decision 078; committed and pushed before the first held-out action)
artu1 writes them, Sunny reads them. Each field gets a number or the words "no quantitative prediction"; nothing is
filled in later. Fields (protocol §11):
1. TraceHound bugs caught of 20, as a range.
2. CodeRabbit's and Greptile's bugs caught of 20, as ranges; expected discordant counts for each of the two
   registered pairs (TraceHound vs CodeRabbit, TraceHound vs Greptile; decision 076c item 4).
3. Comments per PR for each tool; comments on the 9 clean cases; completion (reviews delivered of 29) per tool.
4. TraceHound cost per PR and total; failed chunks; empty cases.
5. Which of the **two registered pairs** will reject (expected: none; say so if that is the prediction) and the
   assumption behind it. 078 names the two tests in these words: "TraceHound vs CodeRabbit and TraceHound vs Greptile,
   each an exact two-sided sign test at 0.05, uncorrected for two tests, exact p-values reported; CodeRabbit vs
   Greptile: counts only" (076c item 4). No prediction is made, and no test is run, on CodeRabbit vs Greptile or on a
   secondary arm.
6. The size of the hand-check sheet: the number of items expected, from the dev sheet count of `docs/specs/E1.md` §1
   step 4 scaled to 20 bugs and three tools, and Sunny's minutes per item (gap G14). If items × minutes is over 3 hours,
   Sunny says before the tag whether he books a longer sitting; the window is not booked on an unknown sheet.
7. The floor for a test sentence (gap G10), **fixed by decision 076c item 6: 15.** A pair with fewer than 15 of the
   20 bug cases reviewed by both tools is reported as counts, with no test sentence (`W1-writeup.md` §3.2). 078 copies
   the number; it is not a prediction and is not chosen again. "Reviewed by both" for a pair = bug cases where
   TraceHound's official record has `status: "ok"` and the other tool's collector status is `completed`; a TraceHound
   case that is a miss by rule (failed twice, unstarted) stays in the pair's n but is not a reviewed case.
Basis to cite: dev runs 1 and 2 (`docs/bench/ts-dev.md`), CodeRabbit's dev row, and the power table of plan-v2 §2.
078 also records: the claim wording for each outcome (`docs/runbooks/W1-writeup.md` §3, copied), the scheduled T0
and the scheduled snapshot in UTC (decision 076e item 7; the window itself runs from T0, the instant the first
held-out PR opens, to T0 + 72 h, and H1 reports both clocks: item 3), the hand-check sitting, that Sunny starts
`caffeinate -is -t 280800` at about 09:00 IST on the day of the scheduled T0 (addendum c), the Greptile credit
reading, and the sha256 of `ts-freeze.md`.

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
