# How the team works: ten changes, a brief template, and who owns which files (Planner B, 2026-11-11)

Read for this: `.agents/STATE.md`, `.agents/LOG.md`, `CLAUDE.md`, `AGENTS.md`, `docs/herdr.md`, and in
`~/Projects/tracehound-testset/run/`: `briefs/` (86 files), `comms/`, and the report names in `out/` (118 `.done`
markers). Base: `main` at `fc1b16e`. $0; no held-out file opened.

Each change below is tied to something that went wrong and is written down. None changes the reviewer, a gate or a
ruling. They are proposals: Sunny says yes or no to each; artu1 applies the ones accepted (they touch `AGENTS.md`,
`CLAUDE.md`, `STATE.md` and `run/briefs/_common.md`, none of which is mine).

## 1. The ten changes

| # | change | the failure it answers | cost |
|---|---|---|---|
| 1 | One brief, one session | the same brief ran in two sessions | one file per task |
| 2 | One ownership table | three files describe three different lane maps | one edit, then pointers |
| 3 | Every ruling lists the files it changes | documents kept the old rule for hours | a few lines per decision |
| 4 | A GO names a commit, and the branch stops there | a commit landed after the GO | none |
| 5 | Cite a symbol or a commit, not a bare line | the same check is cited at four line numbers | none |
| 6 | A stuck lane has a deadline and a stand-in | codex sat on a permission prompt across three sessions | a table |
| 7 | Nothing longer than 90 minutes lives in a session | a paid run was killed at the 2-hour limit | a start-up habit |
| 8 | The orchestrator hands over in writing | a builder became orchestrator and merged its own branches | one note |
| 9 | The firewall is in every instruction file, and unknown scripts are read before they run | two near-misses on held-out | one edit |
| 10 | One brain review per day | six review rounds in one day on the one reviewer everything waits for | none |

### 1. One brief, one session
**What happened.** Sunny's plan-audit brief was pasted into the planner session and into artu1. The planner wrote and
sent three briefs and edited `CLAUDE.md` and `AGENTS.md` before it saw that artu1 had the same task; artu1 had made the
same edit, and one copy had to be removed (`run/comms/planner.plan-audit-handoff.md:3-10`).
**Change.** A brief's first line names its one recipient. Before starting, the recipient creates
`run/out/<lane>.<task>.claim` (session name, UTC time). If the file exists, it stops and tells Sunny. A session that
receives a brief addressed to someone else does nothing with it.

### 2. One ownership table
**What happened.** `AGENTS.md:11-16` still describes two lanes ("Benchmark lane (relay)", "Product lane (Codex)") with
path ownership from before Herdr. `CLAUDE.md` ("Herdr team") describes five agents by role and names no paths.
`STATE.md:17` adds planner-only folders. Result: plan v2, three specs and a runbook hand protocol decisions to
"Planner B" (`docs/plan/2026-11-11-plan-v2.md:178`, `docs/specs/B2.md:135-137`, `docs/specs/P1.md:101-102`,
`docs/runbooks/F1-freeze.md:4`) while the protocol file is codex's and Planner B may not edit it; and bunny had to edit
a planner file under "Sunny's explicit exception" (`run/briefs/bunny-076b.md:9`). `AGENTS.md:16` says "Never merge
your own PR" and `CLAUDE.md` says "Small, meaningful commits pushed to `main`".
**Change.** The table in §3 goes into `AGENTS.md` and replaces "Who works where"; `CLAUDE.md`, `STATE.md` and
`_common.md` point to it and repeat nothing. An exception is one dated line under the table (who, which file, which
lines, until when).

### 3. Every ruling lists the files it changes
**What happened.** 076a changed the firewall order, and `docs/budget.md` kept 076's sentence until 076b item 6 fixed it
(`docs/decisions.md:3948-3949`). 076b ruled the re-trigger queue and the canary; `docs/runbooks/H1-window.md:9-12` still
calls both assumptions, and the protocol on `codex/ts-protocol` is one revision behind. The policy file is
`policy-076a.json` on `main` while S1's precondition names `policy.076a.json`, so S1 cannot start on `main`
(`docs/specs/R1.md:76-77`, `docs/specs/S1.md` precondition 2).
**Change.** A decision entry ends with a line "Touches:" naming every file that states the old rule, with its owner.
artu1 copies that list into STATE's open tasks; a file leaves the list when its owner's commit is on `main`. grok greps
for the old wording once the list is empty and reports the count.

### 4. A GO names a commit, and the branch stops there
**What happened.** codex gave GO on B1 at `8707752`; a further commit (`bec2ead`) was added afterwards and needed a
second review (`.agents/LOG.md:145-146`). The B2 spec was written after B2 was built, and B1's checklist while B1 was
merging (`docs/specs/B2.md:5-10`, `docs/specs/B1-review.md:5-6`).
**Change.** The reviewer's first line is `GO <full sha>` or `NO-GO <full sha>`. A branch under review gets no new
commit until the verdict; a commit after a GO voids it without anyone having to notice. Only that sha is merged. A
spec written after its code says "as built at <sha>" in its first line and lists differences; it does not instruct.

### 5. Cite a symbol or a commit, not a bare line
**What happened.** The runner's one-repository check is cited at `run-tracehound.ts:215` (plan v2 F-a), `:218-219`
(codex's audit, row R01) and `:219` (grok's D1 review). Its stop rule is `:663` in decision 076 and `:676-681` in
codex's audit. While I wrote today's two files, line numbers I had cited in `STATE.md` and `docs/budget.md` moved when
076b landed.
**Change.** A citation into code is `file:line@<7-character sha>` or `file` plus the function's name. A citation into
STATE, LOG, budget or decisions is the section heading or the decision number, never a line.

### 6. A stuck lane has a deadline and a stand-in
**What happened.** codex was blocked on a permission prompt at the end of three logged sessions
(`.agents/LOG.md:89`, `:146`, `:158`); its queue held every review. devin ran out of daily, then weekly quota
(`LOG.md:44`, `:56`, `:82`), and the methodology lane has been empty since.
**Change.** (a) A brief lists under "Needs approval" every command class it will run that can raise a prompt, so Sunny
can allow them when the brief is sent. (b) A brief has a "report by" time; with no `.done` by then, artu1 reads the
pane once, writes one line to Sunny, and reassigns by this table: review codex → grok; methodology devin → grok, then
Planner B; build bunny → codex; held-out operation codex → grok. (c) A lane with no stand-in who may read held-out
does not start a held-out task.

### 7. Nothing longer than 90 minutes lives in a session
**What happened.** Dev run 2 of the earlier benchmark was killed by the session's 2-hour limit on background commands
at pull request 30 of 40, after $1.4429, and was never scored (`docs/bench/results.md:232-233`). The held-out window
needs an action every hour for 58 hours (`docs/runbooks/H1-window.md:68-81`).
**Change.** A job that can run longer than 90 minutes is cut into pieces that each finish in 90, with a resume file,
or is started detached from the agent's session with its own log and `.done`. A brief for such a job says which. A
schedule that needs a clock (the hourly triggers) has an owner for the clock that is not an agent's turn.

### 8. The orchestrator hands over in writing
**What happened.** artu1 reached its session limit and bunny, a builder, acted as orchestrator: it merged B1 and B2,
which it had built, and pushed the brain (`.agents/LOG.md:149-155`). `_common.md:13` tells every worker "Do not run
`git push` at all", and `AGENTS.md:16` says never merge your own work. codex's GO covered both merges, so nothing went
wrong; the rules were simply not the ones in force.
**Change.** When artu1 will be away it writes `run/comms/orchestrator.handover.md`: who stands in, until when, and
three lists: may (send briefs, merge a branch at a sha codex gave GO on), may not (approve spend, change a ruling,
touch held-out), and what waits for artu1. The stand-in appends what it did. Spend approval never transfers.

### 9. The firewall is in every instruction file, and unknown scripts are read before they run
**What happened.** artu1 ran codex's attribution script once before seeing that it added the held-out object store as
an alternate, and read devin's pane once and saw two pull-request numbers (`.agents/LOG.md:84-87`). Both were caught
and neither exposed a held-out case. The held-out rule is in `STATE.md:8`; `AGENTS.md:18-22`, which the non-Claude
agents read, lists Cal.com and four old directories and not `tracehound-testset/heldout`.
**Change.** `AGENTS.md` "Blindness" carries the held-out rule in full (paths, clones, panes, and from T0 the four
public forks' pull requests and GitHub notifications; see `docs/plan/premortem.md` row 16). A tuning-side agent reads
the header and runs the dry run of any script another lane wrote before its first real run. A script that can read
held-out does so only behind an explicit flag (the kit and the attribution script already do).

### 10. One brain review per day
**What happened.** codex has written six brain reviews (`run/out/codex.brain-review{,2,3,3b,3c,4}.md`), with a seventh
briefed (`run/briefs/codex-076b.md` §3), and three of the rounds were NO-GO (`.agents/LOG.md:115`, `:125`).
On 2026-11-11 the same reviewer also had C1, the protocol, the plan-v2 audit and the B2 follow-up queued.
**Change.** Brain edits collect in the working tree and go to codex once a day, as the last item of its queue, never
ahead of a review that blocks a merge or a paid job. The standing rule "every brain change needs a codex GO before
push" is unchanged.

## 2. Brief template
One file per task, `run/briefs/<lane>.<task>.md`; the report is `run/out/<lane>.<task>.md` and the marker
`run/out/<lane>.<task>.done`, the same stem (today briefs use `-` and reports `.`; `docs/herdr.md` already shows the
dotted form).

```markdown
# <lane>.<task>: <what, in one line>
To: <one agent>   From: artu1   Sent: <UTC>   Report by: <UTC>   Cost: $0 | cap $<x> from budget line <name>
Side: dev only | held-out allowed (codex, grok, devin only)

## Read first
- run/briefs/_common.md
- <file@sha or decision number> … (only what this task needs)

## Task
1. <step: one action, one result>
2. …

## You may write
- <exact paths>          Everything else is read-only. Owner table: AGENTS.md.

## Needs approval
- <command classes that can raise a permission prompt, or "none">

## Done when
- <checkable condition with the expected count or exit code>
- Gates, if code changed: pnpm test, pnpm typecheck (plain shell; the GIT_* check prints nothing)

## Report (run/out/<lane>.<task>.md, then the .done marker last)
- First line: the verdict or the counts.
- Commit(s) as full sha; files changed; what was not done and why.
- Every claim: file@sha, a command with its output, or a URL. Estimates labelled.
- Held-out work: counts only; no case id, title, path or text.

## If something does not match
The brief is a hypothesis. A premise that fails against the repository is reported with the evidence; do not work
around it. Stop and report also if: the claim file exists, a path here is not yours, or the task would cost money.
```
Before it is sent, a brief passes three checks by its author: every sha in it is the current head it means; the
"may write" paths belong to the recipient in the ownership table; no other open brief has the same stem.

## 3. Who owns which files
The rule: **one owner per path; everyone else proposes through a note or a branch the owner merges.** "Owns" means
writes and merges; reading is open except where the firewall says otherwise.

| path | owner | others change it by |
|---|---|---|
| `.agents/STATE.md`, `.agents/LOG.md`, `docs/decisions.md`, `docs/budget.md`, `CLAUDE.md`, `AGENTS.md`, `run/briefs/` | artu1 | a note in `run/comms/` |
| `~/Projects/tracehound-brain` (curated notes) | artu1 writes; codex GO before every push | a raw report in the brain's `inbox/` |
| `docs/plan/` (except the two below), `docs/specs/`, `docs/runbooks/` | Planner A | `run/comms/<lane>-to-planner-a.<task>.md` |
| `docs/plan/premortem.md`, `docs/plan/team-process.md`, `run/comms/planner.b.*.md` | Planner B | a note to artu1 |
| `docs/eval/ts-protocol.md` | codex | Sunny's ruling recorded by artu1; a planner's note |
| `packages/`, `scripts/` (code and tests), `docs/bench/ts-dev.md` | bunny builds on a branch; codex reviews; artu1 merges the reviewed sha | a finding in the review report |
| `tracehound-testset`: `labels/`, overlays, `heldout/`, the held-out window directory | codex (grok as second) | counts-only reports in `run/out/` |
| `tracehound-testset`: `cases/dev/`, `repos/` (dev clones), `scripts/` | bunny builds; codex reviews; artu1 commits | the same |
| `run/out/<lane>.*` | the lane named in the file | never edited by anyone else |
| `run/comms/<from>-to-<to>.*` | the sender; the answer file belongs to the receiver | — |
| `docs/bench/ts-heldout.*`, `docs/bench/ts-freeze.md` | codex (held-out side), artu1 (freeze file) | — |
| money: any paid call | only artu1 approves; never delegated | — |
Rules that go with it: a planner writes documents and never executes; a worker writes only the paths its brief lists;
nobody commits in another lane's checkout; a file with no row here belongs to artu1 until a row is added.

## 4. What stays as it is
The `.done` marker as the only completion signal, reading files instead of panes, counts-only reports from the held-out
side, dry run before `--execute`, "plans are hypotheses", and codex's GO before a merge or a paid run all worked in the
log and need no change.
