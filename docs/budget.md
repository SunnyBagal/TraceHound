# Budget (2026-11-08)

**Money left: $23.39** (the owner's reading of the real Nebius balance, 2026-11-08). That is all the money the project
has. Every model call from here on has a line below, or it does not happen.

## Rules
1. **No experiment without a line in this file** (job, cap, status). A job's cap is enforced in its own runner as well.
2. **Replay the response cache unless reliability is the thing under test.** Reliability tests (failure rates, retries,
   parsing) bypass the cache for the requests under test (standing rule, decisions.md top, from 073a).
3. **Global hard stop:** `TRACEHOUND_BUDGET_TOTAL_USD = 66.92462` in `.env` (gitignored) = ledger total when set
   ($44.53462, `.tracehound/spend.jsonl`, 16,255 entries) + $23.39 − $1.00 safety margin. Every client call is refused
   once the local ledger would pass it (`packages/analyzer/src/llm/budget.ts`). Scripts load `.env` only when
   `NEBIUS_API_KEY` is not already in the environment: if you export the key yourself, export this variable too.
4. **The local ledger does not see every charge** (next section). Calls from the GitHub Action, CI, other machines or the
   Nebius console are not in it, so they need their own line here and a console check.

## Ledger vs real balance (codex, `run/out/codex.budget.md`)
- Anchor: `docs/bench/reviewbench.md:284-286` gives a balance of **$43.52** (committed 2026-10-27; the reading's own time
  is not stated, but the ledger has no entries between 2026-10-24 and that commit, so the timing does not change the sum).
- Since then the real balance fell **$20.13** ($43.52 → $23.39) while the local ledger recorded **$4.09709** (241 entries).
- So **$16.03 of spend is not in the local ledger** (if both balances are the same credit pool). Likely sources, not
  verified: the GitHub Action's runs (their ledger lives in the CI runner's temp dir), and any use outside this machine.
- Check for Sunny: the Nebius console's charge for job 073r, 2026-11-07 20:08:39Z–20:38:31Z (three models), against the
  ledger's **$0.38780** (3.5 Super VL $0.37421, 3 Super $0.01112, Qwen $0.00247). Equal: the ledger's prices are right
  and the gap is calls made elsewhere. Higher: the prices are low by that ratio, so scale every estimate below by it.

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

## The split of $23.39
Estimates use the costs above on 40-PR sets, plus 25% for larger TypeScript diffs (an assumption; TS PRs are not measured).

| line | what | cap | basis | status |
|---|---|---|---|---|
| 075 | verify + one judge on 074's A/E findings, no reviewer calls | **$1.50** | 140 verifier + 63 judge reviews, expected $0.50 | **done: $0.49090, INCONCLUSIVE** (unspent $1.01 goes to unallocated) |
| TS-dev run 1 | pool-verify-v1, fresh, 40 PRs, judge v1 | **$3.80** | 40 × ($0.0747 + $0.0012) = $3.04, + 25% | not started (needs the TS dev set) |
| TS-dev run 2 | same, second draw | **$3.80** | same | not started |
| held-out run | pool-verify-v1, fresh, 40 PRs, judges v1 + x1 | **$3.80** | 40 × ($0.0747 + $0.0014) = $3.04, + 25% | not started (needs the held-out set) |
| held-out scoring | every row (ours + any tool reviews Sunny obtains) × 40 PRs × v1 + x1 | **$0.60** | e.g. 8 rows × 40 × $0.0014 = $0.45, + 30% | not started |
| reserve | reruns after an infrastructure failure, a console-check correction | **$4.00** | the rule: at least $4 | held |
| unallocated | needs a new line here before use | **$4.89** | $23.39 − $1.00 margin − the lines above | held |
| safety margin | never spent (it is outside the global hard stop) | $1.00 | rule 3 | — |
| **total** | | **$23.39** | | |

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
| date | job | cap | spent | left (real) |
|---|---|---|---|---|
| 2026-11-08 | budget set | — | — | $23.39 |
| 2026-11-08 | 075 (branch `bench/hard-chunks-074`) | $1.50 | $0.49090 (ledger) | ≈ $22.90 (ledger estimate; confirm in the console) |
