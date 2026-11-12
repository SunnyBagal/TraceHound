# Runbook H1: the held-out window, hour by hour

For codex (operator), grok (backup operator). artu1 and bunny do **not** open anything this runbook produces and never
read the operator's pane; they get `run/out/codex.ho-run.md` (counts and spend only). **From T0 until the firewall
lifts, artu1 and bunny also make no `gh` or browser read of pulls, issues or notifications on the four forks**
(decision 076c item 12; `AGENTS.md` "Blindness"): the forks are public, and every tool comment on a held-out PR is
there. Planner A, 2026-11-11; brought to decision 076c on 2026-11-12.
Plan: [`plan-v2`](../plan/2026-11-11-plan-v2.md) §6. Protocol: `docs/eval/ts-protocol.md` §3, §7–§9 (it wins over this
runbook; report any difference). Budget line: **H1**, cap from decision 077 ($3.15 until then); unstarted cases at the
cap run from the reserve (decision 076a "Caps" item 4).

**Ruled since the first version (decision 076b, `docs/decisions.md:3931-3951`):** the re-trigger slots (item 2, §3 below),
the CodeRabbit allowance condition (item 3, §1.3) and the canary with its limits (item 4, §5 failure 9). They are no
longer assumptions. If the frozen schedule in `docs/bench/ts-freeze.md` differs from §3, the frozen schedule is used.
**Ruled in decision 076c (`docs/decisions.md`, "076c", items 2 and 3):** a review is completed if the tool's bot posted
any review object, inline comment or issue comment on the PR after the trigger, except a rate-limit or error message
(issue comments count for completion only, never as comments); a PR is re-triggered only if it has no completed review
24 h after its own trigger, and a completed review with zero comments is never re-triggered. §3's status rule is the
collector's verdict under that definition (`collectCase` in `scripts/testset/collect-tool-reviews.ts` as of `4db9abe`).

```sh
TH=~/Projects/th-h1                       # worktree at the tag review-freeze-3 (F1 §4.2); never the main checkout
export TH_MAIN=~/Projects/TraceHound TH_TAG=$TH      # names used by docs/eval/tag-worktree.md (codex, ffb615b)
TS=~/Projects/tracehound-testset; HO=~/Projects/tracehound-ho-window
ledger() { ( cd $TH && node --env-file=.env packages/analyzer/src/spend.ts ) | sed -n 's/^Total est. spend: \$\([0-9.]*\).*/\1/p'; }
CAP=<H1 cap from decision 077>
MAN=<held-out manifest>; CL=<held-out clones dir>          # private paths; codex knows them
```
All times are **T0 + hours**. T0 is the instant the first held-out PR is opened (question "T0" of Planner B's D1
note, adopted with 076c item 5); the operator opens it at the time planned in decision 078 and writes the actual
instant into `$HO/job.md`, and the scheduler's slot times are counted from that instant. Keep `$HO/window.log`: one line per
action (`UTC time | action | case position 1–29 | result`). Positions follow the frozen order (medusa, payload,
twenty, bullmq; manifest order inside each).

## 1. The day before (T0 − 24 h to T0)
1. `git -C $TH describe --tags --exact-match` prints `review-freeze-3`; `git -C $TH status --porcelain --untracked-files=no`
   prints nothing.
   **The worktree is bound to the main spend state (premortem gap G8; decision 076c item 9; `F1-freeze.md` §4.2):** run
   the verifier block of `docs/eval/tag-worktree.md` (codex, `ffb615b`). It exits 0 and its JSON line shows
   `samePhysicalLedger: true`, `envSame: true`, `trackedClean: true`, equal `ledgerUSD` in both checkouts and the main
   `.env`'s hard stop in both; `envSha256` equals the value in `ts-freeze.md`. `git -C $TH_MAIN diff --quiet review-freeze-3 -- pnpm-lock.yaml`
   exits 0. A refusal, or any difference: stop. **The same verifier is run again before every paid invocation of §4
   and of H2** ("repeat the verification before every paid job", same document).
   **The scheduler (decision 076c item 11):** the window scheduler named in `ts-freeze.md` has the sha256 recorded
   there, and its dry run over the whole slot table (no `--execute`) lists 29 first-trigger slots with their UTC times.
   **Models still served (gap G11):** the models-list read of `F1-freeze.md` §1 row 15 again: the three frozen ids are
   present. One missing: the window does not open.
2. Decision 078 is pushed: predictions, T0, Sunny's "go". If "go" is missing, stop.
3. Greptile dashboard (Sunny): credits ≥ 35; reset date after T0 + 72 h. Otherwise stop. This is Sunny's **last** look
   at any vendor dashboard or fork PR page until his filled sheet is hashed (`F1-freeze.md` §1 row 13, gap G2).
   CodeRabbit (decision 076b item 3): P1's report says the hourly rate at P1's end was not below the rate at its start,
   **or** T0 is at least 7 days after P1's last review. Otherwise stop.
4. `for f in medusa twenty payload bullmq; do gh api repos/SunnyBagal/$f/actions/permissions; done` → four `"enabled":false`.
5. `gh auth status` shows the SunnyBagal **user** (`open-prs.ts` requires it for triggers; see its header, `scripts/open-prs.ts:12-13`).
6. Dry runs again from `$TH`: the runner per repository, `open-prs.ts` per repository (F1 §4.4–4.5). 29 cases, 0 refusals.
7. Sunny reads the Nebius console balance with its UTC time (the baseline for the ratio).
8. No other paid process is running, and none starts until §6 is done. artu1 confirms this in writing.

## 2. T0 to T0 + 1:00: open the 29 PRs
```sh
cd $TS && for R in medusa payload twenty bullmq; do
  node scripts/open-prs.ts --manifest $MAN --clone $CL/$R --fork SunnyBagal/$R --resume-file $HO/open-prs/$R.resume.jsonl --execute
done
```
(10 per run with a 60 s delay; run again per repository until the dry run lists nothing. About 35 minutes, estimate.)
- T0 + 0:45: **auto-review check.** For every PR: `gh api --method GET repos/SunnyBagal/$R/issues/<n>/comments --jq '.[].user.login'`
  and `…/pulls/<n>/reviews --jq '.[].user.login'` print nothing. A bot comment here is failure 2 (§5).
- T0 + 0:50: `L0=$(ledger); echo "L0=$L0 $(date -u +%FT%TZ)" >> $HO/job.md`; write T0 (the actual instant) and the 29
  positions → case → PR numbers into `$HO/job.md` too. The scheduler is started now, detached, with T0 as its start
  time; its first slot is T0 + 1:00.

## 3. T0 + 1:00 to T0 + 58:00: triggers
One slot per hour, on the hour. **Slot k (k = 1 … 29) at T0 + k:00 is the first trigger of position k, for both tools
in one command:**
```sh
cd $TS && node scripts/open-prs.ts --manifest $MAN --fork SunnyBagal/$R --resume-file $HO/open-prs/$R.resume.jsonl \
  --trigger coderabbit,greptile --ids <id of position k> --execute
```
So position 1 is triggered at T0 + 1:00 and position 29 at T0 + 29:00.

**Re-triggers (decision 076b item 2).** First triggers always go before re-triggers. A re-trigger takes the first free
hourly slot at or after 24 hours from that PR's own trigger, in PR order. This holds for **both** tools: no re-trigger of
any kind is posted while first triggers are still running. One slot serves one PR (the re-trigger for whichever of the
two tools need one on it).
- Position k falls due at T0 + 24 + k:00. Slots up to T0 + 29:00 belong to first triggers, so the first re-trigger slot
  is **T0 + 30:00**, then one per hour.
- At each slot from T0 + 30:00: take the lowest position that is due and not yet handled, and check it **now** (not at
  its due time: a review may have arrived since). Run the collector for that case, once per tool (`--ids <id>`,
  `--window-start T0 --window-end now`, `--resume-file $HO/open-prs/$R.resume.jsonl`, `--out $HO/check/<k>-<tool>`), and
  read the status. With `--resume-file` the completion bound is that case's own first `triggered:<tool>` record
  (`triggerTimes` in `scripts/testset/collect-tool-reviews.ts` as of `4db9abe`):
  - `completed` → nothing for that tool, ever (076c item 3). A review that completed with zero inline comments is
    `completed`: the bot left a review object or an issue comment that is not a rate-limit or error message.
  - `no-review` (nothing arrived, or only messages that match the tool's frozen `notCompletion` patterns: a CodeRabbit
    rate-limit comment, a Greptile "Failed" message, an explicit error) → **one re-trigger** for that tool on that PR.
    Never a second.
  - `invalid-binding` → failure 5; no re-trigger.
  - `read-failed` → not a result: run the collector again into a new directory (`$HO/check/<k>-<tool>.b`) in the same
    slot; if it still fails, the slot passes without a re-trigger for that PR and the PR is checked first at the next
    slot (failure 7's logging).
- If neither tool needs a re-trigger, the position is handled and the same slot goes to the next due position; repeat
  until a re-trigger is posted or no position is due.
- Never re-trigger because a review looks thin or missed something.
- Worst case, every position needs one: positions 1–29 in slots T0 + 30:00 … T0 + 58:00, 14 hours before the snapshot.

| T0 + | what happens |
|---|---|
| 1:00 – 29:00 | first triggers, positions 1–29, one per hour; **no re-trigger** |
| 30:00 – 58:00 | one re-trigger slot per hour: the lowest due position that still needs one, checked at the slot |
| 58:00 – 72:00 | no trigger of any kind (earlier, if the queue emptied earlier) |

**Who keeps the clock (gap G4; decision 076c item 11).** The hourly triggers run from a **detached scheduler with
its own log, not from an agent's session**: a background process of a session here dies after 2 hours
(`docs/bench/results.md` §8 "Losses", "v1 dev run 2 was void"). "Detached" is what codex's rehearsal script does
(`tracehound-testset/run/out/codex.rehearsal.py`, sha256 `59b7fa8f…88e2`, functions `run`, `targets`, `command`,
`verdict`; no commit, it is a rehearsal artefact):
- started so that its parent is pid 1 and it has its own session id, both written to the state file at every start;
- a lock file, so two copies cannot run;
- absolute UTC slot times computed once from one start time, never "an hour after the last slot";
- a state file rewritten after every slot, so a restarted scheduler skips the slots already done;
- before every slot, the sha256 of the script it calls, of the manifest and of the resume file are compared with the
  pinned values, and a difference stops it;
- one command per slot with a timeout, its output and its planned and actual time written to its own log.

**The rehearsal script is not the window's scheduler:** its `command` refuses `--execute`, `targets` is 8 fixed
slots, and it fires one fixed dev case. The window's scheduler is codex's to write from it, with the six properties
above and this slot table, and nothing else:
1. Slot k = T0 + k:00, k = 1 … 29: the first-trigger command above for position k, with `--execute`.
2. Slot at T0 + 30:00 and every hour after it, while a position is due and not handled: the re-trigger procedure
   above for the lowest such position: per tool, the collector check into `$HO/check/<k>-<tool>` and then
   `open-prs.ts --retrigger <tool> --status … --ids <id> --execute` (the mode, below). If neither tool was
   re-triggered, the same slot goes on to the next due position. The scheduler ends when no position is left or at
   T0 + 58:00.
3. It decides nothing that §3 does not state. A non-zero exit is logged and the scheduler goes on to the next slot
   (failures 1 and 7 say what the operator does); it never fires two CodeRabbit triggers inside one hour.
4. It runs as the SunnyBagal `gh` user (`open-prs.ts` requires it) and never reads or prints a held-out title or text
   into a place artu1 or bunny read: its log stays in `$HO`.
Its file and sha256 are in `ts-freeze.md`; grok reads it before the tag (`F1-freeze.md` §1 row 14). Every slot is
logged with its planned and its actual time. A slot late by more than 30 minutes is failure 7. The operator's session
may end and restart at any time; it only reads the scheduler's state and log (`$HO/scheduler.state.json`,
`$HO/scheduler.log`) and steps in by hand only where §5 says so.

**The re-trigger command (gap G5). TEMPORARY: the `gh` lines below stand only until bunny's re-trigger mode is on
the testset repo's `main` (decision 076c items 9 and 15).** On 2026-11-12 the mode exists only as an uncommitted change
in the testset working tree (`run/out/bunny.076c.open-prs.patch`, sha256 `135374bf…0f10`, against testset `e0b2b8b`;
functions `runRetriggers` and `readCollectorStatus` in `scripts/open-prs.ts`; codex's review and artu1's commit are
open). **When it is committed, this is the re-trigger and the `gh` lines are deleted from this file before F1:**
```sh
cd $TS && node scripts/open-prs.ts --manifest $MAN --fork SunnyBagal/$R --resume-file $HO/open-prs/$R.resume.jsonl \
  --retrigger <tool> --status $HO/check/<k>-<tool>/<tool>.status.json --ids <id of position k>     # dry run, then --execute
```
One tool per call; never together with `--trigger`. The mode takes the collector's verdict from the slot's check
(§3 above), so there is no second definition of "no completed review": the status file must be the one its
`<tool>.collection.json` hashed, for the same tool and fork, collected at or after 24 h from that case's first
`triggered:<tool>` record. It re-triggers only `no-review`; it skips `completed`, `invalid-binding` and a case not yet
due; it refuses `read-failed` or a missing status (collect again). It writes `retriggered:<tool>` to the resume file
and never posts a third trigger (a PR that already carries two trigger comments is recorded and skipped; a PR with
none is a failure and nothing is posted). All from bunny's report, `run/out/bunny.076c.md` step 4.

**Until then (temporary lines).** `open-prs.ts --trigger` cannot post a re-trigger: `runTriggers` skips a case the resume
file marks `triggered:<tool>`, and `alreadyTriggered` skips a PR that already carries the trigger text from the
SunnyBagal user (`tracehound-testset/scripts/open-prs.ts` at `e0b2b8b`). The re-trigger is exactly one of these lines, with the
script's own trigger texts (`TRIGGERS` in the same file), posted as the SunnyBagal user:
```sh
gh pr comment <n> --repo SunnyBagal/$R --body "@coderabbitai full review"
gh pr comment <n> --repo SunnyBagal/$R --body "@greptileai"
```
Guard, before each: the number of comments by `SunnyBagal` on that PR whose whole body is that trigger text must be
exactly **1** (`gh api --method GET repos/SunnyBagal/$R/issues/<n>/comments --paginate --jq '[.[]|select(.user.login=="SunnyBagal")|.body|gsub("^\\s+|\\s+$";"")]|map(select(.=="<trigger text>"))|length'`).
(`--paginate` prints one number per page of comments; add them if there are several.) `0` means the first trigger never happened (failure 1); `2` means the re-trigger is already spent: post nothing. After
posting, the same line prints `2`; log `retriggered:<tool>` with the position in `$HO/window.log`. These lines are part
of this file, whose sha256 is in `ts-freeze.md` (gap G9); nothing else is ever typed into a held-out PR. The window
must not run on the temporary lines if the mode can be merged first: F1 §1 row 17 checks it.

## 4. T0 + 2:00 onward: TraceHound, locally, from the tag
Runs do not depend on the triggers; they start once the PRs are open and finish the same day (estimate from R2's
timing). One repository per invocation, in the frozen order; a batch has at most 10 ids.
```sh
L0=$(sed -n 's/^L0=\([0-9.]*\) .*/\1/p' $HO/job.md | head -1)     # the job-start value is read from the file (076c item 1)
RUNCAP=$(echo "$CAP - ($(ledger) - $L0)" | bc)
# the verifier block of docs/eval/tag-worktree.md first (exit 0), then:
cd $TH && node --env-file=.env scripts/run-tracehound.ts --manifest $MAN --clone $CL/$R --ids $IDS --out-dir $HO/th \
  --fixes off --contracts off --cache off --max-usd-per-case 0.40 --max-usd-run $RUNCAP        # dry run, then --execute
```
| batch | repository | cases |
|---|---|---|
| 1 | medusa | all 8 |
| 2 | payload | all 10 |
| 3 | twenty | all 10 |
| 4 | bullmq | 1 |

After each batch: exit code, status per case, `review.chunksFailed`, `usage.ledger.costUSD` (counts into `$HO/job.md`).
- **Record check, after every batch and again on all records when the last one is done (gap G8):**
  `for f in $HO/th/*.json; do jq -r '[.tracehound.sha,.tracehound.dirty,.settings.fixes,.settings.contracts,.settings.cache,.settings.maxUsdPerCase,.prompts["review-diff-v1"],.prompts["review-ctx-v1"],.prompts["verify-ctx-v1"]]|@tsv' $f; done | sort | uniq -c`
  prints **one** line: the tag's commit, `false`, `off`, `off`, `off`, `0.4`, and the three prompt hashes of
  `ts-freeze.md` (the record holds all of these: `tracehoundHead()` and the `settings` and `prompts` fields in
  `scripts/run-tracehound.ts`). Two lines, or any other value: stop, tell Sunny, do not score. grok repeats this check
  on its own after the last batch and reports "one line, equal to the freeze: yes / no" (gap G7).
- Exit 3 (stopped before a case): the unstarted ids go to the front of the next invocation of the same repository.
- When `RUNCAP` < $0.40: the remaining unstarted cases run **from the reserve** in one more invocation per repository
  with `--max-usd-run` = $0.40 × (number of those cases); the amount is logged as reserve spend.
- After the last batch, and not before: each `failed` or `cap` case is rerun **once** (`--rerun --ids …`, one
  invocation per repository; failure 9 says when). The rerun's record is official. Two failures: a miss.
- Never `--post`. Never `--cache read`.
- ≥ 2 hours after the last TraceHound call: Sunny reads the console; ratio = console drop ÷ (`ledger − L0`). Above
  1.08: log it and tell artu1 the number; **H1 continues** (it is never cut).

## 5. Failures and the rule for each
| # | failure | rule |
|---|---|---|
| 1 | `open-prs.ts` fails for a case | Run it again (the resume file prevents duplicates). A PR not open by its own slot keeps its position; its triggers are posted when it opens, in the next free slot. Not open by T0 + 29:00: both tools are `no-review` for it; TraceHound still runs it locally. |
| 2 | A tool reviews a PR before its trigger (auto-review) | Log it. That review stands as the tool's review; do not trigger that tool on that PR. Reported as a deviation. If Greptile does this on several PRs, tell Sunny at once in words only (credits); he does not open the dashboard or the PRs (gap G2). |
| 3 | CodeRabbit posts a rate-limit comment | No review ran (https://docs.coderabbit.ai/management/rate-limits). Its wording is a frozen `notCompletion` pattern, so the PR is `no-review` at its re-trigger slot (§3) and gets the one re-trigger. Do not re-trigger earlier than 24 h after the PR's own trigger (076c item 3). If the comment's wording does **not** match the frozen pattern, the collector says `completed`: do not re-trigger by hand; log it as a deviation and tell Sunny in counts only. |
| 4 | Greptile shows "Failed" | Same: the one re-trigger, at that PR's re-trigger slot (§3). |
| 5 | A PR's base or head no longer equals the case pair | The attempt is invalid (`invalid-binding`); nothing is pushed or repaired; that case is `no-review` for the external tools. Find out who pushed, after the window. |
| 6 | A tool still has no completed review after its re-trigger | `no-review`: no catch in K of 20, left out of that tool's pairs, n reported (076a §13.4). |
| 7 | A trigger slot is missed (operator down, GitHub down) | Post it at the next free slot and log the delay. Do not post two CodeRabbit triggers in one hour to catch up. |
| 8 | Greptile runs out of credits | Seen only through Greptile's own message on a PR; nobody opens the dashboard during the window (gap G2). Remaining PRs are `no-review` for Greptile. Nothing is bought. |
| 9 | TraceHound cases end `failed` | One rerun each, after the last batch and at least 2 hours after the failure. **Canary (decision 076b item 4), only when two held-out cases in a row failed with a provider or transport error:** stop the batch (the cases without a record are unstarted and roll forward). Run S1's dev case fresh from `$TH` as a canary: `--manifest $TS/cases/dev/manifest.json --clone $TS/repos/<its repo> --ids <S1's case> --out-dir $HO/canary/<try> --fixes off --contracts off --cache off`, with `--max-usd-per-case` and `--max-usd-run` both set to $0.40 minus what earlier canary tries spent. At most **3 tries, at least 30 minutes apart, $0.40 in total, charged to the reserve**. A canary that ends `ok`: continue the batch and, later, the reruns. **All 3 fail: stop everything on the TraceHound side and tell Sunny**; no rerun is spent while the provider is down. Triggers and the snapshot go on. |
| 10 | A case hits its $0.40 cap (`cap`) | One rerun, same rule. A second `cap` is a miss. |
| 11 | The operator's process is killed mid-batch | Records are written per case and never overwritten. Start the same batch again with the ids that have no record; spend already made counts in `ledger − L0`. |
| 12 | A case has no official record at T0 + 72:00 | A miss (076a §13.3). |
| 13 | codex is unavailable for more than 2 hours | grok takes over from `$HO/window.log` and this runbook; the handover time is logged. |
| 14 | Anything this table does not cover | Do nothing that changes what a tool sees. Log it, tell Sunny (not artu1) with counts only, and wait for his answer. |

## 6. T0 + 72:00: the snapshot
```sh
cd $TH && for T in coderabbit greptile; do for R in medusa payload twenty bullmq; do
  node scripts/testset/collect-tool-reviews.ts --side heldout --heldout-ok --tool $T --config scripts/testset/tools.json \
    --repo SunnyBagal/$R --manifest $MAN --pr-map $HO/pr-map.$R.json --window-start <T0> --window-end <T0 + 72 h> \
    --resume-file $HO/open-prs/$R.resume.jsonl --out $HO/tools-$R
done; done
( cd $HO && find th tools-* open-prs check -type f | sort | xargs shasum -a 256 > hashes.window.txt && shasum -a 256 hashes.window.txt )
```
(`pr-map.$R.json` from the resume file as in `docs/specs/S1.md` step 8. If the collector refuses a second tool in the
same `--out`, use `$HO/tools-$R-$T`.) Start the collection at T0 + 72:00, not earlier and not later than T0 + 73:00;
`--window-end` is T0 + 72 h exactly, so a late start does not let late comments in. Nothing collected is edited.
- **A case with no `triggered:<tool>` record** (failure 1: its PR never opened; failure 2: the tool reviewed before its
  trigger and was therefore not triggered) makes the collector refuse the whole run when `--resume-file` is given
  (`main` in `collect-tool-reviews.ts` as of `4db9abe`). Collect in two runs then: the triggered cases with `--ids` and
  `--resume-file`; the untriggered ones with `--ids`, **without** `--resume-file` (bound = the window start), into
  `$HO/tools-$R-untriggered`. `<tool>.collection.json` records which bound applied (`completionFrom`). Report the count
  of such cases as a deviation.
- **`read-failed`** (the collector exits 1): not a result. Repeat that repository's collection into a new directory
  (`$HO/tools-$R.b`) until it reads; the last complete collection is official; every attempt is kept and hashed. The
  window end stays T0 + 72 h, so a repeat gives no tool more time (question U6, decision 076c item 5).
- **`invalid-binding`** stays in the status file as it is; the scorer treats it as `no-review` for that tool
  (`score-testset.ts` as of `6fd4568`).

**Comments from logins on nobody's list (gap G6), before any judging.** A comment by a login that is not in
`tools.json` is dropped as `otherAuthor` without a signal (`collectCase` in `scripts/testset/collect-tool-reviews.ts`),
and that counter also holds the *other* tool's comments. So count the logins directly from the raw objects:
```sh
ALLOWED=$(jq -c '[.tools[].logins[]|ascii_downcase]' $TH/scripts/testset/tools.json)
cat $HO/tools-*/raw/coderabbit/*.json | jq -r --argjson a "$ALLOWED" '.comments[]? | select(.in_reply_to_id==null) | select((.user.login|ascii_downcase) as $l | $a|index($l)|not) | [.user.login,.user.type]|@tsv' | sort | uniq -c
```
(one tool's raw files are enough: both tools' raw files hold every review comment of the PR.) Report the number of
such comments and of distinct `Bot` logins behind them. **Not zero for a Bot login: stop before H2's judging; Sunny
rules, on counts and login names only, whether that login belongs to a tool** (question U5 of
`run/comms/planner.b.d1-review.md`). `tools.json` is frozen and is not edited without that ruling.

## 7. Report: `run/out/codex.ho-run.md` (counts and spend only; no case id, title, path or text)
PRs opened of 29; per tool: triggered, completed, no-review, re-triggers used, auto-reviews, rate-limit comments;
TraceHound: ok / failed / cap / unstarted, reruns, misses by rule, chunks failed, empty reviews; spend: job, reserve,
canary; console ratio; every deviation with its failure number; the single sha256 of `hashes.window.txt`; trigger slots: fired, late by more than 30 minutes; scheduler starts (count) and whether the operator's session restarted while it ran; re-triggers posted per tool; comments by unlisted logins and distinct unlisted Bot logins (gap G6); the record check's one line as "equal to the freeze: yes / no", from codex and from grok (gaps G7, G8); the ledger total before T0 in the worktree and in the main checkout; `invalid-binding` and `read-failed` counts per tool. Then the
`.done` marker. artu1 writes STATE, LOG, the budget log row and the brain entry from this file alone.

## 8. The three most likely ways to get this wrong
1. **Helping a tool.** Re-triggering a completed review, re-triggering twice, waiting past T0 + 72 h for a slow tool,
   or rerunning an `ok` TraceHound case for a better draw. Each one makes the comparison unequal and cannot be undone.
2. **Leaking held-out.** Running from the main checkout, writing outside `$HO`, pasting a case title into the report,
   or letting artu1 read the pane. The report is counts; everything else stays in `$HO`.
3. **Spending against the wrong cap.** `RUNCAP` is recomputed before every invocation from the ledger and the
   job-start value in `$HO/job.md`; a second paid process (a judge run, a dev rerun) during a batch eats the cap and
   strands cases: one paid process at a time across all jobs (076c item 1). A worktree whose ledger or `.env` is a
   copy instead of the main checkout's file has no hard stop at all; the verifier catches that only if it is run.
