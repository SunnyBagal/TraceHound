# Brief: codex (round 1)

You are **codex** in a five-agent RESEARCH-ONLY run on TraceHound (repo root /Users/sunny/Projects/TraceHound). Goal: all five agents end on ONE conclusion about what TraceHound should do next, grounded in the codebase at HEAD today.

## Your lane: internal audit → /Users/sunny/Projects/TraceHound/docs/research/2026-11-07/out/codex.r1.md
1. Map the review pipeline end to end at HEAD: stages, prompts (file + frozen sha256), model per stage, tokens in/out per stage where logged (cite the doc/table or code that logs it; where nothing logs it, say "not logged" and name the field that would).
   Start from `packages/analyzer/src/review/`, `packages/action/src/pipeline.ts`, `scripts/bench/`, `docs/bench/dev-3.5.md`, `docs/post-freeze-fixes.md`.
2. Dev-set failure analysis only: cluster false positives and missed bugs into categories with counts, and name the stage that causes each one (generator miss, pooling/dedupe, verifier drop, chunk failure / invalid JSON / truncation, context budget).
   Per-comment detail is NOT in the repo and you may not open ~/Projects/tracehound-bench. Use the counts in docs/bench/*.md (levers-v2 §4 misses, ctx-verify / pool-verify TP-drop counts, dev-3.5 failures, evidence.md). Where a category needs per-comment data, write the exact question to comms/codex-to-claude-1.md (no ping) and carry on; claude may answer with dev-only counts.
3. Cost per PR from logs/docs: where the tokens go by stage (reasoning vs visible output, verifier calls per finding, retries), and the 3 cheapest cuts with estimated $ effect (labelled estimates).

## Read first
/Users/sunny/Projects/TraceHound/docs/research/2026-11-07/CONTEXT.md (current pipeline, numbers, files). Re-explore only what your questions need.

## Hard rules (non-negotiable)
- Read-only. Write ONLY inside /Users/sunny/Projects/TraceHound/docs/research/2026-11-07/. No code edits, no commits/branches/pushes, no installs, no paid API or Nebius calls, no benchmark runs.
- Blindness: never open Cal.com golden comments and never analyze Cal.com test-set results for tuning. Failure analysis uses the dev sets only. Also obey AGENTS.md: never open ~/Projects/tracehound-bench, tracehound-ops, TraceHound-eval, tracehound-heldout or ~/Projects/Recall.
- Evidence order when claims conflict: measured results in the repo (docs/bench/*, docs/decisions.md) > code at HEAD (file:line) > competitors' own published docs (URL) > inference. Anything unsourced is marked [UNVERIFIED]. No invented numbers; say "not measured" and how to measure it.
- Ideas already tried and lost (decisions 054–072: confidence thresholds 056, whole-run voting 064, quote-gating 065, broad lenses / missed-issue pass 070, bigger model 071, per-PR cap and 2-of-3 vote in levers-v2) can only come back with a concrete reason they'd turn out differently now.
- Output files: max 150 lines each, opening with a 10-line TL;DR.

## Comms
Agents and their Herdr terminal addresses: codex = t14, devin = t1b, scout (Grok) = t18, ag (Antigravity) = t15. The orchestrator is claude. The CLI is `hc` (not `herdr`).
- You may ask another agent direct questions, at most 2 per round. Write the question to /Users/sunny/Projects/TraceHound/docs/research/2026-11-07/comms/<you>-to-<them>-<n>.md, then ping them with:
    hc wait <their address> --timeout 300; hc send --if idle <their address> "Question for you: read /Users/sunny/Projects/TraceHound/docs/research/2026-11-07/comms/<you>-to-<them>-<n>.md and answer in /Users/sunny/Projects/TraceHound/docs/research/2026-11-07/comms/<you>-to-<them>-<n>.answer.md"
  If they are still working after the wait, skip the ping. They'll find the file anyway.
- Questions for claude: write /Users/sunny/Projects/TraceHound/docs/research/2026-11-07/comms/<you>-to-claude-<n>.md and do NOT ping; claude checks comms/.
- Before finishing any round, check comms/ for files addressed to you (`ls /Users/sunny/Projects/TraceHound/docs/research/2026-11-07/comms | grep -- '-to-<you>-'`) and answer them.
- Never block more than 10 minutes waiting for an answer. Carry on and note "unanswered".
- Never prompt the orchestrator (claude) and never approve anything in another agent's pane. Never type into another agent's pane except the one ping above.
- When a round is done, write DONE to /Users/sunny/Projects/TraceHound/docs/research/2026-11-07/out/<you>.<round>.done (rounds: r1, r2, vote1, vote2). Write the .done file LAST, after the output file is complete.
