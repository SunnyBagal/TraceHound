# What changed since 26 August

Devpost asks an existing project to show it was significantly updated after 26 August 2026, and to
explain how. This page uses only the git history of `SunnyBagal/TraceHound` and
`docs/decisions.md`.

## What the repository shows

- **The first commit is 2026-09-30 02:34 IST** (`372fc45`, "chore: bootstrap pnpm workspace").
  Nothing in this repository is dated before 26 August.
- **30 September has 76 commits** (02:34 to 23:37 IST). Decisions 001–031 were all committed
  that day, among them the analyzer's extractors and grouping, the snapshot format, the viewer,
  the Nemotron naming pass, the spending guardrails, the Sandboxes plan (022), the agent tools
  (025), the repair harness (026) and the repair agent loop (029, 030).
- **Up to 23 October:** 386 commits on `main` and 57 pull requests (#1 on 30 Sep to #57 on 23 Oct;
  #42 closed, #54 open).
- `docs/reviewer-plan.md` (14 Oct) says a "what changed" summary is needed "because the repo
  predates the hackathon". The git history starts after 26 August; before that there was only the
  idea and a written spec, with no code (below).

## Before 26 August

Before 26 August there was no code. TraceHound started as an idea called FixFlow: a Devin-style agent that takes a GitHub issue and writes the patch, which I picked from a coding-agent project in the 100xDevs AI course. In August I rewrote it as a spec, "FixFlow V2": instead of another issue-to-patch agent, an evidence-backed component graph of a TypeScript repo, with a repair agent working on top of it. That spec was a document, not code, and it isn't public. Nothing from FixFlow was carried over as code.

The 30 September commits were written that day, not brought in from somewhere else. I created the empty repository on 29 September and built from the V2 spec with Claude Code agents, several sessions in parallel, which is how one day ended up with 76 commits. Decisions 001–031 are the spec's design choices, logged one by one as each was built.

## After 26 August, from git and the decisions log

Dates are commit dates on `main` (IST); a PR can merge a day after the decision it carries was
first committed. Decision numbers point to `docs/decisions.md`; PR numbers to
`SunnyBagal/TraceHound`.

| dates | what was built | decisions / PRs |
|---|---|---|
| 30 Sep | Analyzer: ts-morph extractors (imports, HTTP routes, Redis, Prisma, env), responsibility-based grouping, evidence on every edge, confidence labels, snapshots keyed by commit + analyzer version. Optional Nemotron Nano naming pass from extracted facts only. Spend guardrails (budget caps, response cache, ledger). Static Next.js viewer with React Flow + ELK. First Nebius feedback. | 001–031; #1, #2 |
| 1–4 Oct | Docker as the sandbox of record after Nebius Sandboxes proved unavailable on the account. Change sets (declaration-level diffs). Recall as a second repo. BullMQ queues, including through dependency injection. Per-test regression gate. Seeded dev tasks, the evaluation runner, agent-v5/v6. The reproduce stage (one agent-written failing test, checked in a fresh sandbox). | 032–048; #3–#12 |
| 5–6 Oct | Held-out evaluation of the repair agent, pre-registered: 160 counted runs. **The graph did not help** (resolved, graph on vs off: Nano 11 vs 13 of 40, Super 28 vs 26 of 40). Finder phases 1 and 2a (graph rules that emit hypotheses, no model). | 049–052; #13–#19 |
| 7 Oct | Landing page; the graph moves to `/graph`. | #20 |
| 13–14 Oct | Disclosure of who saw Recall's real bugs. **Turn to pull-request review:** the benchmark (golden comments, 5 repos × 10 PRs; Cal.com held out as the blind test set), our scorer with an LLM judge, validated on five recorded commercial reviewers. | 053, 054; #21, #22 |
| 15–17 Oct | Reviewer stages, one decision each: diff-only reviewer (055), confidence verifier (056, no gain), context reviewer (057), context verifier (058, loss), **pool-verify-v1 adopted** (059). Second judge (060). The GitHub Action (#25, #28, #30) and TraceHound reviewing its own PRs (#32). The Cal.com plan pre-registered (061), tag `review-freeze-1`, then the blind run (062). | 055–062; #23–#37 |
| 18–20 Oct | One-click fix suggestions (#38, #40). Graph history on a `tracehound-data` branch (#43). The `/reviews` dashboard (#44). A deterministic gate (#45). Cross-file contracts (#47). Maintainer-feedback learning, off by default (#49). The ReviewBench agent image (#50, #51). Results page (063), two published losses (064 vote, 065 evidence gate), an independent audit (#41) and the wording fixes it led to (066). | 063–066; #38–#52 |
| 21–23 Oct | Contracts in the Action (#53). Per-model routing for Nemotron 3.5 to us-north1 (#55). Nemotron 3.5 Super on 2 dev runs, adopted (067). 3.5 as the Action's default, with partial reviews when a chunk fails (068). Tag `review-freeze-2` → `0aeef06`. | 067, 068; #53–#57 |

## In one paragraph (for the Devpost field)

Before 26 August, TraceHound was only an idea and, from August, a written spec (FixFlow V2); there was no code. Everything in the
`SunnyBagal/TraceHound` repository was built after 26 August: its history starts on 30 September
2026, with 386 commits and 57 pull requests by 23 October. It began as an evidence-backed component
graph for TypeScript repos with a repair agent on Nemotron. A pre-registered evaluation showed the
graph did not help that agent (decision 050), and from 14 October the project became a
pull-request reviewer: a GitHub Action running two Nemotron reviewers and a Nemotron verifier,
cross-file contract checks, suggested fixes, a public benchmark run blind on 10 pull requests, and a dashboard. 68
decisions, each with the alternative we rejected, are in `docs/decisions.md`.
