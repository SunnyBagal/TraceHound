# Track B scoring policy: decisions 076a and 076b (Sunny, 2026-11-11)

`policy.076a.json` is the `--policy` file for `score-testset.ts` and `handcheck-sheet.ts build`. The kit applies only the fields it reads (`kit.ts` `POLICY_CHOICES`) and refuses unknown ones, so the 076a protocol rulings without a kit consumer are listed here with where they apply. Source: TraceHound `docs/decisions.md` 076a, "Protocol §13", items 1–8. Item 9 (unmappable targets, within-file ranges, caps procedures) is pending and is not in this policy. Decision 076b items 1 and 4 are added below (same approval line in the JSON); the file keeps its name because `docs/specs/S1.md:17,57` and `docs/specs/B2.md` §5.1 name it.

| 076a §13 item | ruling | where it applies |
|---|---|---|
| 1 | significance level 0.05, two-sided | write-up (W1) and gate readings: `score-testset.ts` prints the exact two-sided p; it labels nothing significant |
| 2 | equal measured cost: A0 first; between A1 and A2, fewer comments per case | arm selection in E1 and decision 077 (not the kit) |
| 3 | a failed TraceHound case gets one rerun; the rerun's result counts; two failures is a miss; a case unstarted at the window's end is a miss | `official_attempt: last`, `failed_case: miss`, `unstarted_case: miss` |
| 4 | a tool with no review after its re-trigger leaves that case out of that tool's paired comparison; n is reported | `no_review_in_pairs: exclude` (the paired n is printed per pair) |
| 5 | the hand-check sheet hides the judges' verdicts | `sheet_judge_cues: hidden` |
| 6 | the re-trigger is 24 h after that PR's own trigger. **Amended by 076b item 2:** first triggers always go before re-triggers; a re-trigger takes the first free hourly slot at or after 24 h from that PR's own trigger, in PR order | trigger schedule (`open-prs.ts --trigger`, H1 operator); not the kit |
| 7 | order: sheet hashed, unblind, score files hashed and committed, then the firewall lifts | H2 / W1 procedure; the kit writes the hashes (`hashes.json`, `build.json`, collection hashes, `policySha256` in the score output) |
| 8 | the claim names exactly the repos with at least one held-out case, with per-repo counts | claim text (W1, filled by codex); not the kit |

| 076b item | ruling | where it applies |
|---|---|---|
| 1 | R1's and R2's post-run judging runs inside the job's cap: `TRACEHOUND_BUDGET_TOTAL_USD` = ledger at job start + job cap; `TRACEHOUND_BUDGET_RUN_USD` = job cap − runner spend; `--concurrency 1` | the `bench score` step of R1 (`docs/specs/R1.md` §3 step 3) and R2 (`docs/specs/R2.md` §3 step 2); not the kit. The shell values win over the workspace `.env` (`packages/analyzer/src/bin.ts:23-24` loads it with `process.loadEnvFile`, which does not overwrite a variable already set) |
| 4 | canary: runs only after two held-out cases in a row fail with a provider or transport error; at most 3 tries, at least 30 minutes apart; at most $0.40 in total, from the reserve; if all 3 fail, stop and tell Sunny | H1 window operator (`docs/runbooks/H1-window.md` on TraceHound main, `b443a1a`); not the kit |
