You are a builder on TraceHound, an open-source AI PR reviewer. Rules:

Work only in ~/Projects/TraceHound-claude2. Read CLAUDE.md and AGENTS.md first.
Never open SunnyBagal/linea-seeded, SunnyBagal/recall-seeded, SunnyBagal/tracehound-seeds, or ReviewBench's golden/.
Make no Nebius or model API calls. There's no .env here, on purpose.
Never edit ~/Projects/tracehound-ops/.
Open PRs as drafts. Never merge, never force-push.
If a step's check fails, STOP and report. End with: the PR number, the head sha, one line per commit, and test counts.

This brief was written for a tool called relay. You are not running under relay:

ignore anything about caffeinate, relay.ts or lanes.json;
your folder is ~/Projects/TraceHound-claude2, not ~/Projects/TraceHound.

Everything else applies as written.

Decision number: 066. Nebius cap: $0.

Why

The cc-01 audit (#41, docs/bench/audit-cc01.md) found no wrong numbers, but it did find five wording overclaims in docs/bench/results.md. Since then, 064 and 065 have both lost on dev, and five dev runs showed a spread of 12 F points.

The public results must say all of this before anything else is built on them. The claim we publish is: "on 10 blind PRs, statistically tied with Greptile and Cursor, ahead of CodeRabbit; 4th of 6 across all 50; every loss published". Never "3rd of 6" as a ranking.

Step 0 (if any check fails, STOP AND REPORT)
git fetch origin; git status --porcelain prints nothing. If the checkout isn't on main, run git switch main, then git merge --ff-only origin/main. HEAD must equal origin/main.
Main contains the #48 merge. grep -c '^## 065' docs/decisions.md prints 1, and grep -c '^## 066' prints 0.
docs/bench/audit-cc01.md exists, which means #41 is merged. If it doesn't, STOP.
Don't edit anything under ~/Projects/tracehound-ops/. Don't open SunnyBagal/linea-seeded, recall-seeded or tracehound-seeds.
Steps (one commit per step; pnpm test and pnpm typecheck green on each; messages area: what changed)
Create branch docs/066-results. Save this brief verbatim as docs/prompts/066-results-docs.md.
Apply the audit's five fixes in docs/bench/results.md, and in test-results.md and decisions.md wherever the same wording appears. In decisions.md, fix it with a dated note added under the entry; never rewrite the old text.
"pre-registered before any TraceHound Cal.com result existed".
"The headline is run 1 of three, all from e7309a5, whose frozen paths are identical to tag review-freeze-1" (replacing "ran once from frozen code").
"The judge is the same model (Nemotron 3 Super) as the reviewer and the verifier." Remove "(060: the gap is small)".
Replace "changes nothing" with what x1 shows: it reverses prediction (a) in runs 1 and 3, and drops run 3 to 5th.
Add the audit's interval statement: "Apart from CodeRabbit, every gap to the tools is within noise (audit-cc01 §3)".
Add an "All 50 PRs" section to results.md, under both judges. Use two TraceHound rows, declared as such:
(i) dev run 1 + Cal.com run 1, the audit's table (v1 41.2, x1 48.1);
(ii) dev mean of the 5 runs (TP and FP averaged over runs 1, 2r, 4, 5, 6) + Cal.com run 1.
The tools have one row each. Recompute everything from counts already in the repo (docs/bench/vote.md, evidence.md, test-results.md, scorer-validation.md). Show TP, FP, P, R and F, and give the rank for each TraceHound row. Don't pick the better row for the headline. Row (i) stays the scorer-of-record line, because it was the first and the pre-registered one, and row (ii) is labelled "variance check".
Add a "Precision levers tried on dev" section with one table: 056 verify-v1, 057 review-ctx-v1, 058 verify-ctx-v1, 059 pool-verify-v1 (adopted), 064 vote, 065 evidence verifier + gate.
Columns: decision, idea, bar, result (F/P on dev; 5-run means where they exist), verdict.
Then two sentences: "The run-to-run spread of the adopted reviewer (35.6–48.0 F over 5 runs at temperature 0) is larger than every effect we tried to measure. NVIDIA recommends temperature 1.0 for this model; all our runs used 0, which is a limit, not a tuned choice."
README's benchmark section (README.md, ## PR reviewer benchmark): rewrite the headline to the claim above, link the all-50 table and the levers table, and keep every number as it is in results.md. Add the source of the tools' numbers in one sentence: "Tool numbers come from their recorded reviews in the public benchmark dataset, scored with our judge; we did not run the tools."
Append decision 066 to docs/decisions.md: docs only, no new results.
Push. Open the PR to main as a draft, titled 066: results wording fixes, all-50 table, levers tried (decision 066). Wait for CI. Make one fix attempt if it's red; STOP if it's red twice. Never merge.
Rules
Cal.com is blind. Use only counts already in the repo. Don't open anything under ~/Projects/tracehound-bench/test/.
May touch: docs/bench/results.md, docs/bench/test-results.md (wording only), docs/decisions.md (append plus dated notes), README.md (benchmark section only), docs/prompts/066-results-docs.md, one line in CLAUDE.md, runs/.
Don't touch any code, viewer/, .github/, packages/, scripts/ or config/.
Change no number unless you're recomputing it from counts in the repo. If a recomputation disagrees with a published number, STOP AND REPORT both.
STOP AND REPORT (post it as a PR comment via a file under runs/, then make it your final message)
The step 0 results; the five fixes, each with file:line before and after; both all-50 tables with every count; the levers table; the README diff; anything you did that the brief didn't ask for.
