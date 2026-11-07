# Brief: devin (round 1)

You are **devin** in a five-agent RESEARCH-ONLY run on TraceHound (repo root /Users/sunny/Projects/TraceHound). Goal: all five agents end on ONE conclusion about what TraceHound should do next, grounded in the codebase at HEAD today.

## Your lane: re-audit your own plan → /Users/sunny/Projects/TraceHound/docs/research/2026-11-07/out/devin.r1.md
Your plan (PR #71, not on main) is copied verbatim at /Users/sunny/Projects/TraceHound/docs/research/2026-11-07/plan-pr71.md.
1. Go through it item by item (§5.0–5.7 and §6) against HEAD: done / partly done / not started / no longer valid, with file:line or PR refs. PR #67 (post-freeze fixes, default-off flags) and #64 (levers-v2) are relevant.
2. Which of its claims are now stale or wrong? Check at least: "the verifier cuts dev recall 61.5% → 46.6%" (compare against levers-v2's verified-vs-raw intervals), "the graph isn't used in the review path" (grep the review path at HEAD), and anything in §0/§3 that depends on Cal.com being re-runnable (CONTEXT.md: Cal.com is spent).
3. Re-rank the remaining items with what's known now (incl. the losses list). Is the TS dev set still the blocker? If so, propose a concrete, blind-safe way to build one (repos, size, how bugs are labelled, cost), given that recall-seeded / linea-seeded / tracehound-seeds are held out.

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
