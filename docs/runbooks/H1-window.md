# Runbook H1: the held-out window, hour by hour

For codex (operator), grok (backup operator). artu1 and bunny do **not** open anything this runbook produces and never
read the operator's pane; they get `run/out/codex.ho-run.md` (counts and spend only). **From T0 until the firewall
lifts, artu1 and bunny also make no `gh` or browser read of pulls, issues or notifications on the four forks**
(decision 076c item 12; `AGENTS.md` "Blindness"): the forks are public, and every tool comment on a held-out PR is
there. Planner A, 2026-11-11; brought to decision 076c on 2026-11-12, to decision 076d on 2026-11-13, to decision
076e with its addendum on 2026-11-13 and to decision 076g (items 1, 2, 9, 10) on 2026-11-13.
Plan: [`plan-v2`](../plan/2026-11-11-plan-v2.md) §6. Protocol: `docs/eval/ts-protocol.md` §3, §7–§9 (it wins over this
runbook; report any difference). Budget line: **H1**, cap from decision 077 ($3.15 until then); unstarted cases at the
cap run from the reserve (decision 076a "Caps" item 4).

**Ruled since the first version (decision 076b, `docs/decisions.md:3931-3951`):** the re-trigger slots (item 2, §3 below),
the CodeRabbit allowance condition (item 3, §1 item 6) and the canary with its limits (item 4, §5 failure 9). They are no
longer assumptions. If the frozen schedule in `docs/bench/ts-freeze.md` differs from §3, the frozen schedule is used.
**Ruled in decision 076c (`docs/decisions.md`, "076c", items 2 and 3):** a review is completed if the tool's bot posted
any review object, inline comment or issue comment on the PR after the trigger, except a rate-limit or error message
(issue comments count for completion only, never as comments); a PR is re-triggered only if it has no completed review
24 h after its own trigger, and a completed review with zero comments is never re-triggered. §3's status rule is the
collector's verdict under that definition (`collectCase` in `scripts/testset/collect-tool-reviews.ts`).
**Ruled in decision 076d (`docs/decisions.md`, "076d", with its addendum (e) and the correction to item 1):**
- **Push order (item 1c).** Held-out case branches are pushed **one case at a time, in base-date order, each only at
  its own first-trigger slot**. No held-out branch is on a fork before its slot. The 29 PRs are no longer opened
  together at T0.
- **A failed first trigger is retried before any later branch is pushed (addendum e).** It takes the next slot; after
  two failed tries the case is `failed-first-trigger` and the next case follows.
- **Exposure is judged per review at its actual time**, from the scheduler's branch log (the fork's branches, logged
  before every trigger), not from the planned slot order (addendum e).
- **Not-completion messages (item 2):** "in progress", "review skipped", "paused" and similar bot messages do not
  complete a review; they are in the frozen `notCompletion` lists with the rate-limit and error messages.
- **The scheduler is bunny's** (item 3): `scripts/testset/window-scheduler.ts`, branch `b5-window-scheduler` @
  `2c51913`, merged at `4b99fb4` on codex's GO.
- **A case with no trigger** is collected with the collector's explicit bound (item 4): `--bound window-start`, and
  `--never-opened <ids>` for a PR that never opened (`b696231`). §6.

**Ruled in decision 076e (`docs/decisions.md`, "076e", items 2, 3, 6 and 7; addendum c):**
- **Dates (076e item 7, replaced by decision 076g item 10; plan-v2 §6a).** Scheduled T0 at the earliest **Tue 17
  Nov 2026, 10:00 IST** (04:30 UTC; then the plan's `t0` is `2026-11-17T04:30:00Z`), and always at 10:00 IST on the
  day after a tag pushed by 20:00 IST. Snapshot 72 hours after T0; hand-check that day, 16:00–19:00 IST. With the tag
  on Mon 16 Nov: Tue 17 Nov, Fri 20 Nov 10:00, Fri 20 Nov 16:00–19:00. If a dev case was still without a review when
  P1's 38 slots ended, so that P1's collection closed on Mon 16 Nov evening: Wed 18 Nov, Sat 21 Nov. CodeRabbit's
  1 review per hour (S1's reading, 14 Nov) is the plan's assumed rate, not a shrink, and the 7-day rule does not
  apply to it (Sunny, 14 Nov). **Only if CodeRabbit gave less than 1 per hour in P1 (decision 076b item 3): the
  first 10:00 IST at least 7 days after P1's last CodeRabbit review, and not before Sun 22 Nov** (076e's option B). Decision 078 records the
  dates used.
- **T0 (item 3).** T0 is the instant the first held-out PR opens. The plan's fixed time is the **scheduled T0**
  (slot 0). The snapshot is at T0 + 72 h. "Two clocks", below.
- **Plan values (item 2).** Six spare slots (slots 0–63: 29 first triggers, 29 worst-case re-triggers, 6 spare); the
  four command timeouts of §3; the push order by the committer date of the base commit, ties by case id. They are
  rulings, frozen in the protocol (`docs/eval/ts-protocol.md` §7), and nobody changes them at run time.
- **Auto-review (item 6)** is counted at the snapshot (§5 failure 2).
- **The machine (addendum c).** Sunny runs `caffeinate -is -t 280800` (78 hours) from about 09:00 IST on the day of
  the scheduled T0; §2 checks that the assertion is held before the scheduler starts (§1 item 12).

```sh
TH=~/Projects/th-h1                       # worktree at the tag review-freeze-3 (F1 §4.2); never the main checkout
export TH_MAIN=~/Projects/TraceHound TH_TAG=$TH      # names used by docs/eval/tag-worktree.md (codex, 775c3d6)
TS=~/Projects/tracehound-testset; HO=~/Projects/tracehound-ho-window
ledger() { ( cd $TH && node --env-file=.env packages/analyzer/src/spend.ts ) | sed -n 's/^Total est. spend: \$\([0-9.]*\).*/\1/p'; }
CAP=<H1 cap from decision 077>
MAN=<held-out manifest>; CL=<held-out clones dir: one clone per fork name>          # private paths; codex knows them
sched() { node $TH/scripts/testset/window-scheduler.ts --side heldout --heldout-ok --cases $HO/cases.json --plan $HO/plan.json \
  --tools $TH/scripts/testset/tools.json --manifest $MAN --clones $CL --resume-dir $HO/open-prs --state-dir $HO/sched \
  --open-prs $TS/scripts/open-prs.ts --collector $TH/scripts/testset/collect-tool-reviews.ts "$@"; }
```
`--side heldout --heldout-ok` is codex's explicit flag: the scheduler refuses every held-out path and every held-out
case id without it, and no tuning agent ever passes it (`guardSide` in `scripts/testset/window-scheduler.ts`).

**Two clocks (decision 076e item 3; `docs/eval/ts-protocol.md` §7).**
- **T0 is the instant the first held-out PR opens:** GitHub's `created_at` of that PR, a UTC timestamp. codex reads
  it once, at the first visit after the PR exists (`gh api --method GET repos/<fork>/pulls/<n> --jq .created_at`; the
  number is in the `pr-created` record of the fork's resume file), and writes it into `$HO/job.md`.
- **The scheduled T0 is the `t0` field of `$HO/plan.json`:** the planned instant of slot 0, fixed in decision 078 and
  written into the plan file **before** the run. Every slot time is scheduled T0 + k × 3600 s, computed from that one
  value (`slotTime`). The scheduler knows no other clock.
- **The snapshot is at T0 + 72 h, not at scheduled T0 + 72 h.** When slot 0 works, the two clocks differ by the
  seconds it takes to push two branches and open a PR. If slot 0 fails or is missed before the PR opens, they differ
  by an hour or more (failure 16). Both times and their difference go into `$HO/job.md` and the report (§7).
- In this runbook every time before §6 ("T0 − 0:30", "T0 + 28:00", a slot's hour) is on the **scheduled** grid.
  §6's window start and end are the actual T0 and T0 + 72 h.

The scheduler's own log is `$HO/sched/scheduler.log.jsonl`. The operator also keeps `$HO/window.log`: one line per
action taken by hand (`UTC time | action | case position 1–29 | result`).

**Positions (decision 076d item 1c).** Position 1 … 29 is the order of `$HO/cases.json`
(`[{position, id, fork}]`, the scheduler's `--cases`; `readCases`). **The rule, not the list, is written here; codex
builds the list at run time, on the held-out side:** all 29 held-out cases, bug and clean, sorted by the date of each
case's base commit, earliest first, across the four forks in one list. The date is the base commit's committer date
(`git -C $CL/<fork name> log -1 --format=%ct <base_sha>`); two cases with the same date are ordered by case id. **Both
are ruled (decision 076e item 2) and the protocol states the same order (§7).**
The scheduler never reorders and never skips ahead. The same order holds for every tool. The list, its sha256 and the
rule go into `ts-freeze.md`'s private companion on the held-out side; the dev side gets the sha256 only.
Why this order: a case's fix can be an ancestor of a **later** case's base, so with earlier bases pushed first, the
branch that carries a case's fix is not yet on the fork when that case is first reviewed. Dates do not prove ancestry
order (a rebased or back-dated commit breaks it), which is why §1 item 3 has grok count the exposure on the actual list.

## 1. The day before (T0 − 24 h to T0)
1. `git -C $TH describe --tags --exact-match` prints `review-freeze-3`; `git -C $TH status --porcelain --untracked-files=no`
   prints nothing.
   **The worktree is bound to the main spend state (premortem gap G8; decision 076c item 9; `F1-freeze.md` §4.2):** run
   the verifier block of `docs/eval/tag-worktree.md` (codex, `775c3d6`, on `main` since merge `64a23a4`; grok's GO in
   `run/out/grok.tag-worktree-r2.md`). It exits 0 and its JSON line shows
   `samePhysicalLedger: true`, `envSame: true`, `trackedClean: true`, equal `ledgerUSD` in both checkouts and the main
   `.env`'s hard stop in both; `envSha256` equals the value in `ts-freeze.md`. `git -C $TH_MAIN diff --quiet review-freeze-3 -- pnpm-lock.yaml`
   exits 0. A refusal, or any difference: stop. **The same verifier is run again before every paid invocation of §4
   and of H2** ("repeat the verification before every paid job", same document).
   **Models still served (gap G11):** the models-list read of `F1-freeze.md` §1 row 15 again: the three frozen ids are
   present. One missing: the window does not open.
2. **The forks hold no case branch (decision 076d items 1b and 1c).**
   `for R in medusa payload twenty bullmq; do echo "$R $(git ls-remote --heads https://github.com/SunnyBagal/$R.git 'refs/heads/cases/*' | wc -l | tr -d ' ') $(gh pr list --repo SunnyBagal/$R --state open --json number --jq length)"; done`
   prints four lines ending `0 0`: no dev case branch is left (P1 deleted them, `docs/specs/P1.md` §3b), no held-out
   branch has been pushed, and no PR is open. Anything else: stop. Run it again in the last hour before T0.
3. **The case list and the exposure count (decision 076d items 1c and 1f; addendum e).**
   - codex builds `$HO/cases.json` by the rule above and prints three numbers: rows (29), adjacent pairs whose base
     date goes backwards (0), ties broken by case id (a count). grok recomputes the same three numbers from the list
     and the clones on its own. Any difference, or a pair out of order: stop.
   - **grok re-runs the exposure count on that actual list before the first push:** for each of the 20 bug cases, at
     its own position, is its starting fix an ancestor of a base or head of any case at an **earlier** position on the
     same fork (`git merge-base --is-ancestor <fix> <ref>`, the method of `run/out/grok.ancestry.md`)? Dev branches are
     gone (item 2), so only held-out refs count. Report: exposed at first review, K of 20. **Expected 0 of 20** (codex
     and grok, each on its own, correction to decision 076d item 1). **Not 0: stop; Sunny rules again before anything
     is pushed** (item 1f). grok's file is counts only; the list stays on the held-out side.
   - The same count, for the re-triggers: of the 20, how many have their fix reachable from any **other** held-out
     case ref once all 29 are pushed. This is the most that can become exposed at a re-trigger (the correction's split
     gives 2 + 3 = 5 of the 11: the fixes that reach a held-out base). It is reported, not a stop.
4. **The scheduler (decision 076d item 3).** `scripts/testset/window-scheduler.ts` in `$TH` has the sha256 recorded in
   `ts-freeze.md`. Write `$HO/plan.json` (§3 gives every value; `t0` is the scheduled T0 of decision 078), then:
   - `sched --list` exits 0 and prints 64 slots with their UTC times: 29 first-trigger slots, re-trigger checks from
     slot 29, last slot 63, "dry run plan check passed"; the same with `--execute` prints "EXECUTE plan check passed"
     (`readPlan` applies the floors of `EXECUTE_MIN` and the grace maximum only then). Slot 0's time equals the
     scheduled T0.
   - `sched --print-pins > $HO/pins.json`: the sha256 of the scheduler, both `kit.ts`, `open-prs.ts`, the collector,
     the manifest, `tools.json`, the case list and the plan (`pinnedPaths`). Compare the code and `tools.json` values
     with `ts-freeze.md`. From now on none of these files changes: a change stops the scheduler at its next slot.
   - `$HO/sched` does not exist yet (a state dir belongs to one run; the scheduler refuses another run's log).
5. Decision 078 is pushed: predictions, the scheduled T0, Sunny's "go". If "go" is missing, stop.
6. Greptile dashboard (Sunny): credits ≥ 35 (60 are expected: 100 − 2 for S1 − 38 for P1), and their expiry date is
   after the hand-check sitting (decision 076g item 2). Otherwise stop. This is Sunny's **last** look
   at any vendor dashboard or fork PR page until his filled sheet is hashed (`F1-freeze.md` §1 row 13, gap G2).
   CodeRabbit (decision 076b item 3): P1's report says the hourly rate at P1's end was not below the rate at its start,
   **or** T0 is at least 7 days after P1's last review. Otherwise stop. P1's slowest completed review took under 8 hours
   (P1 report item 2, "maximum minutes to outcome"; S1's for Greptile): the last re-trigger slot is 9 hours before the
   snapshot (§3). If one took longer, tell Sunny before T0.
7. `for f in medusa twenty payload bullmq; do gh api repos/SunnyBagal/$f/actions/permissions; done` → four `"enabled":false`.
8. `gh auth status` shows the SunnyBagal **user** (`open-prs.ts` requires it for triggers; see its header).
9. Dry runs again from `$TH`: the runner per repository (F1 §4.4), and `open-prs.ts` without `--execute` for the case
   at position 1 only (`--ids <id>`; it prints the push and the PR it would make and writes nothing). 0 refusals.
10. Sunny reads the Nebius console balance with its UTC time (the baseline for the ratio).
11. No other paid process is running, and none starts until §6 is done. artu1 confirms this in writing.
12. **The machine stays awake for the whole run (premortem gap G4; decision 076e addendum c).** The run needs the
    operator's machine from the scheduler's start (scheduled T0 − 0:30) to the end of §6's hashing (about
    T0 + 73:30): about 74 hours, which is more than the window's 72. **Sunny runs `caffeinate -is -t 280800`
    (78 hours) from about 09:00 IST on the day of the scheduled T0**, an hour before slot 0, so it holds until about
    scheduled T0 + 77:00. The machine is on mains power with its lid open: `-s` holds only on AC power
    (`man caffeinate`), and a closed lid may sleep a laptop whatever assertion is held (estimate; not tested on this
    machine). **§2 checks the assertion before the scheduler starts.** At every operator visit:
    `pmset -g assertions | grep -c caffeinate` is not 0, and `sched --status` shows `missed: 0`. A machine that slept
    shows as `missed` slots (failure 7). If T0 comes more than three hours after the scheduled T0 (failure 16), the
    78 hours end before §6 does: tell Sunny, who starts a second `caffeinate` before the first one ends.
    **A `caffeinate` with no time limit also passes** (decision 076g item 9: the `caffeinate -is` started on 13 Nov
    has none and holds until it is killed). If that is the one held, nobody kills it before §6's hashing is done,
    and the three-hour sentence above does not apply.

## 2. Scheduled T0 − 0:30: start the scheduler; nothing is pushed yet
```sh
pmset -g assertions | grep caffeinate; pmset -g batt | head -1        # preflight (076e addendum c): read before going on
L0=$(ledger); echo "L0=$L0 $(date -u +%FT%TZ)" >> $HO/job.md          # the job-start ledger value (076c item 1)
sched --pins $HO/pins.json --execute --detach
sched --status | jq '{t0, execute, side, boots, missed, stopped}'
```
- **Preflight, before the scheduler starts (decision 076e addendum c).** The first line lists a sleep-preventing
  assertion held by `caffeinate` (Sunny's `caffeinate -is -t 280800`, §1 item 12) and says `AC Power`. Where the
  listing shows the time left before the assertion is released, it is over 266,400 s (74 hours, to the end of §6).
  macOS's exact lines were not captured when this was written; what must be true is that a `caffeinate` process holds
  the assertion. **No such line, or battery power: do not start the scheduler; tell Sunny.** He starts `caffeinate`,
  the check is read again, and the scheduler must still start before scheduled T0 + 0:30. Write the check's result
  and its UTC time into `$HO/job.md`.
- `--detach` restarts the scheduler as a session leader with no terminal; it prints its pid and writes pid, parent
  pid and process group to the log and the state file at every start (`main`, `runScheduler`). Check: the last entry
  of `boots` has `ppid` 1. It sleeps until the scheduled T0; **no branch is pushed and no PR is opened before slot 0.**
- Started later than scheduled T0 + 0:30 (the grace), slot 0 is `missed` and position 1 takes slot 1: start it early.
- Write the scheduled T0, the scheduler's pid and the sha256 of `cases.json`, `plan.json` and `pins.json` into
  `$HO/job.md`. T0 itself (the first PR's `created_at`) is added at the first visit after slot 0 ("Two clocks").
- The operator's session may end now. Everything in §3 happens without it.

## 3. Scheduled T0 to scheduled T0 + 63:00: pushes, PRs and triggers, one slot per hour
**The plan file** (`$HO/plan.json`; every field is required, `readPlan`):
```json
{ "v": 1, "t0": "<scheduled T0, UTC, from decision 078>", "slotSeconds": 3600, "firstSlot": 0, "retriggerFromSlot": 29, "lastSlot": 63,
  "retriggerDueSeconds": 86400, "graceSeconds": 1800, "minTriggerSpacingSeconds": 3600, "firstTriggerAttempts": 2,
  "timeoutSeconds": { "open": 600, "trigger": 300, "collect": 300, "retrigger": 300 } }
```
- `slotSeconds`, `minTriggerSpacingSeconds` 3600: one slot per hour and at least an hour between two triggers of one
  tool on two PRs (CodeRabbit is planned at 1 review per hour; U11: the schedule stays 1 per hour even if P1 measured
  more). `retriggerDueSeconds` 86400: 076c item 3. **These three are the floors of `--execute`** (`EXECUTE_MIN`):
  `readPlan` refuses a lower value.
- `graceSeconds` 1800: a slot later than 30 minutes is not fired (failure 7). **1800 is the most `--execute` allows**
  (`EXECUTE_MAX_GRACE_SECONDS`), not a floor: `readPlan` refuses a longer grace and accepts a shorter one.
- `firstTriggerAttempts` must be **exactly 2** (`FIRST_TRIGGER_TRIES`; addendum e): any other value refuses.
- The window uses all five values as written; they are frozen in the protocol (§7; decision 076e item 2).
- **Open since 14 Nov, to be settled before the tag.** CodeRabbit allows 1 review per hour (S1's reading), and Sunny
  asked for at least 61 minutes between two CodeRabbit posts. A slot posts for CodeRabbit at most once, re-triggers
  included (`runFirst` runs one trigger command; `runRetrigger` returns after the first PR it posts for; `spacing`
  counts trigger and re-trigger ends per tool). But 3600 gives 3,600 s from one command's end to the next one's
  start (3,600.7 s in S1), not 3,660. **What fits: `slotSeconds` and `minTriggerSpacingSeconds` both 3660** (`readPlan`
  accepts values above its floors). Slots 0–63 then still hold 29 first triggers, 29 worst-case re-triggers and 6
  spare; a re-trigger check is due 24 slots after its trigger, not 25; the last slot is at scheduled T0 + 64:03 and
  the last possible re-trigger has 7 h 57 min before the snapshot, not 9 h. Raising only the spacing to 3660 does
  not fit: the lag then grows by about 68 s a slot and passes the 15-minute stop line at about slot 13. Both values
  are rulings (076e item 2) and are in the protocol, so nothing above is changed until Sunny says so.
- `timeoutSeconds`: open 600, trigger 300, collect 300, retrigger 300 are **ruled** (decision 076e item 2) and are
  not changed at run time. They are ceilings for a hung command, not times a slot can absorb. **A slot's commands
  end inside the slot only at the expected command time**, which is about a fifth of those timeouts or less (the
  values were sized at five times the slowest command expected; an estimate until S1's scheduler log and P1's
  trigger log give measured durations). At the ceilings themselves they do not ("The post inside a slot drifts
  later", below). Before F1, S1's measured durations are projected to the 29th slot: longest open + 29 × (longest
  branch read + longest trigger) over 900 s, which is failure 17's line, goes to Sunny before the tag (ruled:
  decision 076e addendum e).
- `firstSlot` 0, `retriggerFromSlot` 29, `lastSlot` 63: the slot room, below.

**A first-trigger slot (`runFirst`).** The slot serves the lowest position that has neither succeeded nor used its two
tries. For that case the scheduler runs, in this order: `open-prs.ts --ids <id> --execute` (**push the case's two
branches, open its PR**); the spacing wait; the read of the fork's branches (`gh api --method GET
repos/<fork>/branches`, logged as `fork-branches` with every branch name and tip); `open-prs.ts --trigger
coderabbit,greptile --ids <id> --execute` (the tools of `tools.json`, both in one command). With no failure, position
p is served in slot p − 1: position 1 at T0, position 29 at T0 + 28:00.
- **Retry (addendum e).** If the slot fails (`failed:open`, `failed:branches`, `failed:trigger`) or is missed, the
  **next slot serves the same case again**, before any later case's branch is pushed. A try is a slot that started
  for the case; a slot missed while the scheduler was down is not a try. After two failed tries the scheduler logs
  `failed-first-trigger` once and the next case follows. Every extra slot moves all later first triggers back by one.
- `failed-first-trigger` means "no confirmed success in two tries", not "nothing was posted": a try can fail after the
  PR opened or after one tool was triggered. The resume file (`$HO/open-prs/<fork name>.resume.jsonl`) is the record of
  what was pushed, opened and posted; a tool with a `triggered:<tool>` record still gets its re-trigger check. The
  operator does not push, open or trigger such a case by hand (§5 failure 1).
- **The post inside a slot drifts later; the grid does not.** A trigger command starts no sooner than 3600 s after
  the **end** of the last trigger command on another PR (`spacing`), and `runFirst` opens the PR before that wait.
  So slot n's trigger ends about O + (n + 1) × T after the slot's planned start (O = one open command, T = one branch
  read plus one trigger command): the lag grows by one trigger-command length per slot.
  - *At the expected command time the lag stays inside the slot.* Commands that take seconds give a few minutes by
    the 29th case; at a fifth of the timeouts (120 s and 60 s) the 29th trigger ends about 31 minutes into its slot
    (estimate).
  - *At the timeout ceilings it does not.* With O = 600 s and T = 300 s the lag passes 3600 s around the tenth case,
    and from about slot 16 the following slot would start more than 1800 s late and be `missed` (failure 7).
  - **So a trigger command that ends more than 15 minutes after its slot's planned start is a stop (failure 17).**
    The log has every step's planned time and end. **The 15-minute stop line and its pre-freeze check (longest
    open + 29 × (longest branch read + longest trigger) ≤ 900 s from S1's run, else Sunny before F1) are rulings:
    decision 076e addendum e.**
  - Slots start on the grid from the scheduled T0 as long as the lag is under an hour.

**Re-triggers (decisions 076b item 2, 076c items 2 and 3; `runRetrigger`).** First triggers always go before
re-triggers: no re-trigger check is made while any first trigger is pending, and never before slot
`retriggerFromSlot`. From then on, each slot takes the lowest position that is due (every triggered tool's first
`triggered:<tool>` record is 24 h old) and not yet handled, and checks it **at the slot** (a review may have arrived
since). Per tool, after the spacing wait, the scheduler runs the collector for that one case (`--window-start <the
plan's t0> --window-end now --resume-file …`, into `$HO/sched/check/`; the plan's `t0` is the scheduled T0, which is
at or before every trigger), then acts on the status:
  - `completed` → nothing for that tool, ever (076c item 3). A review that completed with zero inline comments is
    `completed`: the bot left a review object or an issue comment that matches no `notCompletion` pattern.
  - `no-review` (nothing arrived, or only messages that match the tool's frozen `notCompletion` patterns: a rate-limit
    comment, an error or "Failed" message, an "in progress", "review skipped" or "paused" message) → the fork's
    branches are read and logged again (`fork-branches`, `before: "retrigger:<tool>"`), then **one re-trigger** for
    that tool on that PR, by the re-trigger mode (below). Never a second.
  - `invalid-binding` → failure 5; no re-trigger.
  - a collection that cannot be read is tried once more in the same slot; if it fails again the slot passes without a
    re-trigger and that PR is first at the next slot (`passed:collection-failed-twice`).
- If no tool needed a re-trigger, the position is handled and the same slot goes on to the next due position; a slot
  ends when a re-trigger was posted or no position is due. One slot posts for one PR at most.
- A re-trigger is never posted because a review looks thin or missed something, and never by hand.
- A tool that was never triggered on a PR gets no re-trigger (the mode refuses it too).

**Slot room (addendum e; `run/out/bunny.076d-r2.md`, "For Planner A").**
- `firstSlot` 0: slot 0 is the scheduled T0.
- `retriggerFromSlot` **29**: the lowest value `readPlan` accepts for 29 cases (it must be after slot 28, the last
  first-trigger slot when nothing fails). It needs no extra room of its own: the scheduler holds every re-trigger
  check back while a first trigger is pending, so each retried or missed first-trigger slot moves the start of the
  re-trigger checks back by itself. A higher value would only delay checks that are already due.
- `lastSlot` **63** = 57 + 6. Count, with X = extra slots used by first triggers (failed tries and missed slots) and by
  re-trigger slots that passed without a post:
  - the first triggers end at slot 28 + X;
  - a position's check cannot come before 24 h after its own trigger, and the post sits a little after its slot's
    start, so the check of the case triggered in slot s is at slot s + 25 at the earliest: slot 53 + X for the last
    position;
  - worst case, every position needs a re-trigger, one PR per slot: slots 29 + X … 57 + X.
  So slot 63 covers X ≤ 6 when every PR needs its re-trigger, and X ≤ 10 when few do. **Six spare slots is the
  ruling (decision 076e item 2):** each spare slot is one failed try, one missed hour or one unreadable collection.
- **If the room runs out.** First triggers go first, so what is lost first is the last positions' re-trigger checks:
  such a tool on such a PR stays as it is, `no-review` if no review completed (failure 6).
  - *Failed tries alone cannot push a first trigger past the last slot:* two tries for each of 29 cases end by
    slot 57.
  - *Missed hours can.* A missed slot is not a try, so with enough of them 28 + X passes 63, and the last positions
    get no first trigger at all. Such a case's PR never opened: it is named in `--never-opened` and is `no-review`
    for both tools (§6).
  - Nothing is posted after slot 63. The counts of unreached re-trigger checks and of cases never triggered are
    reported as deviations (§7).

| scheduled T0 + | slot | what happens |
|---|---|---|
| 0:00 – 28:00 | 0 – 28 | one case per slot: push its branches, open its PR, trigger both tools; a failed or missed slot is repeated for the same case before the next case is pushed; **no re-trigger** |
| 29:00 – 63:00 | 29 – 63 | first triggers still owed go first; then one re-trigger slot per hour: the lowest due position that still needs one, checked at the slot |
| 64:00 onward | — | no trigger of any kind (earlier, if the queue emptied earlier: the scheduler writes `scheduler.done` and ends) |
| **T0** + 72:00 | — | the snapshot (§6), counted from the actual T0: scheduled 72:00 plus the difference between the two clocks. **The window is still 72 hours** (decision 076 S0.4; protocol §7) |

Before decision 076d the triggers ran from T0 + 1:00 to T0 + 58:00 and the last possible re-trigger had 14 hours
before the snapshot; it now has 9 (slot 63 at scheduled T0 + 63:00), plus the difference between the two clocks.

**Who keeps the clock (gap G4; decision 076c item 11, amended by 076d item 3).** The hourly slots run from **bunny's
window scheduler, detached, with its own log, not from an agent's session**: a background process of a session here
dies after 2 hours (`docs/bench/results.md` §8 "Losses", "v1 dev run 2 was void"). The scheduler is
`scripts/testset/window-scheduler.ts` (`b5-window-scheduler` @ `2c51913`, merged at `4b99fb4`; codex's GO names
`2c51913`, `tracehound-testset/run/out/codex.076d-r3.md`). Its properties, each from its header and the function named:
- **Detached:** `--detach` starts it as a session leader with no terminal; pid, parent pid and process group are
  logged at every start (`main`); a lock file allows one copy per state dir (`runScheduler`).
- **Resumes from its log:** `$HO/sched/scheduler.log.jsonl` has one fsynced line per action with its UTC time, planned
  time and delay, and is the source of truth; a restarted scheduler replays it (`replay`): a step that ended with
  exit 0 is never run again; a step that was cut runs again only after none of its processes is left. To restart
  after a crash or a reboot, run §2's `--detach` line again, unchanged.
- **Dry run by default:** without `--execute`, `open-prs.ts` is called without it and re-trigger checks are listed,
  not run. `--execute` needs `--pins`.
- **Held-out only with codex's flag:** `--side heldout` needs `--heldout-ok`; on `--side dev` any held-out path or id
  refuses (`guardSide`).
- **Absolute slot times** from one `t0` (`slotTime`); a slot starts only within the grace, later it is `missed` and
  nothing is fired late.
- **Pins:** before every slot the sha256 of every pinned file is compared; a difference stops it (exit 3).
- **Every command has a timeout** and runs in its own process group; at the timeout the whole group is killed, and
  the scheduler goes on only once the group is seen gone. If that cannot be established it stops (exit 3) rather than
  risk a retry that overlaps a late write. It never clears, retries or kills on unknown process evidence (codex's
  finding P2-R1, fixed at `2c51913`).
- **The branch log:** with `--execute`, right before every trigger and every re-trigger command the fork's branches
  are read (the scheduler's only own `gh` call, GET only) and logged with their tips. If the list cannot be read in
  two attempts, nothing is posted: a first-trigger slot fails (`failed:branches`, a try), a re-trigger slot passes.
  The log holds case branch names, so it stays in `$HO`.
- Exit codes: 0 finished, 2 refused, 3 stopped. stdout (`$HO/sched/scheduler.out`) has one line per action and never
  a title or a comment text; each command's own output is under `$HO/sched/steps/`.

**Evidence that it keeps time:** codex's 8-slot rehearsal on `2c51913` (dev cases, real hours, no `--execute`, one
SIGKILL and restart after slot 0; `run/out/codex.076d-r3.md`, `run/out/codex.076d-r3-rehearsal/`; last slot
2026-11-13T04:26:39Z). Its final result is a pass with all eight slots assessed (first lines of
`run/out/codex.076d-r3.md`); F1 §1 row 14 reads it. The rehearsal is a dry run. **The scheduler's first run with
`--execute` is S1** (decision 076e item 1; `docs/specs/S1.md` step 2): two dev cases, two hourly slots, both tools,
re-triggers off. So a push, a PR opening, the branch read and a real trigger are each made twice through the
scheduler before the window, and F1 §1 row 14 (e) reads the result. **What the window is still first to do against
GitHub:** a re-trigger check and a re-trigger made by the scheduler (P1 runs the re-trigger mode by its own command,
not through the scheduler), a run of more than two slots with `--execute`, and `--side heldout`. Until then those
were exercised only against stand-in `gh` and `git` in tests and in bunny's and codex's integration runs
(`run/out/bunny.076d-r2.md`, `codex.076d-r3.md`). That is stated here as a risk, not fixed.

**What the operator does during §3.** Nothing, unless §5 says so. At each visit (at least every 8 hours; the
operator's session may end and restart at any time): `sched --status | jq '{missed, slotsLateOver30Min, stopped, ended}'`
and `tail -3 $HO/sched/scheduler.out`. `stopped` not null, or the process gone without `scheduler.done`: §5 failure 15.
Also at each visit: how long after its slot's planned time the latest trigger command ended (the log's planned time
and the step's end); over 15 minutes: §5 failure 17. And `pmset -g assertions | grep -c caffeinate` is not 0 (§1
item 12). The operator never types a trigger, a push or a `gh` write.

**The re-trigger command (gap G5; decision 076c items 9 and 15).** The re-trigger mode of `open-prs.ts` is on the
testset repo's `main` (`060c644`; functions `runRetriggers` and `readCollectorStatus`; codex's GO on patch sha256
`32085be3…5900`). The hand-typed `gh` lines that stood here until it merged are gone; nothing is ever typed into a
held-out PR. The scheduler runs the mode itself, per tool, after the slot's check:
```sh
node $TS/scripts/open-prs.ts --manifest $MAN --fork SunnyBagal/<fork name> --resume-file $HO/open-prs/<fork name>.resume.jsonl \
  --retrigger <tool> --status $HO/sched/check/p<position>-<tool>.s<slot>.<n>/<tool>.status.json --ids <id> --execute
```
One tool per call; never together with `--trigger`. The mode takes the collector's verdict from the slot's check, so
there is no second definition of "no completed review". It requires (header of `scripts/open-prs.ts` at `060c644`;
decision 076d item 4, codex's finding P2-2): the status file is the one its `<tool>.collection.json` hashed, for the
same tool and fork; the collection's completion bound is the first trigger (`--resume-file`; a `--bound window-start`
collection never drives a re-trigger); its window is given as two UTC instants; and for the case, the window starts at
or before its first `triggered:<tool>` record and the earlier of the window end and the collection time is at least
24 h after it. It re-triggers only `no-review`; it skips `completed`, `invalid-binding` and a case not yet due; it
refuses `read-failed` or a missing status. It writes `retriggered:<tool>` to the resume file and never posts a third
trigger (a PR that already carries two trigger comments from the SunnyBagal user is recorded and skipped).

## 4. T0 + 2:00 onward: TraceHound, locally, from the tag
Runs are local: the runner reads each case's commits in the held-out clone and reads no fork, so they depend on
neither the pushes nor the triggers of §3 (`--post` is never passed). They start at T0 + 2:00, once slot 0 was seen
to end `done` (`sched --status`), and finish the same day (estimate from R1's timing; R2 was cut, decision 076g
item 1). **The row is A0, pool-verify-v1 on Nemotron, as frozen** (076g item 1): the runner line is R1's. One repository per invocation,
in the order medusa, payload, twenty, bullmq; a batch has at most 10 ids. This batch order is not §3's push order and
need not be: no tool sees a TraceHound run.
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
- **A Claude row on held-out exists only if decision 078 says Sunny registered one** (decision 076g item 4; his
  decision, by 16 Nov). Then 078 also states its model id, its cap, that the money is Sunny's own, and its order
  here; without those four it is not run. The default this runbook fixes: it runs **after** the four Nemotron
  batches and their reruns, from the same worktree, one process at a time, into `$HO/th-claude/`, never into
  `$HO/th`; it is a secondary row (`H2-scoring.md` §1 item 4); a failure of it never delays the snapshot. No such
  line in 078: nothing in this section calls any provider but Nebius.
- ≥ 2 hours after the last TraceHound call: Sunny reads the console; ratio = console drop ÷ (`ledger − L0`). Above
  1.08: log it and tell artu1 the number; **H1 continues** (it is never cut).

## 5. Failures and the rule for each
Where a rule says "tell Sunny", what the operator does if no answer comes within the wait is in
[`handover.md`](handover.md) §4, one row per point. It is frozen with this runbook.
| # | failure | rule |
|---|---|---|
| 1 | A first-trigger slot fails (`failed:open`, `failed:branches`, `failed:trigger`) | The scheduler serves the same case again in the next slot, before any later case is pushed (addendum e); the operator does nothing and pushes, opens or triggers nothing by hand. After two failed tries the case is `failed-first-trigger`: read the resume file for what was actually done. A tool with a `triggered:<tool>` record keeps its normal path (re-trigger check, §6 with `--resume-file`). A tool with no such record on an open PR is collected with `--bound window-start`; a case whose PR never opened is named in `--never-opened` and is `no-review` for both tools (§6). TraceHound still runs the case locally. Each such case is a deviation in §7. |
| 2 | A tool reviews a PR before its trigger (auto-review) | The trigger now follows the opening inside the same slot, so this cannot be checked before the trigger and the trigger is posted anyway. It is counted afterwards: at the snapshot, per tool, the PRs with a bot object created before that tool's `triggered:<tool>` time (raw files against the resume file; a count). Such an object does not complete a review (the bound is the first trigger); an inline comment inside the window is counted like any other. Reported as a deviation. S1 and P1 are where auto-review is ruled out beforehand (`docs/specs/P1.md` §1); if Greptile's own messages show it on several PRs, tell Sunny at once in words only (credits); he does not open the dashboard or the PRs (gap G2). |
| 3 | CodeRabbit posts a rate-limit comment | No review ran (https://docs.coderabbit.ai/management/rate-limits). Its wording is a frozen `notCompletion` pattern, so the PR is `no-review` at its re-trigger slot (§3) and gets the one re-trigger. Do not re-trigger earlier than 24 h after the PR's own trigger (076c item 3). The same holds for an "in progress", "review skipped" or "paused" message that is the tool's only object (decision 076d item 2). If a message's wording does **not** match a frozen pattern, the collector says `completed`: do not re-trigger by hand; log it as a deviation and tell Sunny in counts only. |
| 4 | Greptile shows "Failed" | Same: the one re-trigger, at that PR's re-trigger slot (§3). |
| 5 | A PR's base or head no longer equals the case pair | The attempt is invalid (`invalid-binding`); nothing is pushed or repaired; that case is `no-review` for the external tools. Find out who pushed, after the window. |
| 6 | A tool still has no completed review after its re-trigger | `no-review`: no catch in K of 20, left out of that tool's pairs, n reported (076a §13.4). |
| 7 | A slot is missed (machine asleep, scheduler down, GitHub down): the state file's `missed` is not 0 | The scheduler fires nothing late. A missed first-trigger slot is not a try: the same case is served at the next slot, and every later first trigger moves back one slot. A missed re-trigger slot: the due position is checked at the next slot. The operator posts nothing by hand and never two triggers in one hour to catch up. Find the cause and remove it (item 12 of §1; failure 15). Each missed slot uses one of the six spare slots (§3). A case whose first trigger is pushed past slot 63 by missed slots is never opened: §6, `--never-opened`. |
| 8 | Greptile runs out of credits | Seen only through Greptile's own message on a PR; nobody opens the dashboard during the window (gap G2). Remaining PRs are `no-review` for Greptile. Nothing is bought. |
| 9 | TraceHound cases end `failed` | One rerun each, after the last batch and at least 2 hours after the failure. **Canary (decision 076b item 4), only when two held-out cases in a row failed with a provider or transport error:** stop the batch (the cases without a record are unstarted and roll forward). Run S1's dev case fresh from `$TH` as a canary: `--manifest $TS/cases/dev/manifest.json --clone $TS/repos/<its repo> --ids <S1's case> --out-dir $HO/canary/<try> --fixes off --contracts off --cache off`, with `--max-usd-per-case` and `--max-usd-run` both set to $0.40 minus what earlier canary tries spent. At most **3 tries, at least 30 minutes apart, $0.40 in total, charged to the reserve**. A canary that ends `ok`: continue the batch and, later, the reruns. **All 3 fail: stop everything on the TraceHound side and tell Sunny**; no rerun is spent while the provider is down. Triggers and the snapshot go on. |
| 10 | A case hits its $0.40 cap (`cap`) | One rerun, same rule. A second `cap` is a miss. |
| 11 | The operator's process is killed mid-batch | Records are written per case and never overwritten. Start the same batch again with the ids that have no record; spend already made counts in `ledger − L0`. |
| 12 | A case has no official record at T0 + 72:00 | A miss (076a §13.3). |
| 13 | codex is unavailable for more than 2 hours | grok takes over from `$HO/window.log`, `sched --status` and this runbook; the handover time is logged. The scheduler does not need either of them to keep running. |
| 14 | Anything this table does not cover | Do nothing that changes what a tool sees. Log it, tell Sunny (not artu1) with counts only, and wait for his answer. |
| 15 | The scheduler stopped (`stopped` is not null, exit 3) or its process is gone without `scheduler.done` | Read the reason in `sched --status`. **A pinned file changed:** put the file back to its pinned bytes (never write new pins during the window), then start again. **A command's processes could not be confirmed ended:** look at the process group the log names; wait until it is gone; do not kill a group you cannot identify; then start again. **The process is gone (reboot, crash):** start again. "Start again" is §2's `--detach` line, unchanged: the scheduler replays its log, runs no finished step twice and fires no slot late. Slots that passed meanwhile are `missed` (failure 7). More than six slots lost in total: tell Sunny in counts; the window end does not move. |
| 16 | The first PR does not open in slot 0 | Slot times stay on the scheduled grid (every slot is counted from the plan's `t0`), and the same case is served again at slot 1 (addendum e). **T0 is the instant the first held-out PR does open** (decision 076e item 3), so the snapshot moves with it: T0 + 72 h, later than scheduled T0 + 72 h by the difference. Write both times and the difference into `$HO/job.md`, and tell Sunny the difference in minutes: the hand-check sitting is planned six hours after the scheduled snapshot. Over three hours: §1 item 12 as well. Reported as a deviation. |
| 17 | A trigger command ended more than 15 minutes after its slot's planned start (the stop line is a ruling: decision 076e addendum e) | The commands are slower than the plan allows for, and the lag grows by one trigger-command length per slot (§3, "The post inside a slot drifts later"): past an hour the next slot starts late, and past 90 minutes it is `missed`. Stop in the sense of failure 14: change nothing by hand, do not stop or restart the scheduler, and tell Sunny (not artu1) in counts only: the slot, the minutes, the longest open and trigger commands so far. Wait for his answer. A deviation in §7. |

## 6. T0 + 72:00: the snapshot
T0 in this section is the **actual** T0, the first held-out PR's `created_at` in `$HO/job.md` ("Two clocks"), not
the plan's `t0`.
```sh
cd $TH && for T in coderabbit greptile; do for R in medusa payload twenty bullmq; do
  node scripts/testset/collect-tool-reviews.ts --side heldout --heldout-ok --tool $T --config scripts/testset/tools.json \
    --repo SunnyBagal/$R --manifest $MAN --pr-map $HO/pr-map.$R.json --window-start <T0> --window-end <T0 + 72 h> \
    --resume-file $HO/open-prs/$R.resume.jsonl --ids <the cases with a triggered:$T record> --out $HO/tools-$R
done; done
( cd $HO && find th tools-* open-prs sched cases.json plan.json pins.json -type f | sort | xargs shasum -a 256 > hashes.window.txt && shasum -a 256 hashes.window.txt )
```
(`pr-map.$R.json` from the resume file as in `docs/specs/S1.md` step 8. If the collector refuses a second tool in the
same `--out`, use `$HO/tools-$R-$T`.) `<T0>` is the actual T0; when slot 0 worked at its first try it is seconds
after the plan's `t0`. The scheduler has ended by then (`$HO/sched/scheduler.done`
exists, or its last slot is over; if it is still running at T0 + 72:00, something is wrong: failure 14). `sched/` holds
the scheduler's log with the branch lists, its state, every command's output and the re-trigger checks; all of it is
hashed. Start the collection at T0 + 72:00, not earlier and not later than T0 + 73:00;
`--window-end` is T0 + 72 h exactly, so a late start does not let late comments in. Nothing collected is edited.
- **A case with no `triggered:<tool>` record (decision 076d item 4).** With `--resume-file` the collector refuses a
  listed case that has no such record, and it refuses to run with no bound at all (`main` in
  `collect-tool-reviews.ts`, `85ade2f`). So the main run above lists only the triggered cases, and each fork's
  untriggered cases get their own run with the explicit bound:
  `… --bound window-start [--never-opened <ids whose PR never opened>] --ids <the untriggered cases> --out $HO/tools-$R-untriggered`
  (`b696231`). `--bound window-start` reads a PR that opened but whose tool was never triggered, from the window start.
  `--never-opened` writes a case with no PR as `no-review` without any `gh` call; an id named there that has a PR
  number in the map refuses, and a case with no PR number that is not named there refuses too.
  `<tool>.collection.json` records which bound applied (`completionFrom`) and the `neverOpened` ids. **A flagged
  collection is a deviation, reported as a count, and it never drives a re-trigger** (the re-trigger mode refuses it).
  With no failure in §3 there is no such case and this run is not made.
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

**Exposure, from the branch log (decision 076d item 1d; addendum e).** Nothing is computed here; the inputs are now
fixed and hashed: `$HO/sched/scheduler.log.jsonl` (the `fork-branches` records: every branch and tip on the fork right
before each trigger and each re-trigger command), the resume files (which command actually posted) and the raw
collections (when each review arrived). codex derives the exposed set from them in H2 (`H2-scoring.md` §1.5). They
hold case branch names and stay on the held-out side.

## 7. Report: `run/out/codex.ho-run.md` (counts and spend only; no case id, title, path or text)
PRs opened of 29; per tool: triggered, completed, no-review, re-triggers used, auto-reviews, rate-limit comments;
TraceHound: ok / failed / cap / unstarted, reruns, misses by rule, chunks failed, empty reviews; spend: job, reserve,
canary; console ratio; every deviation with its failure number; the single sha256 of `hashes.window.txt`; the fork check before T0 (four lines `0 0`); grok's exposure counts on the actual list (at first review K of 20; the most that can be exposed at a re-trigger); the scheduled T0, T0 (the first PR's creation time) and their difference, and the time the snapshot's collection started; the stay-awake preflight's result (§2); trigger commands that ended more than 15 minutes after their slot's planned start (a count; failure 17) and the longest open and trigger commands in seconds; cases never triggered because missed slots ran past slot 63; first triggers: done at the first try, done at the second, `failed-first-trigger`; slots: started, `missed`, late by more than 30 minutes, extra slots used of the 6 spare, re-trigger checks not reached by slot 63; branch-list reads that failed; scheduler starts (count), stops with exit 3 (count, reason in words), and whether the operator's session restarted while it ran; re-triggers posted per tool; cases collected with `--bound window-start` and with `--never-opened` (each a deviation); bot objects created before their PR's trigger, per tool; comments by unlisted logins and distinct unlisted Bot logins (gap G6); the record check's one line as "equal to the freeze: yes / no", from codex and from grok (gaps G7, G8); the ledger total before T0 in the worktree and in the main checkout; `invalid-binding` and `read-failed` counts per tool. Then the
`.done` marker. artu1 writes STATE, LOG, the budget log row and the brain entry from this file alone.

## 8. The three most likely ways to get this wrong
1. **Helping a tool.** Re-triggering a completed review, re-triggering twice, typing a trigger or a push by hand
   because the scheduler failed a slot, waiting past T0 + 72 h for a slow tool, or rerunning an `ok` TraceHound case
   for a better draw. Each one makes the comparison unequal and cannot be undone.
2. **Leaking held-out, or exposing it early.** Running from the main checkout, writing outside `$HO`, pasting a case
   title into the report, letting artu1 read the pane; pushing a held-out branch before its slot (a "test push", an
   `open-prs.ts --execute` over the whole manifest as in the pre-076d runbook), or leaving a dev branch on a fork. The report is counts; everything else stays in `$HO`.
3. **Spending against the wrong cap.** `RUNCAP` is recomputed before every invocation from the ledger and the
   job-start value in `$HO/job.md`; a second paid process (a judge run, a dev rerun) during a batch eats the cap and
   strands cases: one paid process at a time across all jobs (076c item 1). A worktree whose ledger or `.env` is a
   copy instead of the main checkout's file has no hard stop at all; the verifier catches that only if it is run.
