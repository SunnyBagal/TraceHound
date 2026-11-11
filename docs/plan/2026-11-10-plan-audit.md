# Audit of the plan to the held-out run (2026-11-11)

Plan audited: [`docs/plan/2026-11-10-plan.md`](2026-11-10-plan.md) at `cd5525a` (planner session "Fable", 145 lines).
Rule (Sunny, 2026-11-11): **plans are hypotheses; no task runs unless its premises check out against our own data.**
$0, nothing executed, the plan itself is not edited. Merged by artu1 from three independent audits (briefs written by the
planner before it handed the merge to artu1, `tracehound-testset/run/comms/planner.plan-audit-handoff.md`):

| lane | scope | output (tracehound-testset `run/out/`) | rows | VERIFIED | CONTRADICTED | UNSUPPORTED | other |
|---|---|---|---|---|---|---|---|
| codex | internal claims (repo, code, ledger, decisions, docs) | `codex.plan-audit.md` | 131 | 105 | 10 | 10 | 6 GUESS (marked) |
| bunny | statistics and budget arithmetic, with working | `bunny.plan-audit.md` | 23 | 13 | 6 | 4 | — |
| grok | external claims (vendors, docs), with URLs | `grok.plan-audit.md` | 31 | 23 | 1 | 7 | — (row 23, a guess the docs neither confirm nor deny, is counted as UNSUPPORTED) |
| **total** | | | **185** | **141** | **17** | **21** | **6** |

Rows are claims as each auditor split them; a few claims appear in two lanes (e.g. the S1 cap: bunny 7i, codex C096).
artu1 spot-checked grok's URLs: 8 of 8 quoted phrases found on the cited pages (CodeRabbit plans and rate-limits pages,
Greptile pricing, the CodeRabbit GitHub App page), 2026-11-11.

**Author's response.** The planner accepts all six of bunny's CONTRADICTED items (3, 7b, 7f, 7i, 7j, 7k) and calls the
four UNSUPPORTED ones fair (inputs unmeasured on TypeScript); recorded here, not re-argued.

## Is the $3 reserve inside the $17.25?
**Inside.** The plan's table (plan:130-143): paid jobs S1 0.25 + R1 3.80 + L1 0.40 + L2 0.80 + L3 1.80 + R2 3.80 +
H1 3.00 + H2 0.40 = **$14.25**; + reserve **$3.00** = **$17.25** allocated; + unallocated $1.06 = $18.31 usable; + the
$1.00 safety margin = **$19.31** available (the 2026-11-09 console reading, `docs/budget.md:3,78-91`). bunny re-added the
lines (row 6, VERIFIED). So the reserve is not extra money: if the jobs overrun, the reserve and the $1.06 are all there is.

## CONTRADICTED and UNSUPPORTED claims
`changes a task?` names the plan tasks whose premise this is.

| # | claim (plan line) | source checked | verdict | does it change a task? |
|---|---|---|---|---|
| b3 | "beats CodeRabbit/Greptile only if the true gap is about 30 points" (:20, :43, :46, :58) | bunny: exact paired test, n = 20 | CONTRADICTED: in bunny's model (catches independent across tools, exact test, α 0.05), the example 30-point gaps (20% vs 50%, 15% vs 45%) have power 0.37–0.39; ≈ 35 points for 50%, ≈ 48 for 80%. Positive catch correlation raises power (0.44 at φ 0.2, 0.53 at φ 0.4 for 20% vs 50%); that correlation is unmeasured | yes: D1 claim templates, F1 predictions, W1 |
| b7b | the run caps work with the runner as planned (:82, :87, :134, :138-139) | `scripts/run-tracehound.ts:153, :663` (a case starts only if spent + case cap ≤ run cap) | CONTRADICTED: R1 stops at ≈ $3.40 not $3.735; H1 at $2.60 vs $2.708; per-batch caps stop batches after ≈ 6 cases | yes: R1, R2, H1, A1, D1 need per-invocation `--max-usd-run` with ≈ $0.40 headroom |
| b7f / C085 | L3 step 2 ≈ $1.55, cap $1.80, "40 ctx calls" (:68, :137) | bunny; codex (`$0.0234` is per call, not per case) | CONTRADICTED: ≈ $2.17 (range $1.97–2.35), above its cap; call count UNSUPPORTED until B3 counts chunks | yes: L3 step 2, A1, E1 |
| b7i / C096 | S1 smoke $0.25 "one case at the case cap" (:80, :113, :133) | `run-tracehound.ts:153`; D1's $0.40 case cap; max PR $0.30–0.34 (`docs/bench/results.md:282-283`) | CONTRADICTED: ≈ $0.45 needed | yes: S1, A1, D1 |
| b7j / C030 | "about $0.08 per PR" (:20, :58) | measured $0.0747 / $0.0761 non-TS (`docs/budget.md:70-75`); the plan's own +25% gives $0.093–0.095 | CONTRADICTED (internally) and UNSUPPORTED for TS | yes: D1 claim template, F1, W1 |
| b7k | re-plan only above a console ratio of 1.10 (:80, :145) | bunny | CONTRADICTED: the caps stop fitting at 1.061 | yes: S1, A1 |
| C003 | "anything not measured is marked (guess)" (:4) | plan :20, :65-69, :74, :88, :130-140 | CONTRADICTED: several cost, time and outcome forecasts are unmarked | yes: label estimates in A1, S1, E1, R1, R2, H1, H2 |
| C005 | brain NOW stale "since 2026-10-29" (:6) | brain `NOW.md` frontmatter | CONTRADICTED: 2026-10-30 00:15 IST (now superseded by the 2026-11-11 backfill, brain `29e8515`) | no (wording) |
| C012 | the testset has "only" four scripts (:27) | `tracehound-testset/scripts/` | CONTRADICTED: seven (adds `open-prs.test.ts`, `disable-upstream-workflows.ts` + test); still no golden builder or scorer | no (the gap M1 stands) |
| C015 | "no written rule" for which tool outputs count (:28) | existing scorer rule: top-level line review comments from bot/tool accounts; summaries, review bodies, issue comments, replies, humans excluded | CONTRADICTED | yes: B2 and D1 start from the existing rule and state any change |
| C031 | strongest expected claim "catches as many … within the precision of the test" (:20) | plan :47 itself excludes "matches"/equivalence | CONTRADICTED: failure to detect a difference supports "no detectable difference", not "as many" | yes: D1, F1, W1 |
| C038 | the empty-reply fix is "L3" (:32) | plan §3 | CONTRADICTED: it is L2 (L3 is context) | yes: routing in L2, L3, E1 |
| C067 | margin < 3 means the incumbent stays, "per budget" (:61) | `docs/budget.md:99-100`: the **simpler arm** wins ties | CONTRADICTED | yes: pick one tie rule before any result: A1, D1, L1, L2, L3, A2 |
| C073 | "A1 ⊇ A0 by construction" at cap 15 (:66) | codex counterexample: 16 ordered findings, the verifier keeps only #16; A0 posts #16, A1 posts #1–15 | CONTRADICTED: the posting cap breaks inclusion | yes: L1's argument, B1, B2, E1, A2 |
| C089 | temperature 1 / top_p 0.95 "never tested" (:71) | recall-v3 / probe runs used them (decision 070) | CONTRADICTED as a blanket statement; no isolated A/B on frozen pool-verify-v1 | yes: E1, A2, W1 wording |
| g5 | CodeRabbit "≤ 10 per hour per fork" (:87) | https://docs.coderabbit.ai/management/plans: limits per developer, OSS "additionally scoped per repository", 1–10 varying by stars | CONTRADICTED | yes: H1 and P1 schedules |
| b5a | L1 gate "≥ A0 + 3 of 31" (:66, :68) | bunny | UNSUPPORTED: false adopt 1–16%, false reject 14–80% depending on unmeasured arm discordance on TS | yes: L1, L3, E1, A2 |
| b5b | R2 gate "≥ run 1 − 2" (:85) | bunny | UNSUPPORTED: ≈ 12–26% false reject of an equal candidate; draw-to-draw correlation on TS unmeasured | yes: R2, E1, A2 |
| b5c | L2 gate "≥ 50% of ≥ 4 chunks" (:67) | bunny | UNSUPPORTED: P(pass) 0.80 at 074's 0.59 redraw rate, 0.35–0.53 at 0.3–0.4; 074's chunks were selected for failing | yes: L2, E1 |
| b7e | L2 "≈ 8 failed chunks" (:67, :136) | old non-TS count (`docs/bench/dev-3.5.md:88-91`) | UNSUPPORTED for TS | yes: L2, E1, A1 |
| C023 | arm scoring ≈ $0.15, cap $0.40 (:12, :66, :135) | $0.0012 is a historical average; no replay kit exists | UNSUPPORTED (bunny: arithmetic VERIFIED, $0.144) | yes: label estimate in A1, L1 |
| C025 | redraw ≈ $0.56, 8 chunks × $0.035 (:13, :67, :136) | historical reviewer mean $0.0234 per call; $0.035 per redraw not measured (bunny: $0.0333–0.0337 from prices/ledger) | UNSUPPORTED as a TS cost | yes: A1, L2 |
| C076 | redraws are independent enough to recover about half (:67) | no test of an original-request redraw | UNSUPPORTED (a hypothesis, not tagged) | yes: L2 is a test of it, not a premise |
| C088 | union cost ≈ $0.05 (:69) | none | UNSUPPORTED | yes: L4 needs a cost line |
| C099 | multi-batch job caps $3.80 / $3.00 enforced (:82, :85, :87, :121, :134, :138-139) | `--max-usd-run` defaults to $2 per invocation; invocations don't share an envelope | UNSUPPORTED (no command enforces them) | yes: A1, D1, R1, R2, H1 |
| C127 | cost bases $0.0012 / $0.035 / $0.0234 / $0.0761 / $0.0014 and the +25% uplift (:135-140) | historical averages; $0.0761 = budget's $0.0747 + $0.0014 judging (derived) | UNSUPPORTED as TS costs | yes: A1 (label as estimates) |
| C069 | effort and owner-time estimates (:65-69, :74, :88) | none | UNSUPPORTED | yes: S0 must confirm Sunny's availability before booking the window |
| C002 | "no held-out file opened" by the planner (:3) | planner statement only | UNSUPPORTED (a session-wide negative can't be proven from the commit; the handoff repeats it) | no (provenance note) |
| g6 | a 0-star repo gets the bottom of CodeRabbit's 1–10 range (live-setup, cited :38) | plans page tooltip: varies by star count | UNSUPPORTED (worst case 1/h stays the planning assumption) | yes: P1, H1 schedule at 1/h |
| g11, g22 | CodeRabbit's and Greptile's GitHub bot logins (:115, :117) | App slugs `coderabbitai`, `greptile` only; API `user.login` not documented | UNSUPPORTED | yes: B2's collector allowlist waits for G1 (read a real comment's login in the smoke test) |
| g13, g23 | which ref the tools index (PR head, default branch, other) (:36, M9) | CodeRabbit/Greptile docs: "entire repository/codebase", no branch named | UNSUPPORTED (M9 stays a marked guess) | yes: state as a limitation in D1/W1; G1 |
| g17 | Greptile's 50 credits reset per calendar month (live-setup, cited :38) | pricing "per month"; changelog says "billing period" | UNSUPPORTED | yes: S1 + H1 must fit in one 50-credit period, or check the dashboard first |
| g30 | a documented billing/console delay (the plan waits ≥ 2 h) (:80, :82, :90) | no vendor doc | UNSUPPORTED (it is our own observation, `docs/budget.md` rule 5) | no (keep the rule; cite it as ours) |

Marked guesses (codex C041, C045, C053, C063 and two more; grok 23) are labelled as guesses in the plan and stay so.

## Tasks
**BLOCKED** = a premise is CONTRADICTED or UNSUPPORTED and changes whether or how the task runs. **Clear** tasks may
proceed when their own dependencies and the spend freeze allow (all paid tasks are also behind the freeze).

| task | status | reason (rows) | unblocked by |
|---|---|---|---|
| S0 | clear | rulings are Sunny's; C069 adds one: confirm owner availability | — |
| A1 (budget split + decision 076 gates verbatim) | **BLOCKED** | the table and gates it would register contain b7b, b7f, b7i, b7k, C067, C073, C099, C023/C025/C127 | corrected budget table (per-invocation run caps with ≈ $0.40 headroom, S1 ≈ $0.45, L3 step 2 recosted, lower re-plan ratio), one tie rule, estimates labelled |
| D1 (protocol) | **BLOCKED as written** | claim templates b3, C031, b7j/C030; tie rule C067; counting rule C015; exact test named (bunny 2c: exact two-sided sign test; Wilson without continuity correction) | write those corrections into the protocol (it's $0; D1 is where they land) |
| B1 (lineage, replay-arms) | clear | lineage gap M3 VERIFIED; C073 changes L1's argument, not the need for lineage | — (replay-arms must not assume A1 ⊇ A0) |
| B2 (scoring kit) | **BLOCKED in part** | C015 (start from the existing counting rule); g11/g22 bot logins unsupported | existing rule adopted in D1; logins read from real comments (G1/S1) before the allowlist is fixed |
| B3 ($0 dev audits) | clear | it measures what C085 and b7e need | — |
| C1 | clear | after B1, B2 | — |
| G1 (tool facts) | clear | it resolves g6, g11, g13, g17, g22, g23 | — |
| S1 (smoke) | **BLOCKED** | b7i/C096 ($0.25 can't run a $0.40-cap case); b7k ratio threshold; plus the freeze | job cap ≈ $0.45; ratio trigger lowered; freeze lifted |
| P1 (dev PRs + CodeRabbit) | **BLOCKED** | g5 (rate is per developer, scoped per repo, not "10 per hour per fork"); g6 | schedule at the worst case (1/h) or G1's measured rate |
| R1 (dev run 1) | **BLOCKED** | b7b/C099 (batch caps stop early; no command enforces $3.80) | per-invocation `--max-usd-run` values in A1/D1 |
| E1 / L1 | **BLOCKED** | C073 (inclusion argument invalid), C067 (tie rule), b5a (gate error rates unmeasured) | drop the inclusion argument; one tie rule; accept or change the gate with its error rates stated |
| E1 / L2 | **BLOCKED** | b5c, b7e (TS rates unmeasured), C025, C038 (task label) | B3/R1 measure TS failed-chunk counts; L2 framed as a test of C076 |
| E1 / L3 | step 1 clear ($0); **step 2 BLOCKED** | b7f/C085: ≈ $2.17 > $1.80 cap | recost after B3(c) |
| L4 (union, report only) | **BLOCKED** | C088 (no cost line) | a cost line in A1 |
| A2 (decision 077) | **BLOCKED** | depends on the L1–L3 gates (b5a, b5b, b5c) | gates fixed in A1/D1 |
| R2 (dev run 2) | **BLOCKED** | b7b/C099 caps; b5b gate | as R1; gate restated |
| F1 (freeze, predictions, claim wording) | **BLOCKED** | b3, C031, b7j/C030 | corrected claim templates (D1) |
| H1 (held-out window) | **BLOCKED** | b7b/C099 caps; g5 CodeRabbit rate; g17 Greptile period | per-invocation caps; worst-case schedule; credits checked in one period |
| H2 (scoring) | clear | its cost (bunny 7h) VERIFIED; C127 asks only that the basis be labelled | — |
| W1 (write-up) | **BLOCKED** | b3, C031, b7j, C089 wording | corrected claim templates |

## Corrections for Sunny (the plan is not edited; these are the author-accepted or audit-found fixes)
1. Claim wording: drop "catches as many …"; use "no detectable difference" unless the exact test rejects; drop "reachable
   only if ≈ 30 points" (under independent catches a 30-point true gap is found ≈ 4 in 10 times; more if the tools' catches are correlated, which is unmeasured); state the protocol's test (exact two-sided sign
   test on discordant bugs) and interval (Wilson, no continuity correction).
2. Cost per PR: say $0.075 measured (non-TS) and mark any TS figure as an estimate.
3. Caps: per-invocation `--max-usd-run` with ≈ $0.40 headroom per batch; S1 ≈ $0.45; L3 step 2 ≈ $2.17 or cut; re-plan
   ratio below 1.06 (or apply the cut order before the first paid run).
4. One tie rule (budget.md says the simpler arm wins; the plan says the incumbent): choose before any result.
5. L1: remove "A1 ⊇ A0 by construction".
6. Tool output counting: start from the existing rule (top-level line review comments from the tool's bot).
7. CodeRabbit rate: per developer, also scoped per repository, 1–10 by stars; plan at 1/h.
8. Greptile: one 50-credit period may be the billing period, not the calendar month; check the dashboard before S1 and H1.
9. Small: L2 (not L3) is the empty-reply lever; the testset has seven scripts; temperature 1/top_p 0.95 were run in 070;
   NOW's date; label every estimate.
