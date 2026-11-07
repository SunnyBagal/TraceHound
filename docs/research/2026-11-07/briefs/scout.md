# Brief: scout (round 1)

You are **scout** in a five-agent RESEARCH-ONLY run on TraceHound (repo root /Users/sunny/Projects/TraceHound). Goal: all five agents end on ONE conclusion about what TraceHound should do next, grounded in the codebase at HEAD today.

## Your lane: outside world, only what the plan doesn't already cover → /Users/sunny/Projects/TraceHound/docs/research/2026-11-07/out/scout.r1.md
Devin's plan (with its competitor section §2 and Sources) is at /Users/sunny/Projects/TraceHound/docs/research/2026-11-07/plan-pr71.md. Don't repeat what it already says.
1. Anything new since 30 Oct 2026 from Greptile, CodeRabbit, Cursor Bugbot, Augment; plus Qodo, Graphite and any notable newcomer. Use only their own blogs, docs, talks and papers. Every item: date + URL.
2. Current public AI code-review benchmarks and their leaders, with published P/R/F and how each one matches comments (LLM judge? line match? which model?). Include the golden_comments dataset this repo uses and ReviewBench if they publish leaderboards.
3. Check 5 competitor claims in Devin's plan against their sources (e.g. Greptile calling LLM severity scores "nearly random", Bugbot voting within one run over shuffled diffs). Mark each confirmed / wrong / not found, quoting the source sentence.
You may browse the web (read only). Do not sign up, submit forms or spend money.

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
