# Budget (2026-11-09)

**Money left: $19.31** (the owner's console reading, 2026-11-09; it was $23.39 on 2026-11-08). That is all the money the
project has. Every model call from here on has a line below, or it does not happen.

**FREEZE: no paid job runs until Sunny confirms in the Nebius console** (hourly usage, 2026-11-08 → 09): about $3.36
at 09:00–10:00 UTC on 8 Nov, nothing overnight, no running sandboxes. Sunny revoked the old API key on 2026-11-09; the
new key is only in local `.env`.

**Likely explanation: billing lag, not a leak.** Job 074 ran 2026-11-08T08:43:04Z–09:39:08Z and cost **$3.36463**
(ledger, 147 calls; `docs/bench/hard-chunks.md:52`). Sunny's $23.39 reading came about 1 minute after 074 finished
(owner), so it did not yet include 074. Then 23.39 − 3.36463 (074) − 0.49090 (075) = **$19.53** expected vs **$19.31**
real: $0.22 unexplained (≈ 6% of the two jobs' $3.86, within a price-estimate error; not proven). codex found no
Nebius-key-capable CI run in the 48 h (`run/out/codex.leak.md` § 48 h) and grok no committed key in 53 public repos
(`run/out/grok.secrets.md`). The "≈ $3.59 off-ledger overnight" in the log below is superseded by this.

## Rules
1. **No experiment without a line in this file** (job, cap, status). A job's cap is enforced in its own runner as well.
2. **Replay the response cache unless reliability is the thing under test.** Reliability tests (failure rates, retries,
   parsing) bypass the cache for the requests under test (standing rule, decisions.md top, from 073a).
3. **Global hard stop:** `TRACEHOUND_BUDGET_TOTAL_USD = 63.33547` in `.env` (gitignored) = ledger total when set
   ($45.02547 on 2026-11-09) + $19.31 − $1.00 safety margin (it was 66.92462 on 2026-11-08). Every client call is refused
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

## The split of $19.31 (2026-11-09)
Estimates use the costs above on 40-PR sets, plus 25% for larger TypeScript diffs (an assumption; TS PRs are not measured).

| line | what | cap | basis | status |
|---|---|---|---|---|
| TS-dev run 1 | pool-verify-v1, fresh, 40 PRs, judge v1 | **$3.80** | 40 × ($0.0747 + $0.0012) = $3.04, + 25% | not started (needs the TS dev set) |
| TS-dev run 2 | same, second draw | **$3.80** | same | not started |
| held-out run | pool-verify-v1, fresh, 40 PRs, judges v1 + x1 | **$3.80** | 40 × ($0.0747 + $0.0014) = $3.04, + 25% | not started (needs the held-out set) |
| held-out scoring | every row (ours + any tool reviews Sunny obtains) × 40 PRs × v1 + x1 | **$0.60** | e.g. 8 rows × 40 × $0.0014 = $0.45, + 30% | not started |
| reserve | reruns after an infrastructure failure, a console-check correction | **$3.00** | owner, 2026-11-09 (was $4) | held |
| unallocated | needs a new line here before use | **$3.31** | $19.31 − $1.00 margin − the lines above | held |
| CI review runs | manual Action runs (label or dispatch) in any of the four repos | **$0.00** | none planned; each run needs a line first (≈ $0.075/PR + fixes) | none since 2026-11-01 |
| safety margin | never spent (it is outside the global hard stop) | $1.00 | rule 3 | — |
| **total** | | **$19.31** | | |

Done before this split: 075 ($0.49090, ledger; INCONCLUSIVE). The $23.39 split of 2026-11-08 is in git history.

The external review tools (Augment, Cursor, Greptile, CodeRabbit, Copilot) cost no Nebius money to score once their
reviews exist, but getting their reviews of new PRs is outside this budget.

## Scoring scheme for the new sets (devin, `run/out/devin.budget.md`)
- TS-dev: one judge (bench-judge-v1). Use it to select only on a margin of at least 3 cases; anything closer is a tie and
  the simpler arm wins. Dev numbers are reported as unverified.
- Held-out: both judges, then Sunny checks by hand every match either judge reports, every case where they disagree, and
  every comment on a labelled file within ±10 lines of a labelled range (catches matches both judges missed).
- Before the held-out run, fix in writing: whether every labelled row of a case is a golden (the pilot has several rows per
  bug case and none for clean cases, `pilot/PILOT.md`), the scope rule for pre-cutoff and unclear fixes, golden severity
  (SZZ labels have none; the scorer drops Low), and comments per case reported beside precision.
- Claim it supports (devin): "On N held-out pull requests from twenty and medusa whose changed lines a later merged fix
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
