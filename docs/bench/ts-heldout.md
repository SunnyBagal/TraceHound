<!--
W1 SKELETON (bunny, b23-w1-skeleton, decision 076z item 2). Not a result. Built before any held-out number existed, only
from docs/runbooks/W1-writeup.md, decision 078, docs/eval/ts-protocol.md rev 13, docs/bench/ts-dev.md and the
runbooks' field names. Every held-out value is a {{placeholder}} named after its source field:
  {{tools.<tool>.<field>}}, {{pairs[<a>,<b>].<field>}}, {{exposure.<field>}}, {{handcheckGuess.<field>}},
  {{handcheckX1Fallback}}       docs/bench/ts-heldout.summary.json (tools: tracehound, coderabbit, greptile;
                                pairs in --tool order, so a = tracehound in both registered pairs)
  {{secondary:<field>}}         docs/bench/ts-heldout.secondary.json (rows pool-raw, review-diff-v1, haiku1, haiku2; 4c)
  {{pooled:<field>}}            docs/bench/ts-heldout.pooled.json (only if H2 §6 step 4b ran)
  {{ho-score:<item>}}           run/out/codex.ho-score.md (H2 §7 counts that the summary JSON does not carry)
  {{h1:<item>}}                 H1's report / $HO/job.md (window, triggers, failures by H1 §5 number)
  {{budget:<item>}}             docs/budget.md (ledger, console ratio)
  {{p1:<item>}}                 P1's report (docs/specs/P1.md §4 item 9)
  {{decision-number}}           the result decision's number (W1 §1 says 079; 079 is now the product rule)
Outcome-dependent text: every branch is present, each opened by {{if …}} and closed by {{end if}}. W1 keeps the one
branch that holds, deletes the others and every marker, and deletes this comment. Dev numbers (section 9, limit 14's
dev counts) are filled from docs/bench/ts-dev.md, which is committed.
Derived names: {{G[a,b]}} = |onlyA − onlyB|; {{outcome[a,b]}} = floor / A / B / C by W1 §3.2 from reviewedByBoth,
the policy's floor and alpha, p, onlyA and onlyB; {{flag:<name>}} = a yes/no that W1 states in the values file
(pooledRan, datedDraft). `node scripts/bench/w1-fill.ts` (its header) fills every placeholder it can resolve, keeps or
drops every {{if}} block, and lists what is left for the writer.
-->
# TraceHound, CodeRabbit and Greptile on fresh TypeScript pull requests (held-out, 2026-11; decision {{decision-number}})

Protocol: `docs/eval/ts-protocol.md` revision 13 (it wins over the runbooks). Predictions and claim wording: decision
078, registered before the first held-out pull request. Counts: `docs/bench/ts-heldout.summary.json` (headline, pairs,
exposure, hand-check), `ts-heldout.secondary.json` (report-only rows){{if flag:pooledRan}}, `ts-heldout.pooled.json`
(secondary pooled analysis){{end if}}. No case id, pull-request number, file path, label text or comment text from
held-out appears on this page.

## 1. Result in three sentences

<!-- §3.1, always. Then §3.2 once per registered pair (TraceHound vs CodeRabbit, then TraceHound vs Greptile). Then §3.3. -->

{{if handcheckX1Fallback != true}}
On 29 fresh pull requests from {{R}}, 20 of which introduced a bug that a later merged fix repaired, TraceHound commented
on {{tools.tracehound.caught}} of the 20 bugs (95% interval {{tools.tracehound.caughtWilson[0]}}–{{tools.tracehound.caughtWilson[1]}}),
CodeRabbit on {{tools.coderabbit.caught}} ({{tools.coderabbit.caughtWilson[0]}}–{{tools.coderabbit.caughtWilson[1]}}) and
Greptile on {{tools.greptile.caught}} ({{tools.greptile.caughtWilson[0]}}–{{tools.greptile.caughtWilson[1]}}). Matches were
proposed by two model judges and confirmed by hand without knowing which tool wrote each comment.
{{end if}}
{{if handcheckX1Fallback == true}}
On 29 fresh pull requests from {{R}}, 20 of which introduced a bug that a later merged fix repaired, TraceHound commented
on {{tools.tracehound.caught}} of the 20 bugs (95% interval {{tools.tracehound.caughtWilson[0]}}–{{tools.tracehound.caughtWilson[1]}}),
CodeRabbit on {{tools.coderabbit.caught}} ({{tools.coderabbit.caughtWilson[0]}}–{{tools.coderabbit.caughtWilson[1]}}) and
Greptile on {{tools.greptile.caught}} ({{tools.greptile.caughtWilson[0]}}–{{tools.greptile.caughtWilson[1]}}). Matches were
proposed by one model judge, the second being unavailable for {{ho-score:x1UnavailableBugCases}} of the 20 bug cases, and
every counted comment on every reviewed bug case was checked by hand without knowing which tool wrote it.
{{end if}}
{{if tools.tracehound.completedBug+completedClean < 29}}
TraceHound reviewed {{tools.tracehound.completedBug+completedClean}} of the 29 pull requests; its count is over the 20
bugs, and pairs use only the pull requests both tools reviewed.
{{end if}}
{{if tools.coderabbit.completedBug+completedClean < 29}}
CodeRabbit reviewed {{tools.coderabbit.completedBug+completedClean}} of the 29 pull requests; its count is over the 20
bugs, and pairs use only the pull requests both tools reviewed.
{{end if}}
{{if tools.greptile.completedBug+completedClean < 29}}
Greptile reviewed {{tools.greptile.completedBug+completedClean}} of the 29 pull requests; its count is over the 20 bugs,
and pairs use only the pull requests both tools reviewed.
{{end if}}

**TraceHound against CodeRabbit.**
<!-- The floor first (m = pairs[tracehound,coderabbit].reviewedByBoth), then the test. a = onlyA (TraceHound only),
     b = onlyB (CodeRabbit only), n = n, P = p. -->
{{if pairs[tracehound,coderabbit].reviewedByBoth < 15}}
Only {{pairs[tracehound,coderabbit].reviewedByBoth}} of the 20 bugs were reviewed by both TraceHound and CodeRabbit;
TraceHound caught {{pairs[tracehound,coderabbit].onlyA}} that CodeRabbit missed and CodeRabbit caught
{{pairs[tracehound,coderabbit].onlyB}} that TraceHound missed. That is too few for a test.
{{end if}}
{{if outcome[tracehound,coderabbit] == A}}  <!-- reviewedByBoth ≥ 15, p < 0.05, onlyA > onlyB -->
TraceHound caught {{pairs[tracehound,coderabbit].onlyA}} bugs that CodeRabbit missed, and CodeRabbit caught
{{pairs[tracehound,coderabbit].onlyB}} that TraceHound missed ({{pairs[tracehound,coderabbit].n}} pull requests with a
bug reviewed by both; exact sign test, p = {{pairs[tracehound,coderabbit].p}}). On this set TraceHound caught more of
the labelled bugs than CodeRabbit. One run, 20 bugs, {{R}} only; one of two registered tests, each at 0.05 with no
correction for making two.
{{end if}}
{{if outcome[tracehound,coderabbit] == B}}  <!-- reviewedByBoth ≥ 15, p < 0.05, onlyA < onlyB -->
CodeRabbit caught {{pairs[tracehound,coderabbit].onlyB}} bugs that TraceHound missed, and TraceHound caught
{{pairs[tracehound,coderabbit].onlyA}} that CodeRabbit missed ({{pairs[tracehound,coderabbit].n}}; exact sign test,
p = {{pairs[tracehound,coderabbit].p}}). On this set CodeRabbit caught more of the labelled bugs than TraceHound. One
run, 20 bugs, {{R}} only; one of two registered tests, each at 0.05 with no correction for making two.
{{end if}}
{{if outcome[tracehound,coderabbit] == C}}  <!-- reviewedByBoth ≥ 15, p ≥ 0.05, whatever the gap -->
TraceHound caught {{pairs[tracehound,coderabbit].onlyA}} bugs that CodeRabbit missed, and CodeRabbit caught
{{pairs[tracehound,coderabbit].onlyB}} that TraceHound missed ({{pairs[tracehound,coderabbit].n}}; exact sign test,
p = {{pairs[tracehound,coderabbit].p}}). That is no detectable difference at this sample size: with 20 bugs, only a gap
of about 6 or more one-sided misses can be told apart from chance, and a true difference of 30 points in catch rate
would be found about four times in ten if the tools' catches are independent (more often if both catch the same easy
bugs; that was not measured).
{{if G[tracehound,coderabbit] ≥ 6}} The observed gap of {{G[tracehound,coderabbit]}} bugs is not distinguishable from chance here.{{end if}}
{{if pairs[tracehound,coderabbit].onlyA + pairs[tracehound,coderabbit].onlyB == 0}} The two tools caught the same bugs.{{end if}}
{{end if}}

**TraceHound against Greptile.**
<!-- Same rules; m = pairs[tracehound,greptile].reviewedByBoth; a = onlyA (TraceHound only), b = onlyB (Greptile only). -->
{{if pairs[tracehound,greptile].reviewedByBoth < 15}}
Only {{pairs[tracehound,greptile].reviewedByBoth}} of the 20 bugs were reviewed by both TraceHound and Greptile;
TraceHound caught {{pairs[tracehound,greptile].onlyA}} that Greptile missed and Greptile caught
{{pairs[tracehound,greptile].onlyB}} that TraceHound missed. That is too few for a test.
{{end if}}
{{if outcome[tracehound,greptile] == A}}
TraceHound caught {{pairs[tracehound,greptile].onlyA}} bugs that Greptile missed, and Greptile caught
{{pairs[tracehound,greptile].onlyB}} that TraceHound missed ({{pairs[tracehound,greptile].n}} pull requests with a bug
reviewed by both; exact sign test, p = {{pairs[tracehound,greptile].p}}). On this set TraceHound caught more of the
labelled bugs than Greptile. One run, 20 bugs, {{R}} only; one of two registered tests, each at 0.05 with no correction
for making two.
{{end if}}
{{if outcome[tracehound,greptile] == B}}
Greptile caught {{pairs[tracehound,greptile].onlyB}} bugs that TraceHound missed, and TraceHound caught
{{pairs[tracehound,greptile].onlyA}} that Greptile missed ({{pairs[tracehound,greptile].n}}; exact sign test,
p = {{pairs[tracehound,greptile].p}}). On this set Greptile caught more of the labelled bugs than TraceHound. One run,
20 bugs, {{R}} only; one of two registered tests, each at 0.05 with no correction for making two.
{{end if}}
{{if outcome[tracehound,greptile] == C}}
TraceHound caught {{pairs[tracehound,greptile].onlyA}} bugs that Greptile missed, and Greptile caught
{{pairs[tracehound,greptile].onlyB}} that TraceHound missed ({{pairs[tracehound,greptile].n}}; exact sign test,
p = {{pairs[tracehound,greptile].p}}). That is no detectable difference at this sample size: with 20 bugs, only a gap of
about 6 or more one-sided misses can be told apart from chance, and a true difference of 30 points in catch rate would
be found about four times in ten if the tools' catches are independent (more often if both catch the same easy bugs;
that was not measured).
{{if G[tracehound,greptile] ≥ 6}} The observed gap of {{G[tracehound,greptile]}} bugs is not distinguishable from chance here.{{end if}}
{{if pairs[tracehound,greptile].onlyA + pairs[tracehound,greptile].onlyB == 0}} The two tools caught the same bugs.{{end if}}
{{end if}}

TraceHound posted {{tools.tracehound.comments.perCompleted.mean}} comments per pull request, CodeRabbit
{{tools.coderabbit.comments.perCompleted.mean}} and Greptile {{tools.greptile.comments.perCompleted.mean}}; on the 9
pull requests with no labelled bug they posted {{tools.tracehound.comments.clean}}, {{tools.coderabbit.comments.clean}}
and {{tools.greptile.comments.clean}} comments in total. TraceHound ran on an open model (Nemotron 3.5 on Nebius) at
${{tools.tracehound.costUSD.perAttemptedMean}} per pull request.
<!-- §3.3 note: $D is the ledger cost; the console-reconciled figure (× H1's console ratio) goes beside it: -->
(ledger cost; ${{tools.tracehound.costUSD.perAttemptedMean×budget:h1ConsoleRatio}} at console prices, ratio
{{budget:h1ConsoleRatio}})

## 2. Headline table

*Held-out, 29 pull requests (20 bug, 9 clean), one run. Catches are hand-checked (blind to the tool). Wilson 95%
intervals, no continuity correction.*

| tool | reviews completed of 29 | of those, with 0 inline comments | bugs caught of 20, hand-checked [95%] | comments per completed PR: mean / median | comments per attempted PR: mean / median | comments on the 9 clean PRs | cost per PR |
|---|---|---|---|---|---|---|---|
| TraceHound (A0, `review-freeze-3`) | {{tools.tracehound.completedBug+completedClean}} | {{ho-score:tracehound.completedZeroInline}} | {{tools.tracehound.caught}} [{{tools.tracehound.caughtWilson[0]}}–{{tools.tracehound.caughtWilson[1]}}] | {{tools.tracehound.comments.perCompleted.mean}} / {{tools.tracehound.comments.perCompleted.median}} | {{tools.tracehound.comments.perAttempted.mean}} / {{tools.tracehound.comments.perAttempted.median}} | {{tools.tracehound.comments.clean}} | ${{tools.tracehound.costUSD.perAttemptedMean}} ledger (median ${{tools.tracehound.costUSD.median}}) |
| CodeRabbit | {{tools.coderabbit.completedBug+completedClean}} | {{ho-score:coderabbit.completedZeroInline}} | {{tools.coderabbit.caught}} [{{tools.coderabbit.caughtWilson[0]}}–{{tools.coderabbit.caughtWilson[1]}}] | {{tools.coderabbit.comments.perCompleted.mean}} / {{tools.coderabbit.comments.perCompleted.median}} | {{tools.coderabbit.comments.perAttempted.mean}} / {{tools.coderabbit.comments.perAttempted.median}} | {{tools.coderabbit.comments.clean}} | free tier |
| Greptile | {{tools.greptile.completedBug+completedClean}} | {{ho-score:greptile.completedZeroInline}} | {{tools.greptile.caught}} [{{tools.greptile.caughtWilson[0]}}–{{tools.greptile.caughtWilson[1]}}] | {{tools.greptile.comments.perCompleted.mean}} / {{tools.greptile.comments.perCompleted.median}} | {{tools.greptile.comments.perAttempted.mean}} / {{tools.greptile.comments.perAttempted.median}} | {{tools.greptile.comments.clean}} | free tier |

- Sensitivity, no test (protocol §4): {{ho-score:tracehound.caughtOf19}} of 19 without the unmappable case for
  TraceHound, {{ho-score:coderabbit.caughtOf19}} for CodeRabbit, {{ho-score:greptile.caughtOf19}} for Greptile.
- Location hits (a comment within ±10 lines of a labelled range; model-free): TraceHound
  {{tools.tracehound.locationHits}}, CodeRabbit {{tools.coderabbit.locationHits}}, Greptile
  {{tools.greptile.locationHits}} of 20.
- No review after the one re-trigger (`no-review`): CodeRabbit {{tools.coderabbit.noReview}}, Greptile
  {{tools.greptile.noReview}}{{if tools.coderabbit.invalidBinding + tools.greptile.invalidBinding > 0}} (of which invalid binding: CodeRabbit
  {{tools.coderabbit.invalidBinding}}, Greptile {{tools.greptile.invalidBinding}}){{end if}}. TraceHound misses by rule
  (two failures, or unstarted at the window's end): {{tools.tracehound.misses}}.
- Only inline review comments are scored; a tool's summary text is not (decision 076i item 1; limit 14).

## 3. Pairs

Two pairs were registered before the run and are the only tests (decision 076c item 4): TraceHound vs CodeRabbit and
TraceHound vs Greptile. Exact two-sided sign test on the bugs caught by only one tool of the pair, at 0.05, not
corrected for there being two. CodeRabbit vs Greptile: counts only.

| pair | bug cases reviewed by both (m) | paired n | caught only by the first | caught only by the second | exact two-sided p |
|---|---|---|---|---|---|
| TraceHound vs CodeRabbit | {{pairs[tracehound,coderabbit].reviewedByBoth}} | {{pairs[tracehound,coderabbit].n}} | {{pairs[tracehound,coderabbit].onlyA}} | {{pairs[tracehound,coderabbit].onlyB}} | {{if pairs[tracehound,coderabbit].reviewedByBoth ≥ 15}}{{pairs[tracehound,coderabbit].p}}{{end if}}{{if pairs[tracehound,coderabbit].reviewedByBoth < 15}}–{{end if}} |
| TraceHound vs Greptile | {{pairs[tracehound,greptile].reviewedByBoth}} | {{pairs[tracehound,greptile].n}} | {{pairs[tracehound,greptile].onlyA}} | {{pairs[tracehound,greptile].onlyB}} | {{if pairs[tracehound,greptile].reviewedByBoth ≥ 15}}{{pairs[tracehound,greptile].p}}{{end if}}{{if pairs[tracehound,greptile].reviewedByBoth < 15}}–{{end if}} |
| CodeRabbit vs Greptile (counts only) | {{pairs[coderabbit,greptile].reviewedByBoth}} | {{pairs[coderabbit,greptile].n}} | {{pairs[coderabbit,greptile].onlyA}} | {{pairs[coderabbit,greptile].onlyB}} | – |

<!-- One sentence per registered pair: the same §3.2 branch as in section 1, copied. No sentence for CodeRabbit vs Greptile. -->
- TraceHound vs CodeRabbit: {{the §3.2 sentence of section 1 for this pair}}
- TraceHound vs Greptile: {{the §3.2 sentence of section 1 for this pair}}

## 3b. Exposed and unexposed catches, reported separately (decision 076d item 1d)

{{if exposure.exposedBugCases > 0}}
A bug case is called exposed if, at the time CodeRabbit or Greptile reviewed it, the commit that later fixed the bug
could be reached from another case's branch on the same fork. {{exposure.exposedBugCases}} of the 20 bug cases were
exposed. At each case's first review the number was 0; the {{exposure.exposedBugCases}} cases became exposed through a
re-trigger or a late review. No test was made on either group.
{{end if}}
{{if exposure.exposedBugCases == 0}}
A bug case is called exposed if, at the time CodeRabbit or Greptile reviewed it, the commit that later fixed the bug
could be reached from another case's branch on the same fork. No bug case was exposed at any review. No test was made
on either group.
{{end if}}

| tool | exposed bug cases: caught | exposed bug cases: reviews completed | unexposed bug cases: caught | unexposed bug cases: reviews completed |
|---|---|---|---|---|
| TraceHound | {{tools.tracehound.exposure.exposed.caught}} of {{tools.tracehound.exposure.exposed.bugCases}} | {{tools.tracehound.exposure.exposed.completedBug}} | {{tools.tracehound.exposure.unexposed.caught}} of {{tools.tracehound.exposure.unexposed.bugCases}} | {{tools.tracehound.exposure.unexposed.completedBug}} |
| CodeRabbit | {{tools.coderabbit.exposure.exposed.caught}} of {{tools.coderabbit.exposure.exposed.bugCases}} | {{tools.coderabbit.exposure.exposed.completedBug}} | {{tools.coderabbit.exposure.unexposed.caught}} of {{tools.coderabbit.exposure.unexposed.bugCases}} | {{tools.coderabbit.exposure.unexposed.completedBug}} |
| Greptile | {{tools.greptile.exposure.exposed.caught}} of {{tools.greptile.exposure.exposed.bugCases}} | {{tools.greptile.exposure.exposed.completedBug}} | {{tools.greptile.exposure.unexposed.caught}} of {{tools.greptile.exposure.unexposed.bugCases}} | {{tools.greptile.exposure.unexposed.completedBug}} |

<!-- With exposure.exposedBugCases == 0 the two exposed cells of each row read "0 of 0 (no exposed bug cases)".
     Counts only: no rate or percentage on either group, no comparison of the groups in words, never "the tools did
     not use the fix". -->

## 4. What was run

- Tag `review-freeze-3` (on `25151b1`; `docs/bench/ts-freeze.md` sha256 `da3d5e9d…`, decision 078). The arm is A0:
  pool-verify-v1, attempts 2, frozen by decision 076g item 1, on `nvidia/Nemotron-3.5-Super-VL` (Nebius Token
  Factory); contracts off, fixes off, cache off, at most 15 comments per pull request.
- Command shape (protocol §8): `node scripts/run-tracehound.ts --manifest <manifest> --clone <clone> --ids <batch>
  --out-dir <private> --fixes off --contracts off --cache off --max-usd-per-case 0.40 --max-usd-run <cap> --execute`.
- Window: actual T0 {{h1:actualT0Utc}} (scheduled T0 2026-11-19 04:30Z; difference {{h1:t0DifferenceMinutes}}
  minutes), snapshot {{h1:snapshotUtc}} (actual T0 + 72 h).
- Push order: one case per hour, by base commit date, each case's branch pushed only at its own first trigger (decision
  076d).
- Triggers: {{h1:firstTriggers}} first triggers; {{h1:firstTriggersSecondTry}} needed their second try and
  {{h1:failedFirstTrigger}} failed both; re-triggers used: CodeRabbit {{h1:retriggers.coderabbit}}, Greptile
  {{h1:retriggers.greptile}}.
- TraceHound: {{h1:tracehoundOk}} of 29 cases ok, {{h1:tracehoundReruns}} rerun once, {{tools.tracehound.misses}} misses
  by rule; failed reviewer chunks {{h1:chunkFailed}} of {{h1:chunks}}; cases with no comment
  {{h1:emptyCases}} of 29.
- Operated by a detached scheduler; the operator typed no trigger.

## 5. How it was scored

- One golden per bug case: the starting fix's verified rows, one primary target and its alternates as OR-targets; a
  comment matching any target catches the case once (protocol §2).
- Counted comments: top-level line-level review comments from each tool's listed bot login, inside the window
  (protocol §3). Only inline review comments are scored; a tool's summary text is not (decision 076i item 1; limit 14).
  TraceHound's comments are its local finding export, capped at 15 per pull request.
- Two judges: bench-judge-v1 (Nemotron 3 Super, the judge of record) and bench-judge-x1
  (`Qwen/Qwen3-30B-A3B-Instruct-2507`, reasoning off, same frozen prompt; decision 076r item 1).
- Blind hand-check by the project owner, with the tool hidden, the judges' verdicts hidden, the order shuffled by a
  recorded seed and tool formatting stripped by fixed patterns (`scripts/testset/strip.json`). Policy file
  `scripts/testset/policy.076c.json`.
{{if handcheckX1Fallback != true}}
- On the sheet: every comment either judge matched, every judge disagreement and every comment within 10 lines of a
  labelled range ({{ho-score:sheetItems}} items).
{{end if}}
{{if handcheckX1Fallback == true}}
- x1 became unavailable during judging ({{ho-score:x1FallbackWhenWhy}}), so fallback (d) applied (protocol rev 13
  §10): every counted comment on every reviewed bug case of the three tools was on the sheet
  ({{ho-score:sheetItems}} items). No third model was used.
{{end if}}
- Hashes, in order: blank sheet and mapping, then the filled sheet before unblinding, then the score files
  (`docs/bench/ts-heldout.hashes.md`).

## 6. Judges versus hand-check

| tool | caught by judge v1 | caught by judge x1 | caught by hand | judge-matched items rejected by hand | location-only items accepted by hand |
|---|---|---|---|---|---|
| TraceHound | {{ho-score:tracehound.caughtV1}} | {{tools.tracehound.caughtX1}} | {{tools.tracehound.caught}} | {{ho-score:tracehound.rejected}} | {{ho-score:tracehound.added}} |
| CodeRabbit | {{ho-score:coderabbit.caughtV1}} | {{tools.coderabbit.caughtX1}} | {{tools.coderabbit.caught}} | {{ho-score:coderabbit.rejected}} | {{ho-score:coderabbit.added}} |
| Greptile | {{ho-score:greptile.caughtV1}} | {{tools.greptile.caughtX1}} | {{tools.greptile.caught}} | {{ho-score:greptile.rejected}} | {{ho-score:greptile.added}} |

`JUDGE_FAILED`: v1 {{ho-score:judgeFailedV1}}, x1 {{tools.tracehound.judgeFailedX1}} / {{tools.coderabbit.judgeFailedX1}}
/ {{tools.greptile.judgeFailedX1}}. <!-- x1 caught reads "unavailable", never 0, when no completed bug case has a SCORED x1 entry. -->

After deciding every item, the checker guessed which tool had written each comment: right for
{{handcheckGuess.right}} of the {{handcheckGuess.guessed}} items he guessed ({{handcheckGuess.unsure}} marked unsure,
{{handcheckGuess.items}} items in all); naming the commonest tool every time would have been right for
{{handcheckGuess.commonestToolItems}} of {{handcheckGuess.items}}.

## 7. Secondary rows (report-only; judges only, not hand-checked)

*Counts only. No test and no p-value on a secondary row, against anything.*

| row | judge | caught of 20 (v1) | caught of 20 (x1) | reviews completed of 29 | comments per completed PR: mean / median | comments on the 9 clean PRs | cost per PR |
|---|---|---|---|---|---|---|---|
| A1, pool-raw (replay of A0's run) | v1 and x1 | {{secondary:tools.pool-raw.caught}} | {{secondary:tools.pool-raw.caughtX1}} | {{secondary:tools.pool-raw.completedBug+completedClean}} | {{secondary:tools.pool-raw.comments.perCompleted.mean}} / {{secondary:tools.pool-raw.comments.perCompleted.median}} | {{secondary:tools.pool-raw.comments.clean}} | none of its own (A0's run) |
| A2, review-diff-v1 (replay of A0's run) | v1 and x1 | {{secondary:tools.review-diff-v1.caught}} | {{secondary:tools.review-diff-v1.caughtX1}} | {{secondary:tools.review-diff-v1.completedBug+completedClean}} | {{secondary:tools.review-diff-v1.comments.perCompleted.mean}} / {{secondary:tools.review-diff-v1.comments.perCompleted.median}} | {{secondary:tools.review-diff-v1.comments.clean}} | none of its own (A0's run) |
| Haiku 5.5, draw 1 (registered secondary) | v1 and x1 | {{secondary:tools.haiku1.caught}} | {{secondary:tools.haiku1.caughtX1}} | {{secondary:tools.haiku1.completedBug+completedClean}} | {{secondary:tools.haiku1.comments.perCompleted.mean}} / {{secondary:tools.haiku1.comments.perCompleted.median}} | {{secondary:tools.haiku1.comments.clean}} | ${{secondary:tools.haiku1.costUSD.perAttemptedMean}} (Anthropic) |
| Haiku 5.5, draw 2 (registered secondary) | v1 and x1 | {{secondary:tools.haiku2.caught}} | {{secondary:tools.haiku2.caughtX1}} | {{secondary:tools.haiku2.completedBug+completedClean}} | {{secondary:tools.haiku2.comments.perCompleted.mean}} / {{secondary:tools.haiku2.comments.perCompleted.median}} | {{secondary:tools.haiku2.comments.clean}} | ${{secondary:tools.haiku2.costUSD.perAttemptedMean}} (Anthropic) |

**Haiku 5.5 against A0, both on judge v1** (H2 §6 step 4c; never against A0's hand-checked score). The Haiku row is
registered (pre-specified), descriptive, no test; secondary, registered, judges only, not hand-checked, Sunny's own
money. Every number in this paragraph is judge v1.

| | A0 (v1) | Haiku draw 1 (v1) | Haiku draw 2 (v1) | mean of the two draws (v1) | mean − A0 |
|---|---|---|---|---|---|
| caught of 20 | {{secondary:haikuVsA0.a0CaughtV1}} | {{secondary:haikuVsA0.haiku1CaughtV1}} | {{secondary:haikuVsA0.haiku2CaughtV1}} | {{secondary:haikuVsA0.meanCaughtV1}} | {{secondary:haikuVsA0.meanMinusA0}} |

Per-case matrix against A0 (v1; both / A0 only / Haiku only / neither): draw 1 {{secondary:haikuVsA0.haiku1.both}} /
{{secondary:haikuVsA0.haiku1.a0Only}} / {{secondary:haikuVsA0.haiku1.haikuOnly}} / {{secondary:haikuVsA0.haiku1.neither}};
draw 2 {{secondary:haikuVsA0.haiku2.both}} / {{secondary:haikuVsA0.haiku2.a0Only}} /
{{secondary:haikuVsA0.haiku2.haikuOnly}} / {{secondary:haikuVsA0.haiku2.neither}}. The same table by x1 is in
`ts-heldout.secondary.json` and changes nothing.

Disclosure (decision 076k item 1): Planner B drafted the thresholds before 076j's results existed; they were adopted
after. Dev: v1 14 and 11 vs A0 12; second judge 15 and 12 vs 13; clean-case comments 1 and 0; draws differ by 3.
{{if flag:datedDraft}} The draft is {{planner-b-draft-commit-or-file-and-time}}.{{end if}}
{{if flag:datedDraft == false}} Stated by Planner B as drafted before 076j's results; no dated draft is on record.{{end if}}
Draw 2 met the dev condition with no margin.

{{if secondary:haikuVsA0.meanMinusA0 < −2}}
Product default (decision 076k item 2; not a test claim): the mean of Haiku's two draws under v1 is more than 2 behind
A0's v1 count. This decides only the product's default model; A0 is the headline. It is a pre-set product threshold; at
20 bugs it does not show that Haiku is as good as A0.
{{end if}}
{{if secondary:haikuVsA0.meanMinusA0 ≥ −2}}
Product default (decision 076k item 2; not a test claim): the mean of Haiku's two draws under v1 is not more than 2
behind A0's v1 count. This decides only the product's default model; A0 is the headline. It is a pre-set product
threshold; at 20 bugs it does not show that Haiku is as good as A0. After this default switch, the 29 held-out cases
are spent for Haiku: its held-out count chose it.
{{end if}}

Haiku coverage and failures, per draw: official records ok {{secondary:tools.haiku1.completedBug+completedClean}} /
{{secondary:tools.haiku2.completedBug+completedClean}} of 29; misses by rule {{secondary:tools.haiku1.misses}} /
{{secondary:tools.haiku2.misses}} ({{ho-score:haiku.missCauses}}); `JUDGE_FAILED` v1 {{secondary:tools.haiku1.judgeFailed}} /
{{secondary:tools.haiku2.judgeFailed}}; Anthropic cost {{secondary:tools.haiku1.costUSD.total}} +
{{secondary:tools.haiku2.costUSD.total}} of the $1.00 cap.

{{if flag:pooledRan}}
### Secondary

<!-- Protocol revision 10's wording (§4 "Secondary pooled analysis: A0 only"), the dev table's label and grok's dev
     exposure count beside it. Never in the three result sentences. -->
Secondary, mixed dev selection set + held-out: A0 only, the 31 dev bugs and the 20 held-out bugs pooled (nominal N =
51). Dev catches are judge v1's; held-out catches are the hand-checked ones. Dev numbers: dev, selection set, one draw,
one judge of record, not hand-checked; dev exposure 10 of 31 (grok; audit sha256 `b94f54ee…`).

| pair | dev: paired n / A0 only / other only | held-out: paired n / A0 only / other only | pooled: paired n / A0 only / other only | exact two-sided p |
|---|---|---|---|---|
| A0 vs CodeRabbit | {{pooled:coderabbit.dev.n}} / {{pooled:coderabbit.dev.onlyA}} / {{pooled:coderabbit.dev.onlyB}} | {{pooled:coderabbit.heldout.n}} / {{pooled:coderabbit.heldout.onlyA}} / {{pooled:coderabbit.heldout.onlyB}} | {{pooled:coderabbit.pooled.n}} / {{pooled:coderabbit.pooled.onlyA}} / {{pooled:coderabbit.pooled.onlyB}} | {{pooled:coderabbit.p}} |
| A0 vs Greptile | {{pooled:greptile.dev.n}} / {{pooled:greptile.dev.onlyA}} / {{pooled:greptile.dev.onlyB}} | {{pooled:greptile.heldout.n}} / {{pooled:greptile.heldout.onlyA}} / {{pooled:greptile.heldout.onlyB}} | {{pooled:greptile.pooled.n}} / {{pooled:greptile.pooled.onlyA}} / {{pooled:greptile.pooled.onlyB}} | {{pooled:greptile.p}} |

With the two pooled secondary tests, four tests at 0.05 with no correction; up to 0.20 that at least one rejects by
chance. Even a small p here is not fresh held-out confirmation. {{if a pair fails the 15-of-20 floor}}That pair gets
pooled counts only.{{end if}}
{{end if}}

## 8. Predictions (decision 078, registered before the window)

| # | prediction (decision 078) | result | scored |
|---|---|---|---|
| 1 | TraceHound (A0) bugs caught of 20: 8 (range 5–11) | {{tools.tracehound.caught}} | {{right / wrong / too vague to score}} |
| 2a | CodeRabbit of 20: 12 (range 9–15) | {{tools.coderabbit.caught}} | {{right / wrong / too vague to score}} |
| 2b | Greptile of 20: 12 (range 8–15) | {{tools.greptile.caught}} | {{right / wrong / too vague to score}} |
| 2c | TraceHound vs CodeRabbit discordant: about 1 TraceHound-only vs 5 CodeRabbit-only | {{pairs[tracehound,coderabbit].onlyA}} vs {{pairs[tracehound,coderabbit].onlyB}} | {{right / wrong / too vague to score}} |
| 2d | TraceHound vs Greptile discordant: about 1 vs 4–5 | {{pairs[tracehound,greptile].onlyA}} vs {{pairs[tracehound,greptile].onlyB}} | {{right / wrong / too vague to score}} |
| 3a | Comments per PR: TraceHound about 1.1, CodeRabbit about 3.1, Greptile about 2.9 | {{tools.tracehound.comments.perCompleted.mean}}, {{tools.coderabbit.comments.perCompleted.mean}}, {{tools.greptile.comments.perCompleted.mean}} | {{right / wrong / too vague to score}} |
| 3b | Comments on the 9 clean cases: TraceHound about 1, CodeRabbit about 8, Greptile about 9 | {{tools.tracehound.comments.clean}}, {{tools.coderabbit.comments.clean}}, {{tools.greptile.comments.clean}} | {{right / wrong / too vague to score}} |
| 3c | Reviews delivered of 29: CodeRabbit 29, Greptile 29, TraceHound 29 after its one rerun | {{tools.coderabbit.completedBug+completedClean}}, {{tools.greptile.completedBug+completedClean}}, {{tools.tracehound.completedBug+completedClean}} | {{right / wrong / too vague to score}} |
| 4a | TraceHound cost per PR about $0.07 ledger (median about $0.05) | ${{tools.tracehound.costUSD.perAttemptedMean}} (median ${{tools.tracehound.costUSD.median}}) | {{right / wrong / too vague to score}} |
| 4b | Total about $2.0 ledger, about $2.4 at console prices (f = 1.17) | ${{tools.tracehound.costUSD.total}} ledger, ${{budget:h1Console}} console | {{right / wrong / too vague to score}} |
| 4c | Failed chunks about 1 of about 60 | {{h1:chunkFailed}} of {{h1:chunks}} | {{right / wrong / too vague to score}} |
| 4d | Empty cases (no comment) about 14 of 29 | {{h1:emptyCases}} of 29 | {{right / wrong / too vague to score}} |
| 5 | Neither registered pair rejects (outcome C for both); rejection in the other tool's favour with probability about 0.28 (CodeRabbit) and 0.19 (Greptile) | {{outcome[tracehound,coderabbit]}}, {{outcome[tracehound,greptile]}} | {{right / wrong / too vague to score}} |
| 6 | Hand-check sheet about 61 items; 4 minutes per item (an estimate); about 244 minutes | {{ho-score:sheetItems}} items, {{ho-score:sittingMinutes}} minutes | {{right / wrong / too vague to score}} |
| 7 | Test-sentence floor 15 (copied, not a prediction) | — | not scored |
| 8 | Pooled secondary analysis: no choice added (not a prediction) | — | not scored |

## 9. Dev history

*Dev, selection set, one draw, one judge of record, not hand-checked; dev exposure 10 of 31 (grok).* The full dev
table is `docs/bench/ts-dev.md`.

| row | caught of 31, v1 [95%] | caught of 31, x1 | caught of 21 unexposed, v1 / x1 | completed of 40 | reviews with 0 inline comments | comments per case: mean / median | comments on the 9 clean cases |
|---|---|---|---|---|---|---|---|
| A0 (pool-verify-v1) | 12 [23.7–56.2%] | 14 | 10 / 12 | 40 | 19 | 1.075 / 1 | 1 |
| CodeRabbit | 19 [43.8–76.3%] | 22 | 15 / 16 | 40 | 9 | 3.075 / 2.5 | 8 |
| Greptile | 18 [40.8–73.6%] | 18 | 15 / 15 | 40 | 7 | 2.850 / 3 | 9 |

- Stop/go (decision 076g item 6), read once by decision 076t: **RETHINK** (CodeRabbit led A0 by 19 − 12 = 7 on v1;
  CodeRabbit completed 40 of 40). It did not gate the held-out run (decision 076k item 4).
- {{choose one: W1 §2.9 verbatim | W1 §5.4 checklist wording}}
  - §2.9: The configuration (pool-verify-v1) was fixed on 13 November 2026, before any result on the TypeScript dev
    cases existed and before the held-out cases were opened; it had been chosen earlier on a different benchmark
    (decision 059).
  - §5.4: pool-verify-v1 was fixed before any catch count of it on the dev cases existed; contracts off was chosen by
    a model-free dev audit.
- The dev rows for A1 (pool-raw), A2 (review-diff-v1) and the Claude models are report-only. The only Claude dev
  numbers on this page are the registered Haiku row's, in its disclosure (section 7), labelled dev. There was no second
  dev run (cut by decision 076g).

## 10. Failures and deviations

<!-- Every numbered failure of H1-window.md §5 that occurred, with its count. W1 deletes the rows with count 0. -->

| H1 §5 failure | what | count |
|---|---|---|
| 1 | A first-trigger slot failed | {{h1:failure.1}} |
| 2 | A tool reviewed a pull request before its trigger (auto-review) | {{h1:failure.2}} |
| 3 | CodeRabbit posted a rate-limit comment | {{h1:failure.3}} |
| 4 | Greptile showed "Failed" | {{h1:failure.4}} |
| 5 | A pull request's base or head no longer equalled the case pair (`invalid-binding`) | {{h1:failure.5}} |
| 6 | A tool still had no completed review after its re-trigger (`no-review`) | {{h1:failure.6}} |
| 7 | A slot was missed | {{h1:failure.7}} |
| 8 | Greptile ran out of credits | {{h1:failure.8}} |
| 9 | TraceHound cases ended `failed` (canary runs: {{h1:canaryTries}}) | {{h1:failure.9}} |
| 10 | A case hit its $0.40 cap | {{h1:failure.10}} |
| 11 | The operator's process was killed mid-batch | {{h1:failure.11}} |
| 12 | A case had no official record at T0 + 72 h | {{h1:failure.12}} |
| 13 | codex unavailable for more than 2 hours | {{h1:failure.13}} |
| 14 | Anything the table did not cover | {{h1:failure.14}} |
| 15 | The scheduler stopped | {{h1:failure.15}} |
| 16 | The first pull request did not open in slot 0 | {{h1:failure.16}} |
| 17 | A trigger command ended more than 15 minutes after its slot's planned start | {{h1:failure.17}} |
| 18 | Haiku row: the $1.00 used up with cases unstarted | {{h1:failure.18}} |
| 19 | Haiku row: a case still failed after its one rerun | {{h1:failure.19}} |

{{if handcheckX1Fallback == true}}- x1 fallback (d) invoked: {{ho-score:x1FallbackWhenWhy}}.{{end if}}

## 11. Limits

1. 20 bugs and one run: intervals are wide, and only large differences can be detected (power in plan-v2 §2).
2. The bugs are ones a later merged fix repaired, found by SZZ and labelled by two labellers; they are not all the bugs
   in those pull requests. A comment on a real defect that no later fix repaired counts as unmatched, so the share of
   matching comments is a lower bound on precision.
3. "Clean" means no qualifying later fix was found, not bug-free.
4. The configuration was fixed before any result on the 40 TypeScript dev cases existed (decision 076g item 1); it had
   been chosen on an earlier benchmark of other repositories. The 40 dev cases, from three of the same repositories as
   the held-out cases, were then used for a stop/go reading and for report-only rows, and those numbers were known
   before the window. The pooled analysis mixes those dev cases with the held-out ones and is secondary for that
   reason.
5. The hand-check was done by the project owner, blind to the tool. {{if handcheckX1Fallback != true}}Only comments that
   a judge matched or that lie within 10 lines of a labelled range were on the sheet; a match outside that set would be
   missed for every tool alike.{{end if}}{{if handcheckX1Fallback == true}}Under fallback (d) every counted comment on
   every reviewed bug case was on the sheet.{{end if}} Tool-specific formatting was stripped by fixed patterns;
   residual style cues cannot be excluded: the checker's guesses of the tool were right for {{handcheckGuess.right}} of
   {{handcheckGuess.guessed}} (section 6), against {{handcheckGuess.commonestToolItems}} of {{handcheckGuess.items}} for
   always naming the commonest tool.
6. What the other tools could see: each fork's default branch was set to the last upstream commit before 2026-07-01;
   neither vendor documents which ref its repository context is built from (`run/out/grok.tool-facts.md` rows 7, 11).
   CodeRabbit reviewed payload's cases under payload's own configuration file, which is part of that code.
   CodeRabbit was left at its defaults, under which web search is "Enabled unless explicitly disabled" and pull-request
   context "Uses past PRs for context" (https://docs.coderabbit.ai/knowledge-base); what it looked up is not known.
   <!-- §3.4b: each vendor fact in limits 6 and 7 stays only if the 14 Nov research's verified table labels it D:
        {{vendor-fact-check: table path from artu1}} -->
   Other case branches on the same fork (premortem gap G16; decision 076d item 1 with its correction, and addendum e):
   - *Before anything was done:* the commit that later fixed the bug was an ancestor of another case's base on the
     same fork for 11 of the 20 held-out bugs (`run/out/grok.ancestry.md`, 2026-11-12). Of the 11, 6 could be reached
     only from a dev case's branch, 2 only from another held-out case's branch, 3 from both (`run/out/grok.076d.md`;
     correction to decision 076d item 1).
   - A second, different count: 5 of the 29 held-out bases contained another case's fix (3 of them a held-out fix, 2
     only a dev fix). The 11 counts fixes and the 5 counts bases; a fix can sit in several bases and a base can hold
     several fixes. **The two are not the same set, are not two views of one number, and are never added or set
     equal on the page.**
   - *What was done:* every dev case branch was deleted from the forks after the dev reviews were collected and before
     the window (item 1b), and the held-out branches were pushed one case at a time, in the order of their base commits'
     dates, each only at the hour of its own first trigger (item 1c). **Under that order, exposure at first review was
     0 of 20**: counted by codex and by grok independently, and again by grok on the actual case list before the first
     push (`H1-window.md` §1 item 3).
   - *What remains.* Exposure is judged per review at the time the review was actually made, from the scheduler's log
     of the fork's branches before every trigger, not from the planned order (addendum e). A re-trigger comes 24 hours or more after
     a pull request's own trigger, when later branches are already on the fork, and a review that arrives late can see
     them too. {{exposure.exposedBugCases}} of the 20 bug cases were exposed in this way for at least one tool's
     review; at most 5 could be (the 2 + 3 fixes that reach a held-out branch). Section 3b shows every tool's catches
     on the exposed and on the unexposed cases separately; no case was left out.
   - *What deleting does not undo.* The dev pull requests were open on the forks for the days of the dev runs. A tool
     that indexed a fork then may keep what it read; the closed pull requests stay public, and GitHub keeps a read-only
     `refs/pull/<n>/head` ref for each (decision 076e item 5; per fork: {{p1:refsPullPerFork}}, P1's report,
     `docs/specs/P1.md` §4 item 9). So "0 of 20 at first review" is a statement about
     the branches on the forks, not about what a tool remembers.
   - TraceHound read no fork: it ran locally on each case's own commits.
7. CodeRabbit and Greptile ran on free plans, triggered by a comment posted from a scheduler, one pull request every 61
   minutes, within their rate and credit limits; a tool that delivered no review after one re-trigger is left out of
   its pairs, with n stated.
8. No row for Augment, Cursor Bugbot or Copilot. TypeScript only; the repositories named; these dates.
9. Costs: TraceHound's is the ledger figure for this run; the console-to-ledger ratio is stated
   ({{budget:h1ConsoleRatio}}).
10. TraceHound's comments were never posted to the pull requests. They are scored from the frozen runner's local
    output, capped at 15 per pull request, with one rerun allowed for a failed case; the other tools posted on GitHub
    under their rate and credit limits, with one re-trigger allowed for a failed review (premortem gap G18).
11. Every deviation from the protocol during the window, by its failure number (section 10).
12. Two tests were registered before the run: TraceHound against CodeRabbit and TraceHound against Greptile, each an
    exact two-sided sign test at 0.05. No correction was made for running two, so the chance that at least one rejects
    when neither tool differs from TraceHound can be up to 0.10 (the sum of the two levels). CodeRabbit against
    Greptile was not tested; its counts are shown. A pair with fewer than 15 of the 20 bugs reviewed by both tools gets
    no test sentence (decision 076c items 4 and 6).
13. Two firewall slips before the window (decision 076e addendum d). The agents that later tune TraceHound must not
    see the held-out material. On 2026-11-13, before any held-out pull request was opened, two of them (artu1 and
    bunny) each ran one unrestricted `git status` in the test-set repository, and each was shown the names of 8
    untracked files under its held-out directory (`docs/decisions.md` 076e addendum d; `run/out/bunny.076e-r1.md`). No
    file was opened, by either: 2 incidents, 8 file names shown in
    each, 0 files opened, both before the window. The rule made the same day: every agent but the held-out operator
    runs git in that repository only with explicit paths outside the held-out directory.
14. A tool's summary text was not scored (decision 076i item 1). Only a tool's top-level inline review comments count
    as its comments and can catch a bug. A summary, a walkthrough or a review body counts for one thing only: that the
    review was completed (decision 076c item 2). So a review that names its findings only in its summary scores no
    catch here, whatever that text says. Completed reviews with 0 inline comments, on the 29 held-out pull requests:
    CodeRabbit {{ho-score:coderabbit.completedZeroInline}} of {{tools.coderabbit.completedBug+completedClean}},
    Greptile {{ho-score:greptile.completedZeroInline}} of {{tools.greptile.completedBug+completedClean}}; on the 40
    dev cases: CodeRabbit 9 of 40, Greptile 7 of 40 (`docs/bench/ts-dev.md`). In the smoke test all 4 reviews, 2 from
    each tool, had 0 inline comments and ended with a summary comment (decision 076h). TraceHound's comments are its
    findings from the local export, so this limit is about the two other tools.

## 12. Cost

- Ledger spend: H1 ${{budget:h1Ledger}} (cap $2.94, decision 077), H2 ${{budget:h2Ledger}} (cap $0.40).
- Console ratio for H1: {{budget:h1ConsoleRatio}} (f = 1.17 frozen at F1; Sunny's reading at {{budget:h1ConsoleUtc}}).
- Cost per pull request, measured on this set: ${{tools.tracehound.costUSD.perAttemptedMean}} ledger (median
  ${{tools.tracehound.costUSD.median}}, max ${{tools.tracehound.costUSD.max}}, total
  ${{tools.tracehound.costUSD.total}}); ${{tools.tracehound.costUSD.perAttemptedMean×budget:h1ConsoleRatio}} at
  console prices. Every attempt counted, judges excluded. The frozen arm is A0, the full pipeline, so this is the one
  figure: the cost paid per pull request.
- Haiku row: ${{secondary:tools.haiku1.costUSD.total}} + ${{secondary:tools.haiku2.costUSD.total}} of Sunny's $1.00
  Anthropic cap.
