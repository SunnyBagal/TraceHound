# Runbook H1: the held-out window, hour by hour

For codex (operator), grok (backup operator). artu1 and bunny do **not** open anything this runbook produces and never
read the operator's pane; they get `run/out/codex.ho-run.md` (counts and spend only). Planner A, 2026-11-11.
Plan: [`plan-v2`](../plan/2026-11-11-plan-v2.md) §6. Protocol: `docs/eval/ts-protocol.md` §3, §7–§9 (it wins over this
runbook; report any difference). Budget line: **H1**, cap from decision 077 ($3.15 until then); unstarted cases at the
cap run from the reserve (decision 076a "Caps" item 4).

**Two things in this runbook are assumptions until ruled** (plan-v2 §8):
- **R-1, the CodeRabbit queue (§3).** Written for 1 CodeRabbit review per hour (the ruled planning rate, S0.4). A
  re-trigger that is due while first triggers are still running waits for the next free hourly slot.
- **The canary before reruns (§5, failure 9).** A paid dev case from the reserve; artu1 pre-approves it at F1 or strikes it.
If the frozen schedule in `docs/bench/ts-freeze.md` differs from §3, the frozen schedule is used and §3 is ignored.

```sh
TH=~/Projects/th-h1                       # worktree at the tag review-freeze-3 (F1 §4.2); never the main checkout
TS=~/Projects/tracehound-testset; HO=~/Projects/tracehound-ho-window
ledger() { node $TH/packages/analyzer/src/spend.ts | sed -n 's/^Total est. spend: \$\([0-9.]*\).*/\1/p'; }
CAP=<H1 cap from decision 077>
MAN=<held-out manifest>; CL=<held-out clones dir>          # private paths; codex knows them
```
All times are **T0 + hours**, T0 being the UTC instant written in decision 078. Keep `$HO/window.log`: one line per
action (`UTC time | action | case position 1–29 | result`). Positions follow the frozen order (medusa, payload,
twenty, bullmq; manifest order inside each).

## 1. The day before (T0 − 24 h to T0)
1. `git -C $TH describe --tags --exact-match` prints `review-freeze-3`; `git -C $TH status` is clean.
2. Decision 078 is pushed: predictions, T0, Sunny's "go". If "go" is missing, stop.
3. Greptile dashboard (Sunny): credits ≥ 35; reset date after T0 + 72 h. Otherwise stop.
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
- T0 + 0:50: `L0=$(ledger)`; write `L0`, T0 and the 29 positions → case → PR numbers into `$HO/job.md`.

## 3. T0 + 1:00 to T0 + 58:00: triggers
One slot per hour, on the hour. **Slot k (k = 1 … 29) at T0 + k:00 is the first trigger of position k, for both tools
in one command:**
```sh
cd $TS && node scripts/open-prs.ts --manifest $MAN --fork SunnyBagal/$R --resume-file $HO/open-prs/$R.resume.jsonl \
  --trigger coderabbit,greptile --ids <id of position k> --execute
```
So position 1 is triggered at T0 + 1:00 and position 29 at T0 + 29:00.

**Re-trigger check, 24 hours after each position's own trigger** (position k at T0 + 24 + k:00). Run the collector for
that one case and tool (`--ids <id>`, `--window-start T0 --window-end now`, `--out $HO/check/<k>-<tool>`), and read its
status:
- `completed` → nothing to do for that tool on that PR.
- `no-review` (nothing arrived, a CodeRabbit rate-limit comment, a Greptile "Failed" message, an explicit error) → **one
  re-trigger** for that tool on that PR. Never a second.
- `invalid-binding` → failure 5.
A review that completed with zero inline comments is `completed`, not an error. Never re-trigger because a review looks
thin or missed something.

**Where the re-trigger goes:**
- Greptile: immediately (no hourly limit is documented, `run/out/grok.tool-facts.md` row 15).
- CodeRabbit (assumption R-1): one request per hourly slot in total. First triggers own slots 1–29. Re-triggers form
  one queue in the order they became due and take the next free slot: the first re-trigger slot is T0 + 30:00, then
  one per hour. With all 29 needing one, the last goes out at T0 + 58:00, 14 hours before the snapshot.

| T0 + | what happens |
|---|---|
| 1:00 – 24:00 | first triggers, positions 1–24 |
| 25:00 – 29:00 | first triggers 25–29; re-trigger checks for positions 1–5 (Greptile re-triggers go out now; CodeRabbit's wait) |
| 30:00 – 53:00 | re-trigger checks for positions 6–29 at their +24 h; CodeRabbit re-triggers from the queue, one per hour |
| 54:00 – 58:00 | remaining queued CodeRabbit re-triggers, if any |
| 58:00 – 72:00 | no trigger of any kind |

The hourly cadence outlives a 2-hour session: each trigger is its own short command; the operator schedules the next
one and logs it. A slot missed by more than 30 minutes is failure 7.

## 4. T0 + 2:00 onward: TraceHound, locally, from the tag
Runs do not depend on the triggers; they start once the PRs are open and finish the same day (estimate from R2's
timing). One repository per invocation, in the frozen order; a batch has at most 10 ids.
```sh
RUNCAP=$(echo "$CAP - ($(ledger) - $L0)" | bc)
cd $TH && node scripts/run-tracehound.ts --manifest $MAN --clone $CL/$R --ids $IDS --out-dir $HO/th \
  --fixes off --contracts off --cache off --max-usd-per-case 0.40 --max-usd-run $RUNCAP        # dry run, then --execute
```
| batch | repository | cases |
|---|---|---|
| 1 | medusa | all 8 |
| 2 | payload | all 10 |
| 3 | twenty | all 10 |
| 4 | bullmq | 1 |

After each batch: exit code, status per case, `review.chunksFailed`, `usage.ledger.costUSD` (counts into `$HO/job.md`).
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
| 2 | A tool reviews a PR before its trigger (auto-review) | Log it. That review stands as the tool's review; do not trigger that tool on that PR. Reported as a deviation. If Greptile does this on several PRs, tell Sunny at once (credits). |
| 3 | CodeRabbit posts a rate-limit comment | No review ran (https://docs.coderabbit.ai/management/rate-limits). It is found as `no-review` at the +24 h check and gets the one re-trigger. Do not re-trigger earlier. |
| 4 | Greptile shows "Failed" | Same: the one re-trigger at +24 h. |
| 5 | A PR's base or head no longer equals the case pair | The attempt is invalid (`invalid-binding`); nothing is pushed or repaired; that case is `no-review` for the external tools. Find out who pushed, after the window. |
| 6 | A tool still has no review after its re-trigger | `no-review`: no catch in K of 20, left out of that tool's pairs, n reported (076a §13.4). |
| 7 | A trigger slot is missed (operator down, GitHub down) | Post it at the next free slot and log the delay. Do not post two CodeRabbit triggers in one hour to catch up. |
| 8 | Greptile runs out of credits | Remaining PRs are `no-review` for Greptile. Nothing is bought. |
| 9 | TraceHound cases end `failed` | One rerun each, after the last batch and at least 2 hours after the failure. If 3 or more cases of one batch failed with request errors (provider trouble), first run S1's dev case fresh as a canary from the reserve (`--max-usd-run 0.40`, out-dir `$HO/canary`); rerun only after a canary ends `ok`; repeat the canary every 2 hours, at most until T0 + 60:00, then rerun regardless. (Assumption; see top.) |
| 10 | A case hits its $0.40 cap (`cap`) | One rerun, same rule. A second `cap` is a miss. |
| 11 | The operator's process is killed mid-batch | Records are written per case and never overwritten. Start the same batch again with the ids that have no record; spend already made counts in `ledger − L0`. |
| 12 | A case has no official record at T0 + 72:00 | A miss (076a §13.3). |
| 13 | codex is unavailable for more than 2 hours | grok takes over from `$HO/window.log` and this runbook; the handover time is logged. |
| 14 | Anything this table does not cover | Do nothing that changes what a tool sees. Log it, tell Sunny (not artu1) with counts only, and wait for his answer. |

## 6. T0 + 72:00: the snapshot
```sh
cd $TH && for T in coderabbit greptile; do for R in medusa payload twenty bullmq; do
  node scripts/testset/collect-tool-reviews.ts --side heldout --heldout-ok --tool $T --config scripts/testset/tools.json \
    --repo SunnyBagal/$R --manifest $MAN --pr-map $HO/pr-map.$R.json --window-start <T0> --window-end <T0 + 72 h> --out $HO/tools-$R
done; done
( cd $HO && find th tools-* open-prs check -type f | sort | xargs shasum -a 256 > hashes.window.txt && shasum -a 256 hashes.window.txt )
```
(`pr-map.$R.json` from the resume file as in `docs/specs/S1.md` step 8. If the collector refuses a second tool in the
same `--out`, use `$HO/tools-$R-$T`.) Start the collection at T0 + 72:00, not earlier and not later than T0 + 73:00;
`--window-end` is T0 + 72 h exactly, so a late start does not let late comments in. Nothing collected is edited.

## 7. Report: `run/out/codex.ho-run.md` (counts and spend only; no case id, title, path or text)
PRs opened of 29; per tool: triggered, completed, no-review, re-triggers used, auto-reviews, rate-limit comments;
TraceHound: ok / failed / cap / unstarted, reruns, misses by rule, chunks failed, empty reviews; spend: job, reserve,
canary; console ratio; every deviation with its failure number; the single sha256 of `hashes.window.txt`. Then the
`.done` marker. artu1 writes STATE, LOG, the budget log row and the brain entry from this file alone.

## 8. The three most likely ways to get this wrong
1. **Helping a tool.** Re-triggering a completed review, re-triggering twice, waiting past T0 + 72 h for a slow tool,
   or rerunning an `ok` TraceHound case for a better draw. Each one makes the comparison unequal and cannot be undone.
2. **Leaking held-out.** Running from the main checkout, writing outside `$HO`, pasting a case title into the report,
   or letting artu1 read the pane. The report is counts; everything else stays in `$HO`.
3. **Spending against the wrong cap.** `RUNCAP` is recomputed before every invocation from the ledger; a second paid
   process (a judge run, a dev rerun) during a batch eats the cap and strands cases.
