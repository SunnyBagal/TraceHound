# Budget (2026-11-09; split replaced 2026-11-11, decision 076)

**Money left: $19.13** (the owner's console reading, 2026-11-09; first written here as $19.31, a typo corrected 2026-11-13; it was $23.39 on 2026-11-08). That is all the money the
project has. Every model call from here on has a line below, or it does not happen.

**Freeze lifted 2026-11-13: Sunny's decision, made without the console check** (once 076d and its merges were on main).
The remaining guard is S1: compare the Nebius console with the ledger at least 2 h after S1 ends; if console ÷ ledger is
above **1.08**, stop and tell Sunny. (The freeze had waited on a console check of hourly usage, 2026-11-08 → 09: about $3.36
at 09:00–10:00 UTC on 8 Nov, nothing overnight, no running sandboxes; that check was not made.) Sunny revoked the old API key on 2026-11-09; the
new key is only in local `.env`.

**Likely explanation: billing lag, not a leak.** Job 074 ran 2026-11-08T08:43:04Z–09:39:08Z and cost **$3.36463**
(ledger, 147 calls; `docs/bench/hard-chunks.md:52`). Sunny's $23.39 reading came about 1 minute after 074 finished
(owner), so it did not yet include 074. Then 23.39 − 3.36463 (074) − 0.49090 (075) = **$19.53** expected vs **$19.13**
real: $0.40 unexplained (≈ 10% of the two jobs' $3.86; not proven). codex found no
Nebius-key-capable CI run in the 48 h (`run/out/codex.leak.md` § 48 h) and grok no committed key in 53 public repos
(`run/out/grok.secrets.md`). The "≈ $3.59 off-ledger overnight" in the log below is superseded by this.

## S0 rulings (Sunny, 2026-11-11; decision 076)
- The plan (`docs/plan/2026-11-10-plan.md`) runs only as corrected by its audit (`docs/plan/2026-11-10-plan-audit.md`);
  corrections 1, 2, 5–9 accepted as written, 3 and 4 as below. The freeze stayed until 2026-11-13 (lifted without the console check; see the top).
- **Caps:** the table below. L3 step 2 is cut (L3 step 1 is $0 and still runs). Batch run caps: see the caps ruling below
  (it replaced "min(batch estimate + $0.40, …)"). Re-plan if console ÷ ledger > **1.08**. Cut order: L2, then R2 becomes a
  cache replay. H1, H2 and the reserve are never cut.
- **Ties:** a margin under 3 cases is a tie and the incumbent (A0, pool-verify-v1) stays; if several arms pass, the cheaper
  one wins.
- **Multi-file bugs:** every row of one defect is the same bug; the case counts once; a comment matching any row catches
  it; the primary is the first file in git's path order (rule, never by hand); the others are alternates.
- **Schema:** devin's two choices as written (`tracehound-testset/run/out/devin.schema.md`). **Metric:** bugs caught of 20
  (Wilson), comments per PR, cost per PR; F on dev only. **Window:** 72 h, same PR order for every tool, one re-trigger
  per tool per PR for tool errors only (re-trigger slot per 076b); CodeRabbit planned at 1/h until P1 measures it.
  **Firewall** (076a order): hand-check sheet hashed → unblind → score files hashed and committed → the firewall lifts for
  artu1 and bunny. **Hand-check:** Sunny, one 2–3 h sitting; the
  window is not booked until Sunny confirms dates.
- Every cost and time below is an **estimate** unless marked measured.
- **Caps ruling (Sunny, 2026-11-11, after the caps check; decision 076a):** (1) every runner job: batch `--max-usd-run` =
  job cap − job spend so far, unstarted ids roll into the next batch; (2) R1 cap **$4.68** (+$0.53 from unallocated →
  **$1.18**); (3) R2 and H1 caps are recomputed once from R1's measured per-case costs by the caps-check method at 95%
  completion and recorded in decision 077 before R2's first call, funded from unallocated only, H1 first; if R2 can't
  reach 95% it runs at what fits and reports the missing cases; (4) a held-out case left unstarted at H1's cap runs
  from the reserve; (5) L4 at `--concurrency 1`; every judge-only job (L1, L4, H2) sets `TRACEHOUND_BUDGET_RUN_USD` = job cap
  and `TRACEHOUND_BUDGET_TOTAL_USD` = ledger at job start + job cap; (6) L2 with more than 11 failed chunks redraws the
  first 11 by case id, then chunk index, and applies the gate to those. The caps-check options paragraph below is superseded by this.
- **076b (Sunny, 2026-11-11):** (1) **R1/R2 judging:** the post-run `bench score` of R1 and R2 runs inside the job's
  cap: `TRACEHOUND_BUDGET_TOTAL_USD` = ledger at job start + job cap, `TRACEHOUND_BUDGET_RUN_USD` = job cap − runner spend,
  `--concurrency 1`. (2) **Re-triggers:** first triggers always go before re-triggers; a re-trigger takes the first free
  hourly slot at or after 24 h from that PR's own trigger, in PR order (amends 076a's "24 h after"). (3) **CodeRabbit
  allowance:** P1 records the hourly rate at its start and its end; if it shrank, the held-out window starts at least 7
  days after P1's last review. (4) **Canary:** only after two held-out cases in a row fail with a provider or transport
  error; at most 3 tries, ≥ 30 min apart, **$0.40 in total from the reserve**; if all 3 fail, stop and tell Sunny.
  (5) An adopted A1 or A2 is run by the unchanged runner and extracted by replay; the write-up reports the cost paid per
  PR and, beside it, the adopted arm's own calls from the ledger.
- **076c (Sunny, 2026-11-12), caps procedures (Planner B's D1 note §1.3):** (a) before a job's first call the operator
  writes the ledger total and the UTC time to the job's file; every process of that job computes
  `TRACEHOUND_BUDGET_TOTAL_USD` from that file, never from a re-read of the ledger or a shell variable; (b) **one paid
  process at a time, across all jobs**; (c) L2: a draw that never returned a reply is missing; draw order round-robin;
  verdict PASS / FAIL / INCOMPLETE with missing draws (076c item 1). The S1 Greptile clean case is 1 credit, $0 Nebius.
- **Caps check (bunny, 2026-11-11, `tracehound-testset/run/out/bunny.caps-check.md`; estimates, TS costs unmeasured):**
  at the estimate ($0.0934 per case) every job completes, but R1/R2 have 3% headroom and H1 5%. Under a realistic
  per-case spread, the batch rule as written runs every case with P ≈ 0.29 (R1, R2) and ≈ 0.40 (H1): one expensive case
  early in a batch makes its last cases stop (`run-tracehound.ts:663`). L4 at `bench score --concurrency 4` reserves
  ≈ $0.107 > $0.10 and its last calls are refused. Judge-only jobs (L1, L4, H2) are capped only by
  `TRACEHOUND_BUDGET_RUN_USD` (default $1) and the `.env` total unless set per job. S1, L1, L2 (≤ 11 failed chunks) and
  H2 fit. **Options for Sunny (not applied):** batch `--max-usd-run` = job cap − job spend so far, unstarted ids rolled
  into the next batch (P ≈ 0.66 / 0.71 alone); job caps for 95% completion R1/R2 $4.68, H1 $3.53 (+$1.44 from the
  $1.71 unallocated; 90%: +$1.03); or unstarted held-out cases run from the reserve. Procedural, also pending: L4 at
  `--concurrency 1–2`; for every judge-only process set `TRACEHOUND_BUDGET_TOTAL_USD = ledger at job start + job cap`
  and `TRACEHOUND_BUDGET_RUN_USD = job cap`; L2 pre-registers what happens above 11 failed chunks.

## Rules
1. **No experiment without a line in this file** (job, cap, status). A job's cap is enforced in its own runner as well.
2. **Replay the response cache unless reliability is the thing under test.** Reliability tests (failure rates, retries,
   parsing) bypass the cache for the requests under test (standing rule, decisions.md top, from 073a).
3. **Global hard stop:** `TRACEHOUND_BUDGET_TOTAL_USD = 63.15547` in `.env` (gitignored) = ledger total when set
   ($45.02547 on 2026-11-09) + $19.13 − $1.00 safety margin (it was 63.33547 until the 2026-11-13 balance correction, 66.92462 on 2026-11-08). Every client call is refused
   once the local ledger would pass it (`packages/analyzer/src/llm/budget.ts`). Scripts load `.env` only when
   `NEBIUS_API_KEY` is not already in the environment: if you export the key yourself, export this variable too.
4. **The local ledger does not see every charge** (next section). Calls from the GitHub Action, CI, other machines or the
   Nebius console are not in it, so they need their own line here and a console check.
5. **Compare ledger and console at least 2 h after a paid job ends.** The console lags: a reading taken minutes after a
   job does not include it (074, 2026-11-08). Record the reading's time (UTC) with the balance.

## Ledger vs real balance (codex, `run/out/codex.budget.md`)
- Anchor: `docs/bench/reviewbench.md:284-286` gives a balance of **$43.52** (committed 2026-10-27; the reading's own time
  is not stated, but the ledger has no entries between 2026-10-24 and that commit, so the timing does not change the sum).
- Since then the real balance fell **$20.13** ($43.52 → $23.39) while the local ledger recorded **$4.09709** (241 entries).
- So **$16.03 of spend is not in the local ledger** (if both balances are the same credit pool). Likely sources, not
  verified: the GitHub Action's runs (their ledger lives in the CI runner's temp dir), and any use outside this machine.
- **Billing-lag correction (2026-11-09):** if the $23.39 reading did not yet include 074 ($3.36463), the ledger spend
  it reflects is $0.73246 (94 entries, without 074), so the off-ledger gap is $20.13 − $0.73246 = **$19.40**, not $16.03,
  and after the CI estimate below **$12.7–$14.2 is unexplained**. Same caveats (one credit pool, the anchor's timing).
- Check for Sunny: the Nebius console's charge for job 073r, 2026-11-07 20:08:39Z–20:38:31Z (three models), against the
  ledger's **$0.38780** (3.5 Super VL $0.37421, 3 Super $0.01112, Qwen $0.00247). Equal: the ledger's prices are right
  and the gap is calls made elsewhere. Higher: the prices are low by that ratio, so scale every estimate below by it.

**Local-ledger audit (codex, 2026-11-09):** `run/out/codex.ledger.md` enumerates 72 `spend.jsonl` files under
`~/Projects` (excluding node_modules and prohibited response caches; directory symlinks not followed). Using
`timestamp` in UTC, 2026-10-27 through 2026-11-08 inclusive, the main ledger has 400 entries / **$4.58794430**
(including 074 and 075). The evaluation checkout's 400 entries are all duplicates; the UI ledger has no entries in
the window. The other 69 ledgers are temporary test artifacts: **$0.97396000** nominal cost, **$0.89319500** after
exact-row deduplication (fake model names and placeholder purposes; not evidence of billed usage). No request-id
fields occur, so identity is the full JSON row with sorted keys; no fuzzy matching. **The other ledgers do not close
the gap:** no additional non-test spend was demonstrated, so the **$19.40 off-ledger / $12.7–$14.2 unexplained after
CI** estimates above remain. Even counting the unique test cost as billed (unsupported) would explain only 4.6% of
$19.40. Audit cost: $0; only console usage can reconcile the actual charges.

## CI spend (codex, `run/out/codex.leak.md`, 2026-11-09)
- Four repos run the TraceHound Action: SunnyBagal/TraceHound, tracehound-demo, linea-seeded, recall-seeded (all on
  `nvidia/Nemotron-3.5-Super-VL`; fixes on by default, 3 Super). Their spend is recorded only in the CI runner's own
  `.tracehound/spend.jsonl`, which is discarded, so **none of it is in the local ledger**.
- Since 2026-10-27: 106 runs of `tracehound-review.yml`; **89 reached the model path** (TraceHound 59, linea-seeded 15,
  recall-seeded 15; 69 completed pipelines, 1 failed, 19 cancelled after starting); none after 2026-11-01.
- Estimate at $0.075 per PR: **$5.18–$6.68** (69–89 executions), plus the fix stage (not estimable from the logs).
  That leaves **$9.4–$10.9 of the $16.03 gap unexplained** (larger PRs, retries, fixes, cancelled-but-billed requests, or
  another spender). Only the Nebius console (usage by day and model, 2026-10-27 onward) can settle it.
- From 2026-11-09 the review workflows are manual (`workflow_dispatch` + the `tracehound-review` label). **A CI review
  run is an experiment:** it needs its own line below (≈ $0.075 per PR + fixes), and its estimate is subtracted from the
  money left by hand, because the local hard stop cannot see it.

## Unit costs (ledger, 3.5 Super VL era; codex)
| item | cost | source |
|---|---|---|
| reviewer call (diff or ctx; output ≥ 4k tokens, heuristic) | mean $0.0234, median $0.0243 (n 560) | ledger since 2026-10-21 |
| verifier call (output < 4k, heuristic) | mean $0.0032, median $0.0027 (n 384) | same |
| judge call, bench-judge-v1 (3 Super) | mean $0.00091 (n 403) | same |
| judge call, bench-judge-x1 (Qwen) | mean $0.00019 (n 403) | same |
| **full fresh dev run, per PR** (both reviewers + verifier) | **$0.0747** (runs 7r, 8; n = 80 PRs) | ledger windows of 7r/8 |
| judging per PR: v1 only / v1 + x1 | $0.0012 / $0.0014 | same |
| cache-replay run, per PR (073r arm A) | ≈ $0.0073 incl. both judges (8 of 96 first attempts plus misses went live) | recovery-ab.md |

## The split of $19.13 (2026-11-11, decision 076; balance corrected 2026-11-13, decision 076c correction; replaces the 2026-11-09 split, which is in git history)
Bases are **estimates** from the unit costs above (measured on non-TS repos) plus 25% for TS diffs (an assumption).
Job caps are Sunny's (S0, amended 2026-11-11 after the caps check). **Every runner job's batch `--max-usd-run` = job cap − job
spend so far; unstarted ids roll into the next batch** (this replaced "min(batch estimate + $0.40, …)").

| line | what | cap | basis (estimate unless marked) | status |
|---|---|---|---|---|
| S1 smoke | one dev case end to end, all three tools | **$0.45** | one case at the $0.40 case cap + judging | not started (freeze lifted 2026-11-13; Sunny sends S1) |
| R1 dev run 1 | pool-verify-v1, fresh, 40 dev cases, judge v1, batches | **$4.68** | 95% completion under bunny's spread model (caps check), incl. ≈ $0.05 judging; was $4.15 | not started |
| L1 arm scoring | replay of run 1's lineage, 3 arms, judge v1 | **$0.40** | 3 × 40 × $0.0012 ≈ $0.15, + CodeRabbit's dev row | not started |
| L2 redraw test | 2 fresh redraws per `CHUNK_FAILED` chunk of run 1, cache bypassed | **$0.80** | ≈ 8 chunks × 2 × $0.035 (TS count unmeasured) | not started; first to cut |
| L3 step 2 | — | **cut** | (≈ $2.17, above its cap; audit b7f) | cut by S0 |
| L4 union | report only, judge the union of runs 1 and 2 | **$0.10** | ≈ $0.05 (audit C088: unmeasured) | not started |
| R2 dev run 2 | fresh draw of the candidate | **$4.15** until decision 077 | recomputed once from R1's measured per-case costs (95% completion), funded from unallocated only, after H1 | not started; becomes a cache replay if cut |
| H1 held-out run | 29 cases, from the freeze tag | **$3.15** until decision 077 | recomputed once from R1's measured costs (95% completion), funded from unallocated first; an unstarted held-out case at the cap runs from the reserve | never cut |
| H2 scoring | 3 tools + 2 secondary rows × 29 × v1 + x1 | **$0.40** | ≈ $0.20 | never cut |
| reserve | infrastructure reruns (held-out first), a console-check correction, unstarted held-out cases (076a), the canary (≤ $0.40, 076b) | **$3.00** | owner | held; never cut |
| unallocated | needs a new line here before use | **$1.00** | $1.71 − $0.53 to R1 (2026-11-11 ruling) − $0.18 (balance correction, 2026-11-13) | held; funds the 077 recompute (H1 first, then R2) |
| CI review runs | manual Action runs | **$0.00** | none planned; each needs a line first | none since 2026-11-01 |
| safety margin | never spent (outside the global hard stop) | $1.00 | rule 3 | — |
| **total** | | **$19.13** | $18.13 usable + $1.00 margin | |

Done before this split: 075 ($0.49090, ledger; INCONCLUSIVE).

The external review tools (Augment, Cursor, Greptile, CodeRabbit, Copilot) cost no Nebius money to score once their
reviews exist, but getting their reviews of new PRs is outside this budget.

## Scoring scheme for the new sets (devin, `run/out/devin.budget.md`)
- TS-dev: one judge (bench-judge-v1). Use it to select only on a margin of at least 3 cases; anything closer is a tie and
  the incumbent (A0, pool-verify-v1) stays; if several arms pass a gate, the cheaper one wins (S0, 2026-11-11; this
  replaced "the simpler arm wins"). Dev numbers are reported as unverified.
- Held-out: both judges, then Sunny checks by hand every match either judge reports, every case where they disagree, and
  every comment on a labelled file within ±10 lines of a labelled range (catches matches both judges missed).
- Before the held-out run, fix in writing: whether every labelled row of a case is a golden (the pilot has several rows per
  bug case and none for clean cases, `pilot/PILOT.md`), the scope rule for pre-cutoff and unclear fixes, golden severity
  (SZZ labels have none; the scorer drops Low), and comments per case reported beside precision.
- *(**Superseded** (Sunny, 2026-11-11, decision 076a): the claim names exactly the repos with at least one held-out case, with per-repo counts. Kept as written for the record:)* Claim it supports (devin): "On N held-out pull requests from twenty and medusa whose changed lines a later merged fix
  repaired (labelled by SZZ, two labellers), tool T commented on the later-fixed defect for X of the N labelled bugs
  (matches proposed by two judges and confirmed by hand), with Y of its Z comments matching a label; comments on issues
  that no later fix repaired count against it, so Y/Z is a lower bound on its precision." Not supported: true precision,
  recall of all bugs, clean = bug-free, anything beyond these two repos and dates, comparison with ReviewBench numbers.

## Log
Money left is always: the latest console balance Sunny reports − every ledger charge after that reading − every CI run's
estimate after it. When Sunny reports a new console balance, it replaces this arithmetic; if it is lower than the
computed value, the difference is unexplained spend and the reserve absorbs it first.

| date | job | cap | spent | left (real) |
|---|---|---|---|---|
| 2026-11-08 | budget set | — | — | $23.39 |
| 2026-11-08 | 075 (branch `bench/hard-chunks-074`) | $1.50 | $0.49090 (ledger) | ≈ $22.90 (ledger estimate; confirm in the console) |
| 2026-11-09 | console reading: **$19.31** (expected ≈ $22.90): ≈ $3.59 off-ledger in ~22 h; old key revoked; freeze until the leak report | — | — | **$19.31** |
| 2026-11-09 | CI audit (no spend) | — | $0 since the $23.39 reading (0 Action runs after 2026-11-01) | **$22.90** = $23.39 (Sunny's console reading) − $0.49090 (075, ledger) − $0 CI |
| 2026-11-09 | billing-lag finding: the $23.39 reading predates 074's charge ($3.36463); expected 23.39 − 3.36463 − 0.49090 = $19.53 vs real $19.31 ($0.22 unexplained). Freeze until the console confirms | — | — | **$19.31** |
| 2026-11-09 | local-ledger audit (codex): 72 files; evaluation copy deduplicated; $0 additional non-test spend demonstrated; $19.40 off-ledger / $12.7–$14.2 after CI remains unexplained | — | $0 (audit; no calls) | **$19.31** |
| 2026-11-11 | S0 rulings and decision 076: new split ($18.31 usable: S1 0.45, R1 4.15, L1 0.40, L2 0.80, L4 0.10, R2 4.15, H1 3.15, H2 0.40, reserve 3.00, unallocated 1.71; L3 step 2 cut); freeze stays | — | $0 | **$19.31** |
| 2026-11-11 | caps ruling (076a): R1 $4.68, unallocated $1.18; rolling batch rule; R2/H1 recomputed in 077 from R1's measured costs; judge-only env caps; L4 concurrency 1 | — | $0 | **$19.31** |
| 2026-11-11 | 076b: R1/R2 judging inside the job cap; re-trigger slots; CodeRabbit rate check; canary ≤ $0.40 from the reserve; adopted-arm cost reporting | — | $0 | **$19.31** |
| 2026-11-12 | 076c: caps procedures (job-start file, one paid process at a time, L2 three-way verdict); protocol, premortem, team process ruled | — | $0 | **$19.31** |
| 2026-11-13 | balance correction (Sunny): the 2026-11-09 console reading was **$19.13**, not $19.31 (typo). Usable $18.13; unallocated $1.18 → $1.00; billing-lag unexplained $0.22 → $0.40; `.env` hard stop 63.33547 → 63.15547; job caps unchanged (decision 076c correction) | — | $0 | **$19.13** |
| 2026-11-13 | spend freeze lifted by Sunny without the console check, after 076d and its merges (`4b99fb4`); guard: S1 console ÷ ledger ≥ 2 h after S1, above 1.08 → stop and tell Sunny | — | $0 | **$19.13** |
