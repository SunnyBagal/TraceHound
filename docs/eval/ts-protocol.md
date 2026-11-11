# TypeScript evaluation protocol

Draft for D1, 2026-11-11. Source rulings: [decision076](../decisions.md#076--s0-rulings-and-the-pre-registered-plan-to-the-held-out-run-2026-11-11), [budget S0 rulings](../budget.md#s0-rulings-sunny-2026-11-11-decision-076), [plan audit](../plan/2026-11-10-plan-audit.md). Rulings are committed on main at `588f72393674056461df73cd4150406fec838d22`. This document specifies the evaluation; it authorizes no spending, PR opening, trigger or provider call. The spend freeze remains until Sunny's console check.

The original [plan](../plan/2026-11-10-plan.md) supplies task names. Decision076 supersedes its tie, cap, counting, claim and multi-file rules. The caps-check follow-up below is pending Sunny's ruling; no paid job may use an unresolved cap/procedure. The explicit configuration slots in section12 must be filled and reviewed before the final freeze.

## 1. Population and separation

- Dev:40 PR cases,31 bug and9 clean, used for configuration selection. Dev results are selection-set results, unverified by the held-out hand-check.
- Held-out:29 PR cases,20 bug and9 clean. No reviewer tuning on held-out inputs, labels or outputs. No case identity, label text, source path, fix/introducer hash or bug description is published in result docs or the brain; public results contain aggregate counts and method only.
- Unit: one introducing PR/case, frozen base-to-case-head diff. Every tool reviews that same commit pair. Freeze manifests, labels, multi-file overlays, tool configuration, prompts and source revisions with SHA256s before the window. Preserve original labels and historical agreement reports.
- Clean means no qualifying later fix touched the checked added lines up to the pinned history horizon, with at least10 non-trivial lines checked. It does not mean bug-free. One later-fixed defect per bug case defines the target; unrelated or pre-cutoff note rows are not extra scored defects.
- The earlier benchmark is a separate result; its scores and commercial-tool ranks do not supply a TypeScript result. Cal.com, seeded benchmark content and shared response caches stay closed to this workflow except the explicitly permitted dev replay cache.

## 2. Golden schema and the multi-file rule

Schema v2 retains `id`, `label`, `file`, inclusive `lines_at_head`, `description`, `category`, `fix_pr_url`, `fix_sha`, `introducing_sha` and `role`; optional provenance fields remain. Clean rows retain their clean label and have no defect golden. Superseded rows are historical, never active input.

For a bug case, **the starting fix's verified bug rows are one bug**, mechanically, as adopted in076 and devin's schema. Every other bug row of that case remains `role: note`, not scored. The canonical row is `role: primary`; other rows of that starting-fix bug are `role: alternate`. This protocol adds no discretionary causal-adjudication step that can drop a verified starting-fix row. The case counts once, and a comment matching any accepted row catches it.

Choose primary mechanically: **the first file among the starting-fix bug's verified rows**, in the order returned by `git show --no-renames --name-only --format= <fix>`. The filter is membership in those verified rows, **not file type**: no verified test/documentation row is excluded for being a test/documentation file. Remaining rows are alternates. Never choose by model output, reviewer outcome, apparent ease or human preference. Apply the same rule on dev and held-out. Preserve original range evidence; a within-file range-selection policy beyond the accepted overlap-agreement rule is proposed in section13, not silently decided here.

Write role overlays separately from the original labels. Each active bug case must resolve to exactly one canonical primary plus zero or more alternates, with the same fix and introducing head. Record source/provenance and overlay hashes. Two source rows describing the same file/range/defect are not two alternates.

The builder emits one logical **High** golden per bug case, carrying all accepted file/range targets for that defect. A comment matching any accepted row catches the case **once**. The existing title-keyed scorer may be reused only through an adapter that preserves this OR-over-targets rule and stable case keys. It must not inflate the denominator for alternates. Never convert a note into a target merely because it helps a match. Clean cases have no golden.

Schema agreement uses devin's accepted overlap rule: same selected fix, same file and **any inclusive line overlap** counts as agreement; both clean counts as agreement. Exact start-line equality is not required. Agreement is distinct from the ±10-line location-hit metric and from semantic judge matching. New canonicalization must not rewrite the historical blind disagreement rate as though the labels were originally identical.

Attribution status, including moved/unmappable, remains recorded. Validate target files/ranges against the frozen case head before freezing and report any unresolved data issue blind. Reachability in a rendered chunk is a separate coverage measurement. The population is20 held-out bug cases underS0.3. Treatment of an unresolved/unmappable target beyond that population rule needs Sunny's blind ruling before the window; section13 labels the proposed handling rather than adding an exclusion/miss policy.

## 3. Counted comments and collection

Adopt the existing rule in `packages/analyzer/src/bench/convert.ts`: **top-level line-level review comments from the intended tool's bot/tool account**. Exclude replies, summaries/walkthroughs, review-body sections, issue comments, PR-description summaries, humans and unrelated bots. This is no extension of the old output-type rule. The new collector tightens identity to each tool's frozen allowlist rather than accepting every account whose GitHub type is Bot.

Freeze an explicit per-tool API `user.login`/`user.type` allowlist after G1/S1 observes real comments. A mention handle or App slug alone is not evidence of API identity. Collect and archive all raw relevant API objects as evidence, then apply the rule; an excluded summary is not an actionable comment for scoring. Every counted GitHub comment is counted once by immutable object ID. Preserve original body, file, current/original line, review ID, author, commit binding and timestamps. Do not include later revisions created outside the window.

TraceHound is scored from its **local neutral finding export**, one proposed comment per finding the frozen product would emit, not the single optional PR body wrapper. Use only official successful-case output; exclude diagnostics, pool candidates dropped before posting, fix suggestions and usage/footer text. Apply the frozen15-comment model-finding cap in pool order. **Contracts are OFF by B3's ruled recommendation criterion:** the40-case dev audit found0 findings and0 label hits (typed stage skipped-budget in37 cases, a recorded limitation). With no label hit the plan's “on only if≥1 hit and≤1 finding/case” condition fails. Fixes are off. If a later separately ruled configuration enables contracts, every emitted contract finding must also be exported with product dedupe; a model-only export would then be incomplete.

For each tool/case, record attempt/completion status separately from zero comments. An explicit terminal successful review with no eligible comments is a valid zero. A startup walkthrough alone is not proof of completion. Freeze tool-specific terminal-evidence extraction configuration from G1/S1; retain API evidence. A missing/incomplete review is `no-review`, not an invented zero-comment completed review.

Collection records exact PR/base/head, tool/configuration revision, timestamps and SHA256 of raw/neutral artifacts. Check PR base/head binding at collection. A changed commit pair invalidates the attempt; do not substitute the new tip. Snapshot at the fixed window end; never wait longer for the tool that looks worse.

## 4. Scoring, denominators and reporting

Primary metric: **distinct labelled bugs caught**, with a Wilson95% interval **without continuity correction**. Headline includes tool/case completion coverage, comments per PR and TraceHound cost per PR. F is a dev diagnostic only, never the held-out headline.

- One caught bug per case at most, regardless of matching comment count or target-row count. Judge match to any primary/alternate target establishes the logical match. Do not add extra TP for a second matching comment or alternate.
- Primary judge: frozen `bench-judge-v1`; secondary held-out judge: frozen `bench-judge-x1`. Use existing prompt/model/settings; hash exact configurations at freeze. Dev selection uses v1 only. Secondary held-out rows are report-only and do not select a configuration.
- Report `K/20` as ruled inS0.3, with review completion/failure coverage visible. Proposed conditional completed-review `K/n` and the handling of unavailable reviews are listed in section13; they are not approved denominator substitutions.
- Pairwise comparisons use the exact test below. **Which unavailable/failed cases enter each pair remains pending Sunny's ruling**, including the proposed external no-review exclusion versus TraceHound-failure miss treatment. State the final paired n and exclusions explicitly; do not implement an asymmetric default before that ruling.
- Compare tools with the **exact two-sided sign test on discordant bugs** (exact McNemar): if a is caught only by A and b only by B, `p = min(1, 2 * P[Binomial(a+b, 0.5) <= min(a,b)])`. If a+b=0, p=1. No mid-p, asymptotic chi-square or after-the-fact test substitution. Report the registered pairs and exact p values. The operative α and multiple-comparison treatment are **proposed in section13**, not decided by this draft. No global-rank/equivalence claim follows.
- Report total eligible comments, mean/median comments per attempted PR and per completed PR, clean-case comment counts, completion/failure/partial counts, and cost mean/median/max plus total. Distinguish pipeline, judging and infrastructure costs. Contract/model sources remain visible in aggregate diagnostics.
- Label-match fraction is a **lower bound** on precision: unlabelled valid defects can be counted against a tool. It does not estimate all-bug recall or prove clean cases bug-free. Never choose comment inclusion after scoring.

Location hit is model-free: at least one emitted comment on the labelled file within ±10 lines of **any** accepted row's inclusive range. Null/unmapped lines do not pass location hit. Count the case once. It is a separate diagnostic, not a replacement for semantic bug matching and not the schema-agreement rule.

## 5. Selection gates on dev

All case-count gates use the31 dev bug cases and their accepted alternate targets. A margin under3 is a tie; **A0, the incumbent pool-verify-v1, stays**. This intentionally supersedes the former simpler-arm tie rule. If several candidates pass all relevant gates, choose the cheaper measured arm. The sources do not choose an equal-cost tie order; the candidate ordering in section13 is a proposal pending Sunny. Do not retune gates after outputs exist.

**L1:** replay run1 lineage into A0 pool-verify-v1, A1 pool-raw and A2 review-diff-v1, each capped at15 in pool order. Adopt only if judged bugs caught ≥ A0+3, location hits ≥ A0, and comments per case ≤ CodeRabbit on the same dev cases, or ≤2×A0 if its row is unavailable. A raw pool's uncapped inclusion does **not** imply capped A1 includes capped A0. Persist the actual arm exports and counts. The false-adopt/reject estimates in076 depend on unmeasured TS discordance; these are accepted exploratory gates, not significance claims.

**L2:** treat independence/half-recovery as a hypothesis to test. Cache bypassed; every run1 reviewer chunk ending `CHUNK_FAILED` receives two fresh redraws of the original request, reasoning on. Adopt a third-attempt default only if ≥50% of those chunks yield a valid reply in at least one draw. Fewer than4 failed chunks: **no test, no change, report the rate**. A nonempty reply is not necessarily valid. Preserve first attempts, request bytes, validity and paid-attempt counts. The handling of more than11 failed chunks is pending the caps-check ruling; never truncate opportunistically to the chunks that succeed.

**L3:** only the $0 reference-share check runs. Paid step2 is **CUT**, regardless of reference-share outcome. Report the model-free result; do not implement/adopt a new context budget from this evaluation.

**A2/R2:** decision077 names the candidate and its exact flags before a fresh run2. Non-regression gate: judged bugs caught ≥ run1's **same-arm** count−2; otherwise revert to the run1 incumbent and disclose it. This gate has noise-driven false-rejection risk, not a new significance guarantee. If budget cuts turn R2 into a cache replay, report fresh-draw confirmation NOT RUN, not a passing independent repeat. **L4** union is report-only, never adoptable; its cost counts both source draws and union judging.

## 6. Power and claim templates

Six net bugs is the minimum observed gap that can be significant at20 bugs, not a guaranteed significance rule: discordant splits6–0,8–1 and10–2 differ. A true gap and an observed gap are different quantities.

Under bunny's independent-catch examples,20% versus50% and15% versus45% recall give exact-test power0.37–0.39 at n20, α0.05. For20% versus50%, power rises to0.44/0.53 at catch correlations0.2/0.4. Baseline recalls and correlations on TS are unmeasured. Approximate gap/power estimates from that model are not empirical requirements or promises of detection.

S0.3 fixes the **metric**: bugs caught of20 with a Wilson interval, comments per PR and cost per PR; F on dev only. Metric template: “Tool T caught K/20 labelled bugs (Wilson interval L–U), posted C eligible comments per PR and cost D per PR.” The repository/population scope of a public claim is **pending Sunny**, not superseded by this protocol; the29-case/four-repository wording is proposed in section13. Fill the metric from frozen records and the blind hand-check, not forecasts.

If the exact test does not reject, say **“no detectable difference at this sample size.”** Never “catches as many,” “matches,” equivalence, or a rank. If it rejects, describe the observed pair, count gap, paired n and p without extrapolating to other languages/tools or claiming a global winner. State selection history, limited labels, no-review exclusions and possible context/ref visibility limitations.

Historical cost is about **$0.075 per PR measured on non-TypeScript dev** (budget/results); any TS cost before live measurement is labelled **estimate**. Do not call about$0.08 a measured TS cost. Report actual ledger and console reconciliation separately after runs.

## 7. Window and trigger schedule

Held-out PRs open only after the final freeze tag. Do not book the window until Sunny confirms dates and the one2–3h hand-check sitting. Freeze an ordered private case list before triggers; every tool uses **the same PR order**, including across batches. The common72h start/end are UTC instants, not separate tool-specific clocks.

CodeRabbit planning rate is **1 review/hour** per developer with per-repository scope as applicable; the local10/hour ceiling is not proof of a vendor allowance. P1 measures actual rate/coverage before the freeze, and the reviewed schedule slot below is filled from it. Do not invent a12h trigger deadline incompatible with29 PRs at1/hour. All trigger times must fit the common window; fix the schedule before knowing held-out outputs.

Greptile: verify sufficient credits for29 cases before H1 and for the one smoke separately; check the actual credit/reset period in the dashboard, not an assumed calendar month. No Greptile dev run beyond the smoke. Bugbot excluded.

Permit **one re-trigger per tool per PR for a documented tool error only**. A silent but successful zero-comment review is not an error. Absence of a desired finding is never a re-trigger reason. The recovery schedule is filled before freeze fromP1/Sunny's dates; **+24h is only the proposal in section13**, not a ruled deadline. Do not expand authorization to arbitrary redraws. Preserve every original/error/re-trigger object. No additional PR pushes or ref changes to elicit a better result.

## 8. Runner flags and caps

Freeze the exact checked-out code, model/prompt hashes, scripts, manifests/overlays, cache policy, command and batch list before H1. Commands below are a **shape**, not a runnable authorization; angle-bracket inputs are private operator values.

```sh
node scripts/run-tracehound.ts --manifest <manifest> --clone <complete-local-clone> \
  --ids <frozen-batch-ids> --out-dir <private-job-output> \
  --fixes off --contracts off --cache off \
  --max-usd-per-case 0.40 --max-usd-run <computed-batch-cap>
```

Dry run first. Only artu1 approves a paid execution after all gates/freeze/console prerequisites; adding `--execute` is a separate controlled action. Do not post unless explicitly authorized and base/head checks pass. Hold-out outputs stay outside tuning agents' view; no implicit default output directory for H1. No existing result is overwritten: a permitted rerun writes its own artifact and preserves provenance.

As ruled in076, the batch cap is `min(batch estimate + $0.40, job cap − job spend so far)`. Job caps: S1$0.45; R1$4.15; L1$0.40; L2$0.80; L4$0.10; R2$4.15; H1$3.15; H2$0.40; reserve$3.00; unallocated$1.71. L3step2 is cut. These are **pending Sunny's ruling on bunny's caps check**: mean-cost arithmetic does not guarantee all cases start under variable spend or an adopted third attempt. Do not replace the ruled formula silently.

Before every batch, compute both invocation and whole-job spend from the shared ledger; serialize paid jobs so unrelated calls cannot distort deltas. Include reruns, retries and subsequent judging in their job envelope. A STOPPED/unstarted case is not a completed reviewed case. Never raise a cap or draw on unallocated/reserve automatically. Console reconciliation is ≥2h after the paid job, with UTC time; console/ledger ratio>1.08 requires replanning. Protected H1,H2,reserve remain protected under076; cut L2 first, then downgrade R2 to replay with its lost fresh-confirmation claim disclosed.

**Proposed procedures, not yet owner-approved:** for each judge-only job spanning processes, set every process's total cap to `min(global hard stop, ledger at job start + job cap)` and its run cap to the job cap, and serialize or coordinate reservations across processes. Do not print environment keys/values. `bench score` is not capped by `--max-usd-run`. L4 should use concurrency1–2 to avoid its final calls being refused by in-flight reservations. L2 with more than11 failed chunks needs a pre-registered cap-compatible rule or a NOT RUN/incomplete outcome; no discretionary successful-chunk subset. All remain pending the caps-check ruling and implementation review.

## 9. Failure and missing-review rules

- TraceHound case status`ok`, including partial reviewer output: score exactly the emitted findings. Keep `CHUNK_FAILED` counts and empty-case counts. Do not discard a partial success or repeat it merely for better recall. L2's dev reliability experiment is separate.
- A `failed` or `cap` case is recorded with its original artifacts and spend. **One rerun and the official-result/miss treatment are proposed, pending Sunny**, in section13; this draft grants no case-level rerun authorization.
- A case never started because of STOPPED/cap exhaustion is explicitly recorded as unstarted. Whether it continues in another batch or becomes a miss at window end is **pending Sunny**, not a default zero/exclusion adopted here.
- External tools follow section7's one-error-retrigger limit. A still-missing/incomplete review at+72h is recorded no-review. Its treatment inK/20 and paired n remains the proposal in section13. A documented completed zero is scored normally as zero.
- No post-result relabelling, alternate addition, scope/counter changes, threshold changes, extra time or unplanned reruns. A discovered data-integrity problem is disclosed and handled under a blind pre-existing rule or the run is invalidated; do not repair selectively after unblinding.

## 10. Blind hand-check and firewall

Held-out uses both frozen judges and location hits. Sunny checks **every match proposed by either judge, every judge disagreement, and every eligible comment within±10 lines of any accepted target row**, including alternates. Preserve independent v1/x1 results; the blind adjudication supplies the final human-confirmed catches. Everything outside that candidate set remains unmatched; publish the candidate-generation limitation.

The sheet hides tool identities, tool-specific headers/footers and revealing metadata without changing substantive finding text. Randomize candidate order with a frozen recorded seed; keep private reversible IDs/mapping. Do not let a tool's comments remain grouped by tool. Retain exact original text separately for audit. Freeze/hash the blank sheet, randomization recipe and mapping before review; hash Sunny's completed decisions before unblinding. Record decisions and reasons, not just a total. **Hiding judges' proposed outcomes is proposed in section13**, not added to S0's ruling.

Tune-side agents artu1 and bunny never see held-out inputs, labels, case content, outputs or panes before the firewall lifts. The non-tuning operator freezes and hashes the private artifacts. As ruled inS0.5, **the firewall lifts after held-out outputs and score files are frozen and hashed**. Unblinding the hand-check sheet is a separate step; section13 labels the proposed ordering, and no additional ordering is imposed here. Until the ruled lift condition share counts only. A later lift does not permit tuning this frozen reviewer or changing the scored protocol.

## 11. Freeze checklist and predictions

Decision077 records the dev-selected candidate, gate outcomes, cost, A0/A1/A2 selection and attempts2/3 before R2. Freeze3/decision078 records the final commit/tag, exact commands and batches, all prompt/model/flag hashes, tool allowlist/completion settings, primary/alternate overlays, counting rule, official-result selection rule, credit check and the completed slots below. Hash predictions before the first held-out PR/trigger/model call. No reviewer edits from then through final score freeze.

Prediction fields (record values or explicit “no quantitative prediction,” never backfill):

| Prediction | Pre-window value | Frozen date/hash |
|---|---|---|
|TraceHound bugs caught of20, with stated uncertainty|FILL BY F1|FILL BY F1|
|CodeRabbit/Greptile catch counts and anticipated paired discordance|FILL BY F1|FILL BY F1|
|Expected eligible comments per PR, clean-case comments, completion rates|FILL BY F1|FILL BY F1|
|TraceHound pipeline/judge spend and failed-chunk/empty-case rate estimates|FILL BY F1|FILL BY F1|
|Expected significant/non-significant pairs, with assumptions|FILL BY F1|FILL BY F1|

The write-up scores predictions right/wrong/too-vague, reports all pre-registered pairs, selection history, failures and limitations, and updates results/viewer tables consistently. Public release contains aggregate results and method; private case artifacts remain private.

## 12. Explicit pre-freeze slots and dependencies

| Slot | Owner/input | Required before |
|---|---|---|
|Contracts: RESOLVED OFF|B3 dev audit:40 cases,0 findings,0 label hits; typed skipped-budget37; the ruled recommendation criterion selects off|S1/F1 command frozen with contracts off; same policy for all scored arms|
|CodeRabbit measured rate, common-order trigger/recovery schedule|P1/G1 and Sunny's dates; planned1/hour until measured|F1; no booked held-out window beforehand|
|Exact72h UTC window and Sunny2–3h sitting|Sunny|F1/H1|
|Tool API identity and terminal-review evidence configuration|G1/S1 real observations; no hard-coded guessed bot login|Final collection/scoring configuration atF1|
|Caps-check ruling, exact per-batch limits, judge-only env budget enforcement, L4 concurrency and L2>11 handling|Sunny/artu1, bunny caps-check; current076 rule remains marked pending|Any affected paid job|
|Candidate/final commits, commands, code/prompt/model/config hashes, sealed overlays and predictions|B1/B2/C1,077,078 andF1|First held-out action|

The declared dependencies and the proposals below must be settled before affected execution, not after results. This draft's publication unblocks B2 implementation/review, not paid execution. B2 must not silently hard-code a pending proposal as approved policy.

## 13. Proposed, pending Sunny

None of these choices is operative until Sunny rules and the ruling is recorded before the affected run. The sources in076/S0 do not settle them; historical model assumptions are not protocol authorization.

| Proposed choice | Reason |
|---|---|
|The public claim names29 cases from four TypeScript repositories|Matches the current population, butS0.3 rules only on the metric; budget.md's older two-repository scope remains pending Sunny rather than superseded.|
|Sign-test α0.05, pairwise unadjusted/exploratory reporting and explicit lack of familywise control|Matches the plan's historical examples, but076 names the exact test without adopting this threshold/adjustment policy.|
|Equal measured-cost tie: retain incumbent if among passing arms, otherwise A1 thenA2|Provides a deterministic fallback beyond the ruled “cheaper one”; no source picks it.|
|One rerun for a failed/cap TraceHound case; second result official even if fewer findings; twice-failed case is a miss; no third attempt|Carries the original plan's operational proposal forward without pretending076 adopted it.|
|Still-unstarted TraceHound case at window end counts as an end-to-end miss|Prevents hidden incompleteness, but continuation/reserve versus miss needs the caps-check ruling.|
|External no-review contributes no catch in attemptedK/20 and drops from that pair's n; display completion counts and optional conditionalK/n separately|Makes availability visible but the sources do not approve this asymmetric denominator/miss treatment.|
|Hide the judges' proposed outcomes on Sunny's sheet|Avoids an outcome cue beyond the already ruled tool-blind presentation.|
|Error recovery slot at+24h where it fits the common72h window|A concrete schedule proposal;076 permits one error re-trigger but does not choose its time.|
|Wait for the completed sheet hash before firewall lift/unblinding|Extra ordering precaution beyondS0.5; firewall lift itself remains tied only to frozen/hashed outputs and score files until Sunny rules.|
|Keep unresolved moved/unmappable targets in the population, stop preflight for invalid target geometry, and obtain a blind correction/ruling rather than exclude after results|The population is fixed but076 does not settle every unmappable-data scoring consequence.|
|Within a file, preserve all verified range variants as OR-target evidence while keeping one canonical row and no duplicate bug count|The accepted overlap-agreement rule does not independently choose which labeller's range becomes the sole scoring range.|
|Shared per-job total/run budget caps across judge-only processes; L4concurrency1–2; pre-registered handling above11 failed chunks forL2|The caps check identifies these safeguards; the Addendum explicitly leaves them proposed pending the owner ruling.|
