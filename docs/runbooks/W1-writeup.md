# Runbook W1: the write-up, with the claim wording for every outcome

For artu1 (writes), codex (checks every sentence against a count), Sunny (reads before it is public). Planner A,
2026-11-11. Plan: [`plan-v2`](../plan/2026-11-11-plan-v2.md) §2. Protocol: `docs/eval/ts-protocol.md` §6, §11 (it wins
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
4. **What was run.** Tag `review-freeze-3`, candidate arm and attempts, model, the command shape, window start and end
   (UTC), triggers, re-triggers used, who operated.
5. **How it was scored.** One golden per bug case (alternates as OR-targets), counted comments, two judges, the blind
   hand-check and what was on the sheet, the policy file.
6. **Judges versus hand-check.** Per tool: K by judge v1, by judge x1, by hand; items the hand-check rejected and added.
   Then one line on the guess column (decision 076c item 7), with the counts of `handcheckGuess` in
   `ts-heldout.summary.json` and nothing added: "After deciding every item, the checker guessed which tool had written
   each comment: right for R of the G items he guessed (U marked unsure, N items in all); naming the commonest tool
   every time would have been right for M of N.
7. **Secondary rows** (the two other TraceHound arms; judges only, not hand-checked), marked report-only. Counts
   only; no test and no p-value on a secondary row, against anything.
8. **Predictions.** The table of decision 078, each scored right / wrong / too vague to score.
9. **Selection history.** Dev runs 1 and 2, the gates and their verdicts (link to `docs/bench/ts-dev.md`), and the
   sentence "the configuration was chosen on 40 dev cases before the held-out cases were opened".
10. **Failures and deviations.** Every numbered failure of `H1-window.md` §5 that occurred, with counts.
11. **Limits** (§4, all of them, unshortened).
12. **Cost.** Ledger spend for H1 and H2, console ratio, cost per PR measured on this set. If the frozen candidate is
    A1 or A2 it was run by the unchanged runner and extracted by replay, so two figures are given (decision 076b item 5):
    the cost paid per PR, and beside it the cost of the adopted arm's own calls from the ledger.
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

`$D` is the cost **paid** per pull request. For an adopted A1 or A2 add: "($D_arm for the calls the reported
configuration itself uses; the run also executed the verifier.)" (076b item 5).

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

## 4. Limits (all 12 go on the page)
1. 20 bugs and one run: intervals are wide, and only large differences can be detected (power in plan-v2 §2).
2. The bugs are ones a later merged fix repaired, found by SZZ and labelled by two labellers; they are not all the bugs
   in those pull requests. A comment on a real defect that no later fix repaired counts as unmatched, so the share of
   matching comments is a lower bound on precision.
3. "Clean" means no qualifying later fix was found, not bug-free.
4. The configuration was selected on 40 dev cases from three of the same repositories.
5. The hand-check was done by the project owner, blind to the tool. Only comments that a judge matched or that lie
   within 10 lines of a labelled range were on the sheet; a match outside that set would be missed for every tool alike.
   Tool-specific formatting was stripped by fixed patterns; residual style cues cannot be excluded: the checker's
   guesses of the tool were right for R of G (section 6), against M of N for always naming the commonest tool.
6. What the other tools could see: each fork's default branch was set to the last upstream commit before 2026-07-01;
   neither vendor documents which ref its repository context is built from (`run/out/grok.tool-facts.md` rows 7, 11).
   CodeRabbit reviewed payload's cases under payload's own configuration file, which is part of that code.
   CodeRabbit was left at its defaults, under which web search is "Enabled unless explicitly disabled" and pull-request
   context "Uses past PRs for context" (https://docs.coderabbit.ai/knowledge-base); what it looked up is not known.
   All 29 case branches sit in four forks; grok's ancestry count before the freeze says how many case branches carry
   another case's later fix (`run/out/grok.ancestry.md`, 2026-11-12: the starting fix of 11 of the 20 held-out bugs
   is an ancestor of another case's base on the same fork, so it was present on the fork in another branch; 5 of the
   29 held-out bases contain another case's fix). The number is restated from the file at write-up time, with Sunny's
   ruling on it (`F1-freeze.md` §1 row 16) (premortem gap G16).
7. CodeRabbit and Greptile ran on free plans, triggered by hand, within their rate and credit limits; a tool that
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
