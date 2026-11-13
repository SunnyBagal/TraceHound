# Runbook: handover. Who decides what from 17 Nov

For artu1, codex (H1's operator), grok (backup operator), bunny. Sunny reads it once and corrects it. Planner A,
2026-11-14 (first pass; decision 076g item 8 is its basis). Cost: $0.

**Why this file exists.** From Tue 17 Nov the window can open (plan-v2 §6a), it runs for 72 hours mostly without
anyone watching, and Sunny's outside help ends that day. `H1-window.md` sends something to Sunny, or stops for
him, at the sixteen points listed in §4. A
window that waits for an answer each time can stall; a window in which agents decide by themselves can drift from
the protocol. This file says which decisions artu1 takes alone, which still go to Sunny, and what the operator does
at each of H1's "tell Sunny" points if no answer comes.

**It takes effect** when it is on `main` after grok's pass and Sunny has not objected. H1's sha256 is frozen at the
tag (`F1-freeze.md` §3), so this file is finished before the tag and its own sha256 goes into `ts-freeze.md` beside
H1's and H2's.

## 1. Four rules above everything else here
1. **Nothing here changes a ruling, a cap, a counting rule, the frozen reviewer or the firewall.** Where this file
   and a decision differ, the decision is right and the difference is reported.
2. **The firewall binds artu1 after the handover exactly as before** (`AGENTS.md` "Blindness"). artu1 decides from
   counts-only files in `run/out/`. It never asks for a case id, a title, a path or a comment text, never reads the
   operator's pane, and makes no `gh` or browser read of the four forks from T0 until the firewall lifts. **A
   decision that needs a held-out detail is never artu1's:** it is taken by the default in §4, by codex and grok
   together (§4, last row), or by Sunny.
3. **A tuning agent never decides what a tool sees.** artu1 and bunny tune TraceHound later. Any choice that would
   change what CodeRabbit or Greptile is shown, when it is triggered, or which of its comments count, is Sunny's or
   is already fixed by a default below. That is why H1 says "tell Sunny (not artu1)".
4. **Every decision taken alone is written down within the hour:** what was decided, the rule or the default it
   rests on, the UTC time, the counts. artu1 writes in `.agents/LOG.md`; the operator writes in `$HO/window.log` and
   `run/out/codex.ho-run.md`. A default that was applied is a deviation in H1 §7 and in `W1-writeup.md` §4 limit 11.

## 2. What artu1 decides alone
Decision 076g item 8: "artu1 decides operator detail (slot counts, timeouts, stop lines, wording) and logs it;
Sunny rules only on goals, money and test design."

| area | artu1 decides alone | limit |
|---|---|---|
| Operator detail on the dev side | slot counts, timeouts, stop lines, waits, the order of $0 work, a path or a flag a spec has wrong | not in the window: after the tag, H1's and H2's values are frozen with their sha256 |
| Lanes | who runs a job, stand-ins, the 90-minute rule, briefs | one owner per path stays (`AGENTS.md`) |
| Spend inside a cap | the approval row of every job that has a budget line; reruns a spec allows | never above the line's cap |
| The reserve, for its named uses | infrastructure reruns (held-out first), a held-out case left unstarted at H1's cap (076a item 4), the canary up to $0.40 (076b item 4) | nothing else from the reserve |
| Decision 077 | the H1 cap from `docs/specs/E1.md` §5's method, funded from unallocated up to the computed value; the stop/go verdict as read by E1 §2 | the method is not changed; no other use of unallocated |
| Stop/go verdicts GO and INCONCLUSIVE | the freeze goes ahead | RETHINK is Sunny's (§3) |
| Dates, by rule | the scheduled T0 from plan-v2 §6a's three rules; a slip of the tag or of the start moves it day for day | a slip that breaks the Greptile expiry date or the 7-day rule goes to Sunny |
| Merges and documents | a merge on the reviewer's GO; docs-only changes on one grok pass; brain notes after the pattern scan | 076g item 8 |
| The 900-second check before the tag | if S1's durations project over 900 s (`H1-window.md` §3): whether the 15-minute stop line stays or is set to the projected lag plus 5 minutes, at most 30 | decided before the tag, logged, written into H1 before its sha256 is taken |
| The write-up | filling `W1-writeup.md`'s templates from the committed counts | a sentence that is not a template, and the final "yes", are Sunny's |

## 3. What still comes to Sunny
**Goals.** A stop/go verdict of RETHINK. Postponing or cancelling the window for any reason this file does not
turn into a date rule. What is claimed, and the final reading of the page before it is public.

**Money.** Any spend with no budget line or above a cap. Raising a cap. Unallocated money for anything but 077's
cap reset. A console ÷ ledger ratio above 1.08 (stop, then him). Buying Greptile credits. The Anthropic lines are
his own money: anything beyond the $4 and $8 caps.

**Test design.** Everything in §1 rule 3. Also: excluding or adding a case; an exposure re-count above 0 before the
first push (076d item 1f); the exposed-set rule; completion and counting rules; a bot message of a kind nobody named
(076f item 4); an unlisted Bot login (H1 §6); a multi-line comment that would change a location hit (P1 report
item 8); CodeRabbit unable to sustain 1 review per hour (U11); registering a Claude row for held-out (076g item 4,
by 16 Nov); anything that would change the registered pairs or the pooled analysis.

**Things only he can do.** They are appointments, not questions:

| when | what |
|---|---|
| before P1's first Greptile trigger | read the Greptile credits' expiry date (076g item 2) |
| after R1's first batch; again at least 2 h after R1 | read the Nebius console: balance, and usage by model (076g item 7) |
| by Mon 16 Nov | say whether a Claude row is registered for held-out; answer a RETHINK if there is one; write "go" for the window in decision 078 |
| the day before the scheduled T0 | read the Greptile dashboard (credits, expiry) for the last time; read the Nebius console; unsubscribe from the four forks and filter their mail (`F1-freeze.md` §1 row 13) |
| about 09:00 IST on the day of the scheduled T0 | the Mac: mains power, lid open, `caffeinate` held (`H1-window.md` §1 item 12; the one started on 13 Nov has no time limit and passes if it is still running) |
| at least 2 h after the last TraceHound call of H1 | read the Nebius console |
| the snapshot's day, 16:00–19:00 IST (fallback: the next day, same hours) | the blind hand-check, one sitting; then confirm the hash of his file |
| after W1's draft | read the page and say yes or no |

**His blindness is part of this.** From T0 until his filled sheet is hashed he opens no vendor dashboard, no fork
page and no mail from the forks. A message to him in that time carries the failure's number, counts and the default
that will apply, and nothing about what any tool wrote. Fewer questions in the window is itself a protection, which
is the second reason for the defaults below.

## 4. H1's "tell Sunny" points, each with its default
**How a point is handled.** The operator writes the message as a file first, `run/comms/to-sunny.<n>.md` (counts
only: the H1 section or failure number, the counts, the default below, the time it will apply), then tells Sunny by
the channel in use. If the only channel is artu1, artu1 passes that file on unchanged. **The wait is 2 hours**,
counted inside 08:00–22:00 IST; a point raised at night waits until 10:00 IST. The 2 hours are Planner A's number;
Sunny or artu1 may set another before the tag.

**Two kinds of default.** *Go on:* the action that changes nothing a tool sees and keeps the schedule and the
snapshot; it applies when the wait is over. *Hold:* nothing starts, or nothing is scored, until Sunny answers; a
hold has no time limit, and what it costs is written beside it. **No default ever starts a window, posts a trigger
by hand, repeats a review or changes which comments count.**

| # | H1 | the point | default if no answer | kind |
|---|---|---|---|---|
| 1 | §1 item 3 | grok's exposure count on the actual case list is not 0 of 20 | Nothing is pushed. The window does not open; the scheduled T0 moves day for day (plan-v2 §6a rule 2) until Sunny has ruled (076d item 1f). No agent excludes a case or reorders the list | hold |
| 2 | §1 item 6 | Greptile credits under 35, or their expiry before the hand-check | The window does not open. Credits are money | hold |
| 3 | §1 item 6 | P1's slowest completed review took 8 hours or more | The window opens as scheduled, with slot 63 as the last slot (a ruling, 076e item 2). The fact goes into `$HO/job.md` and the report: a review that slow after a last-slot re-trigger would miss the snapshot | go on |
| 4 | §1 item 12; failure 16 | T0 came more than three hours after the scheduled T0, so a 78-hour `caffeinate` ends before §6 | If the assertion held has no time limit (076g item 9), nothing. Otherwise the operator starts one itself, detached: `nohup caffeinate -is -t <seconds from now to T0 + 76 h> &`, checks `pmset -g assertions`, and logs it. It changes nothing a tool sees | go on |
| 5 | §2 preflight | no `caffeinate` assertion before the scheduler starts | The operator starts `caffeinate -is -t 280800` itself, detached, reads the check again, logs it, and starts the scheduler if the check now passes | go on |
| 6 | §2 preflight | the Mac is on battery power | The scheduler is not started: no agent can plug the machine in. If it is still on battery at scheduled T0 + 0:30, the window slips a day: artu1 sets the next day's 10:00 IST by §6a rule 2, the plan file gets the new `t0` before anything is pushed, and the day-before checks that have a date in them are read again | hold |
| 7 | §3, `timeoutSeconds` | before the tag: S1's durations project over 900 s | artu1 decides (§2, "The 900-second check"). This is Planner A's reading: decision 076e addendum e sent the check to Sunny, and the later 076g item 8 gave stop lines to artu1. If Sunny keeps addendum e's wording, this row is a hold: no tag until he answers | artu1 |
| 8 | §4, record check | the records are not one line equal to the freeze | Nothing is scored and nothing is rerun. Triggers and the snapshot go on: they do not depend on TraceHound's records. H2's judging does not start, and the hand-check moves to its fallback day. codex and grok write the counts (records by commit, by flag) for Sunny. No agent decides which records are valid | hold |
| 9 | failure 2 | Greptile's own messages show automatic reviews on several PRs | Nothing changes. The scheduler goes on; nobody opens the dashboard (Sunny must not, gap G2). The reviews are counted at the snapshot (076e item 6). If the credits run out, failure 8's rule applies: the remaining PRs are `no-review` for Greptile and nothing is bought | go on |
| 10 | failure 3 | a bot message does not match a frozen pattern, so the collector says `completed` | It stays `completed`, as the frozen rule says. No re-trigger, by hand or otherwise. Counted and reported as a deviation. A new pattern is never added in the window | go on |
| 11 | failure 9 | all three canary tries failed | TraceHound's side stays stopped and nothing more is spent: a fourth try is money. Triggers and the snapshot go on. The operator asks again at T0 + 24:00 and T0 + 48:00 with the number of cases that have no record. A case with no official record at T0 + 72:00 is a miss (076a §13.3) | hold |
| 12 | failure 14 | something the failure table does not cover | For the 2 hours: nothing that changes what a tool sees; the scheduler goes on. Then codex and grok together, both on the held-out side, take the option that changes nothing a tool sees, keeps the schedule and the snapshot, and loses the least data, and each writes one line agreeing. If there is no such option, or they differ, nothing is done until Sunny answers | go on, within that limit |
| 13 | failure 15 | more than six slots lost in total | The scheduler goes on; the window end does not move. Re-trigger checks not reached and cases never triggered are handled by H1 §3 "If the room runs out" and §6, and counted | go on |
| 14 | failure 16 | the first PR opened late; the difference in minutes | The snapshot is at T0 + 72 h (a ruling, 076e item 3). Up to 60 minutes late: the hand-check keeps its slot. More than 60 minutes: the hand-check moves to the fallback day at the same hours, and Sunny is told at once, because he stays blind a day longer | go on |
| 15 | failure 17 | a trigger command ended more than 15 minutes after its slot's planned start | The scheduler is left alone; it is not stopped or restarted. If the lag passes an hour, slots start late; past 90 minutes they are `missed`, and failures 7 and 15 apply. The count is in the report. Nothing an agent could do here changes the lag without changing the schedule | go on |
| 16 | §6 | comments by a Bot login that is on nobody's list | H2's judging does not start, and the hand-check moves to its fallback day. Whether a login belongs to a tool decides which comments count, and it cannot be settled after the sheet is built without breaking the blind order (sheet hashed, then unblind). No agent adds a login to `tools.json` | hold |

**The points H1 sends to artu1, not to Sunny**, stay as they are: the console ÷ ledger ratio after H1's TraceHound
runs (above 1.08: logged, artu1 is told the number, H1 continues; §4), and the counts-only report (§7).

**A hold that lasts.** A hold before T0 moves the scheduled T0 day for day; artu1 re-reads the two date conditions
each day (Greptile's expiry after the hand-check; the 7-day rule if CodeRabbit's rate shrank). A hold after the
snapshot keeps Sunny blind: he is told only that the sitting has moved. If the hand-check cannot happen on the
fallback day either, the result waits for him. Nobody else hand-checks (decision 076, S0.6).

## 5. Not in this pass
- `H2-scoring.md` and `F1-freeze.md` name Sunny in seven more places (the exposed set that cannot be derived, a
  second run of the final score that differs, a preflight refusal at the freeze, and others). Every one of them is
  a hold: nothing is scored or tagged without his answer. A second pass, before the tag, lists them the way §4 does.
- How Sunny is reached after 17 Nov, and whether the 2-hour wait and the 08:00–22:00 window suit him, are his to
  say. This file assumes one channel exists and that artu1 can use it.
- If Sunny registers a Claude row for held-out, its failures need rows of their own in H1 and here.

## 6. The three most likely ways to get this wrong
1. **Reading "artu1 decides operator detail" as "artu1 decides in the window".** After the tag the operator's
   values are frozen. In the window the only choices are the defaults of §4, and none of them is artu1's.
2. **Turning a hold into a go because the clock is running.** A window that does not open costs a day. A window
   that opened on a broken precondition, or a score made from disputed records, cannot be repaired afterwards.
3. **Telling Sunny more than counts.** Each message in the window is a channel to the blind hand-checker. The file
   in `run/comms/` is the whole message.
