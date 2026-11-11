# Track B scoring policy: decision 076a (Sunny, 2026-11-11)

`policy-076a.json` is the `--policy` file for `score-testset.ts` and `handcheck-sheet.ts build`. The kit applies only the fields it reads (`kit.ts` `POLICY_CHOICES`) and refuses unknown ones, so the 076a protocol rulings without a kit consumer are listed here with where they apply. Source: TraceHound `docs/decisions.md` 076a, "Protocol §13", items 1–8. Item 9 (unmappable targets, within-file ranges, caps procedures) is pending and is not in this policy.

| 076a §13 item | ruling | where it applies |
|---|---|---|
| 1 | significance level 0.05, two-sided | write-up (W1) and gate readings: `score-testset.ts` prints the exact two-sided p; it labels nothing significant |
| 2 | equal measured cost: A0 first; between A1 and A2, fewer comments per case | arm selection in E1 and decision 077 (not the kit) |
| 3 | a failed TraceHound case gets one rerun; the rerun's result counts; two failures is a miss; a case unstarted at the window's end is a miss | `official_attempt: last`, `failed_case: miss`, `unstarted_case: miss` |
| 4 | a tool with no review after its re-trigger leaves that case out of that tool's paired comparison; n is reported | `no_review_in_pairs: exclude` (the paired n is printed per pair) |
| 5 | the hand-check sheet hides the judges' verdicts | `sheet_judge_cues: hidden` |
| 6 | the re-trigger is 24 h after that PR's own trigger | trigger schedule (`open-prs.ts --trigger`, H1 operator); not the kit |
| 7 | order: sheet hashed, unblind, score files hashed and committed, then the firewall lifts | H2 / W1 procedure; the kit writes the hashes (`hashes.json`, `build.json`, collection hashes, `policySha256` in the score output) |
| 8 | the claim names exactly the repos with at least one held-out case, with per-repo counts | claim text (W1, filled by codex); not the kit |
