# Runbook W1: the write-up, with the claim wording for every outcome

For artu1 (writes), codex (checks every sentence against a count), Sunny (reads before it is public). Planner A,
2026-11-11; brought to decision 076e (item 5, addendum d) on 2026-11-13 and to decision 076g (items 1, 4, 5) on 2026-11-13. Plan: [`plan-v2`](../plan/2026-11-11-plan-v2.md) §2. Protocol: `docs/eval/ts-protocol.md` §6, §11 (it wins
over this runbook). Cost: $0. Starts after H2's commit (`docs/bench/ts-heldout.summary.json`) and the firewall lift.

The wording in §3 is copied into decision 078 at F1, **before** the window. W1 only fills the placeholders. A sentence
that is not one of these templates, or a placeholder filled from anything but the committed counts, is a defect.

## 1. Files, in one pull request
| file | what changes |
|---|---|
| `docs/bench/ts-heldout.md` | new: the result page (§2) |
| `docs/bench/results.md` | one new section, "Fresh TypeScript PRs (held-out, 2026-11)", with the headline table and a link; the old tables are not edited |
| `viewer/` `/benchmark` page | the same table; `viewer/test/benchmark.test.tsx` requires its tables to equal `results.md`'s (decision 063), so both change in the same commit |
| `README.md`, section "PR reviewer benchmark" | two to four sentences from §3 and the link |
| `docs/decisions.md` | decision 079: the result, predictions scored, what was rejected |
| `FEEDBACK.md` | the Nebius entry for H1 and H2 (counts, failures with exact error strings, latency) |
| `docs/budget.md` | final log row with Sunny's last console reading and its UTC time |
| `.agents/STATE.md`, `.agents/LOG.md`, the brain | rewritten / appended by artu1; counts only in the brain |

## 2. `docs/bench/ts-heldout.md`: sections in this order
1. **Result in three sentences** (§3.1, §3.2, §3.3).
2. **Headline table.** One row per tool (TraceHound, CodeRabbit, Greptile): reviews completed of 29; bugs caught of 20
   (hand-checked) with the Wilson 95% interval; comments per PR (mean, median); comments on the 9 clean cases; cost per
   PR (TraceHound only; "free tier" for the others).
3. **Pairs.** Two pairs were registered before the run and are the only tests (decision 076c item 4): **TraceHound vs
   CodeRabbit** and **TraceHound vs Greptile**. For each: bug cases reviewed by both (m), paired n, caught only by the
   first, only by the second, exact two-sided sign-test p, and one sentence from §3.2. **CodeRabbit vs Greptile: counts
   only** (m, n, only-first, only-second); no p-value, no sentence, no word about which did better.
3b. **Exposed and unexposed catches, reported separately (decision 076d item 1d).** One small table, three rows
   (TraceHound, CodeRabbit, Greptile), two column groups: on the E exposed bug cases, caught K and reviews completed;
   on the 20 − E unexposed bug cases, the same. The numbers are the two `exposure` lines per tool of
   `ts-heldout.summary.json`. Above the table, these sentences and no others: "A bug case is called exposed if, at
   the time CodeRabbit or Greptile reviewed it, the commit that later fixed the bug could be reached from another
   case's branch on the same fork. E of the 20 bug cases were exposed. At each case's first review the number was 0;
   the E cases became exposed through a re-trigger or a late review. No test was made on either group." With E = 0
   the table's exposed columns read "0 of 0 (no exposed bug cases)" and the second and third sentences become "No bug
   case was exposed at any review." Counts only: never a rate or a percentage on either group, never a comparison of the two
   groups in words, and never "the tools did not use the fix": the run cannot show what a tool read.
4. **What was run.** Tag `review-freeze-3`, the arm (A0, pool-verify-v1, attempts 2: frozen by decision 076g item 1), model, the command shape, window start and end
   (UTC), the push order in one sentence (one case per hour, by base date, each pushed only at its own first trigger;
   decision 076d), triggers, first triggers that needed their second try or failed both, re-triggers used, who
   operated (a detached scheduler; the operator typed no trigger).
5. **How it was scored.** One golden per bug case (alternates as OR-targets), counted comments, two judges, the blind
   hand-check and what was on the sheet, the policy file.
6. **Judges versus hand-check.** Per tool: K by judge v1, by judge x1, by hand; items the hand-check rejected and added.
   Then one line on the guess column (decision 076c item 7), with the counts of `handcheckGuess` in
   `ts-heldout.summary.json` and nothing added: "After deciding every item, the checker guessed which tool had written
   each comment: right for R of the G items he guessed (U marked unsure, N items in all); naming the commonest tool
   every time would have been right for M of N.
7. **Secondary rows** (the two other TraceHound arms, and a Claude row only if decision 078 registered one; judges
   only, not hand-checked), marked report-only. Counts only; no test and no p-value on a secondary row, against
   anything. **Then the pooled secondary analysis** (decision 076g item 5), if `H2-scoring.md` §6 step 4b ran: dev
   and held-out pooled for A0 (51 bugs), under the heading "Secondary", with protocol revision 10's wording, the
   dev table's label and grok's dev exposure count beside it. It is never in the three result sentences.
8. **Predictions.** The table of decision 078, each scored right / wrong / too vague to score.
9. **Dev history.** Dev run 1 and the dev table with its label (link to `docs/bench/ts-dev.md`), the stop/go verdict
   of decision 076g item 6, and the sentence "the configuration (pool-verify-v1) was fixed on 13 November 2026,
   before any result on the TypeScript dev cases existed and before the held-out cases were opened; it had been
   chosen earlier on a different benchmark (decision 059)". The dev rows for A1, A2 and the Claude models are
   named as report-only. There was no second dev run (cut by decision 076g).
10. **Failures and deviations.** Every numbered failure of `H1-window.md` §5 that occurred, with counts.
11. **Limits** (§4, all of them, unshortened).
12. **Cost.** Ledger spend for H1 and H2, console ratio, cost per PR measured on this set. The frozen arm is A0,
    the full pipeline, so one figure is given: the cost paid per PR (the two-figure rule of decision 076b item 5 was
    for an adopted A1 or A2, and none can be adopted since 076g).
No case id, PR number, file path, label text or comment text from held-out appears on the page.

## 3. Claim wording
Placeholders: `K_T`, `K_C`, `K_G` = hand-checked bugs caught of 20 by TraceHound, CodeRabbit, Greptile; `[L–U]` their
Wilson intervals; `a`, `b` = bugs caught only by the first and only by the second tool of a pair; `n` = paired n; `p` =
exact two-sided sign-test p; `R` = the repositories with their case counts (filled by codex, 076a §13.8); `C_x` =
mean comments per PR; `D` = TraceHound's measured cost per PR on this set.

### 3.1 Always (first sentence)
> On 29 fresh pull requests from R, 20 of which introduced a bug that a later merged fix repaired, TraceHound commented
> on K_T of the 20 bugs (95% interval L–U), CodeRabbit on K_C (L–U) and Greptile on K_G (L–U). Matches were proposed by
> two model judges and confirmed by hand without knowing which tool wrote each comment.

If a tool completed fewer than 29 reviews, add: "X reviewed N of the 29 pull requests; its count is over the 20 bugs,
and pairs use only the pull requests both tools reviewed."

### 3.2 Per registered pair (TraceHound against tool X; the test decides which template, not the size of the gap alone)
X is CodeRabbit or Greptile. These are the two registered tests: each an exact two-sided sign test at 0.05, **not
corrected for there being two**, exact p-values reported (decision 076c item 4). Order: the floor of 15 first (below),
then the test.
**Outcome A, the test rejects and TraceHound is ahead (p < 0.05, a > b; this needs at least 6 more bugs, e.g. 6–0, 8–1, 10–2):**
> TraceHound caught a bugs that X missed, and X caught b that TraceHound missed (n pull requests with a bug reviewed by
> both; exact sign test, p = P). On this set TraceHound caught more of the labelled bugs than X.

**Outcome B, the test rejects and TraceHound is behind (p < 0.05, a < b):**
> X caught b bugs that TraceHound missed, and TraceHound caught a that X missed (n; exact sign test, p = P). On this set
> X caught more of the labelled bugs than TraceHound.

**Outcome C, the test does not reject (p ≥ 0.05), whatever the gap:**
> TraceHound caught a bugs that X missed, and X caught b that TraceHound missed (n; exact sign test, p = P). That is no
> detectable difference at this sample size: with 20 bugs, only a gap of about 6 or more one-sided misses can be told
> apart from chance, and a true difference of 30 points in catch rate would be found about four times in ten if the
> tools' catches are independent (more often if both catch the same easy bugs; that was not measured).

- If the observed gap is 6 or more but p ≥ 0.05 (for example 9–3), it is outcome C; add "the observed gap of G bugs is
  not distinguishable from chance here".
- **Too few cases reviewed by both (premortem gap G10; decision 076c item 6).** A pair with fewer than **15** of the 20
  bug cases reviewed by both tools is reported as counts, with no test sentence. Let m = bug cases reviewed by both
  (`F1-freeze.md` §5 field 7 says how m is counted; `H2-scoring.md` §7 reports it). If m < 15, none of A, B, C is used
  for that pair. The sentence is: "Only m of the 20 bugs were reviewed by both TraceHound and X; TraceHound caught a
  that X missed and X caught b that TraceHound missed. That is too few for a test." The table shows m, n, a and b for
  that pair and a dash in the p column. The floor is checked before the p-value is looked at.
- If a + b = 0: "the two tools caught the same bugs" is allowed as a description of the 20 cases; it is still outcome C.
- CodeRabbit against Greptile gets **no** template: its row in the pairs table shows counts and nothing else (076c
  item 4). The same holds for the secondary arms.
- Outcomes A and B always end with: "One run, 20 bugs, R only; one of two registered tests, each at 0.05 with no
  correction for making two."

### 3.3 Always (volume and cost)
> TraceHound posted C_T comments per pull request, CodeRabbit C_C and Greptile C_G; on the 9 pull requests with no
> labelled bug they posted c_T, c_C and c_G comments in total. TraceHound ran on an open model (Nemotron 3.5 on Nebius)
> at $D per pull request.

`$D` is the cost **paid** per pull request. (The second figure of 076b item 5 was for an adopted A1 or A2; A0 is
frozen by decision 076g item 1, so it is not used.)

### 3.4 Never written, whatever the numbers
"beats", "outperforms", "wins", "best", a rank or "first/second/third", "matches", "as good as", "catches as many",
"on par", "equivalent", "comparable accuracy", "precision of X%" without "lower bound", "recall" without "of the
labelled bugs", any sentence about Augment, Cursor, Copilot or Bugbot on this set, any sentence about other languages,
any combination of this result with the earlier 50-PR benchmark into one number or one ranking. The earlier benchmark
may be cited next to it as a separate result with its own wording (`docs/bench/results.md`).

### 3.5 README (two to four sentences, in this order)
Sentence 3.1 shortened to the three counts with intervals; the pair sentence(s) for TraceHound's two pairs in their
outcome's short form ("no detectable difference at this sample size" / "caught more of the labelled bugs than X on this
set (p = P)" / "X caught more … (p = P)"); sentence 3.3's cost clause; the link.

## 4. Limits (all 13 go on the page)
1. 20 bugs and one run: intervals are wide, and only large differences can be detected (power in plan-v2 §2).
2. The bugs are ones a later merged fix repaired, found by SZZ and labelled by two labellers; they are not all the bugs
   in those pull requests. A comment on a real defect that no later fix repaired counts as unmatched, so the share of
   matching comments is a lower bound on precision.
3. "Clean" means no qualifying later fix was found, not bug-free.
4. The configuration was fixed before any result on the 40 TypeScript dev cases existed (decision 076g item 1); it
   had been chosen on an earlier benchmark of other repositories. The 40 dev cases, from three of the same
   repositories as the held-out cases, were then used for a stop/go reading and for report-only rows, and those
   numbers were known before the window. The pooled analysis mixes those dev cases with the held-out ones and is
   secondary for that reason.
5. The hand-check was done by the project owner, blind to the tool. Only comments that a judge matched or that lie
   within 10 lines of a labelled range were on the sheet; a match outside that set would be missed for every tool alike.
   Tool-specific formatting was stripped by fixed patterns; residual style cues cannot be excluded: the checker's
   guesses of the tool were right for R of G (section 6), against M of N for always naming the commonest tool.
6. What the other tools could see: each fork's default branch was set to the last upstream commit before 2026-07-01;
   neither vendor documents which ref its repository context is built from (`run/out/grok.tool-facts.md` rows 7, 11).
   CodeRabbit reviewed payload's cases under payload's own configuration file, which is part of that code.
   CodeRabbit was left at its defaults, under which web search is "Enabled unless explicitly disabled" and pull-request
   context "Uses past PRs for context" (https://docs.coderabbit.ai/knowledge-base); what it looked up is not known.
   **Other case branches on the same fork (premortem gap G16; decision 076d item 1 with its correction, and
   addendum e).** The page states all of this, with the numbers restated from the files at write-up time:
   - *Before anything was done:* the commit that later fixed the bug was an ancestor of another case's base on the
     same fork for 11 of the 20 held-out bugs (`run/out/grok.ancestry.md`, 2026-11-12). Of the 11, 6 could be reached
     only from a dev case's branch, 2 only from another held-out case's branch, 3 from both (`run/out/grok.076d.md`;
     correction to decision 076d item 1).
   - A second, different count: 5 of the 29 held-out bases contained another case's fix (3 of them a held-out fix, 2
     only a dev fix). The 11 counts fixes and the 5 counts bases; a fix can sit in several bases and a base can hold
     several fixes. **The two are not the same set, are not two views of one number, and are never added or set
     equal on the page.**
   - *What was done:* every dev case branch was deleted from the forks after the dev reviews were collected and
     before the window (item 1b), and the held-out branches were pushed one case at a time, in the order of their base
     commits' dates, each only at the hour of its own first trigger (item 1c). **Under that order, exposure at first
     review was 0 of 20**: counted by codex and by grok independently, and again by grok on the actual case list before
     the first push (`H1-window.md` §1 item 3).
   - *What remains.* Exposure is judged per review at the time the review was actually made, from the scheduler's log
     of the fork's branches before every trigger, not from the planned order (addendum e). A re-trigger comes 24 hours
     or more after a pull request's own trigger, when later branches are already on the fork, and a review that
     arrives late can see them too. E of the 20 bug cases were exposed in this way for at least one tool's review; at
     most 5 could be (the 2 + 3 fixes that reach a held-out branch). Section 3b shows every tool's catches on the
     exposed and on the unexposed cases separately; no case was left out.
   - *What deleting does not undo.* The dev pull requests were open on the forks for the days of the dev runs. A tool
     that indexed a fork then may keep what it read; the closed pull requests stay public, and GitHub keeps a
     read-only `refs/pull/<n>/head` ref for each (decision 076e item 5; the count per fork is in P1's report,
     `docs/specs/P1.md` §4 item 9, and is restated on the page). So "0 of
     20 at first review" is a statement about the branches on the forks, not about what a tool remembers.
   - TraceHound read no fork: it ran locally on each case's own commits.
7. CodeRabbit and Greptile ran on free plans, triggered by a comment posted from a scheduler, one pull request every 61
   minutes, within their rate and credit limits; a tool that
   delivered no review after one re-trigger is left out of its pairs, with n stated.
8. No row for Augment, Cursor Bugbot or Copilot. TypeScript only; the repositories named; these dates.
9. Costs: TraceHound's is the ledger figure for this run; the console-to-ledger ratio is stated.
10. TraceHound's comments were never posted to the pull requests. They are scored from the frozen runner's local
    output, capped at 15 per pull request, with one rerun allowed for a failed case; the other tools posted on GitHub
    under their rate and credit limits, with one re-trigger allowed for a failed review (premortem gap G18).
11. Every deviation from the protocol during the window, by its failure number.
12. Two tests were registered before the run: TraceHound against CodeRabbit and TraceHound against Greptile, each an
    exact two-sided sign test at 0.05. No correction was made for running two, so the chance that at least one rejects
    when neither tool differs from TraceHound can be up to 0.10 (the sum of the two levels). CodeRabbit against
    Greptile was not tested; its counts are shown. A pair with fewer than 15 of the 20 bugs reviewed by both tools gets
    no test sentence (decision 076c items 4 and 6).
13. **Two firewall slips before the window (decision 076e addendum d). Counts only.** The agents that later tune
    TraceHound must not see the held-out material. On 2026-11-13, before any held-out pull request was opened, two
    of them (artu1 and bunny) each ran one unrestricted `git status` in the test-set repository, and each was shown
    the **names** of 8 untracked files under its held-out directory (`docs/decisions.md` 076e addendum d;
    `run/out/bunny.076e-r1.md`). No file was opened, by either. The page states exactly that: 2 incidents, 8 file
    names shown in each, 0 files opened, both before the window; and the rule made the same day: every agent but the
    held-out operator runs git in that repository only with explicit paths outside the held-out directory. The page
    gives no file name, and it claims nothing about what the names could reveal beyond the counts: names were
    shown, no file was opened.

## 5. Checks before merge
1. codex: every number in `ts-heldout.md`, `results.md`, the viewer and the README equals `ts-heldout.summary.json` (or
   `ts-heldout.secondary.json`, or a dev file for §2.9); every sentence in the summary and README is a §3 template;
   `git grep -n -i -E "beats|outperform|on par|as many|matches|equivalent" -- docs/bench/ts-heldout.md README.md` shows
   nothing outside a quoted "never written" list.
2. `pnpm test` (the viewer's benchmark test), `pnpm typecheck`, the viewer build.
3. Sunny reads the page and the README section and says yes.

## 6. The three most likely ways to get this wrong
1. **Softening outcome C into a tie claim.** "No detectable difference" is about the test's power, not about the
   tools being equal. Do not paraphrase it.
2. **Leading with the favourable pair or the favourable metric.** The order is fixed: bugs caught for all three tools,
   then pairs, then volume and cost. If TraceHound is behind on bugs and ahead on comment count, the page says both, in
   that order.
3. **Updating `results.md` without the viewer, or the reverse.** CI fails on unequal tables; worse, a half-merged
   state publishes one of them. One pull request, one commit for both.
