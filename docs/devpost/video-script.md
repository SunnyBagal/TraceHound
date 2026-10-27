# Video script (≤ 2:50)

Devpost rules for the video: under 3 minutes, public on YouTube, shows the project working, no
third-party trademarks. **No competitor names or logos on screen or in the voice-over.** Target
length 2:50, leaving 10 seconds of margin. The voice-over is about 400 words at roughly 150 words
a minute. Numbers come from the brain's `submission/numbers.md` (27 Oct) only. Shoot on 28 Oct,
after the seeded-PR run (job seed-01), so every review on screen comes from the product config:
pool-verify-v1 on Nemotron 3.5 Super (`nvidia/Nemotron-3.5-Super-VL`) at `review-freeze-2`
(`0aeef06`).

**Before shooting:**

- Show only reviews from the current config. The older reviews on the demo repo came from earlier
  generators on Nemotron Nano. Don't show them, and don't quote their old counts. Demo PR #2 under
  3.5 posted no findings (24 Oct); if it appears, say so. Demo PR #6 is never merged.
- Shots 2 and 3 need a seeded PR with a comment on its seeded line: [[TBD-SEEDED]]. If none has
  one, rewrite shot 2's voice-over to say what the review did find.
- `/benchmark` shows other reviewers' names in its tables. Don't film it as is: film the title
  card with TraceHound's own numbers (shot 6), or crop to TraceHound's rows.
- The graph canvas shows technology logos (`viewer/public/icons/`). It isn't in this script.
- Marks (decided by chat, 27 Oct): the NVIDIA and Nebius names may appear where their own UI or
  our model id shows them (a model id in a review body, a Token Factory region URL in code). No
  logos as decoration. GitHub's UI may appear.
- Shot 6's "plan and freeze tag committed first" holds for the product run: `review-freeze-2` was
  tagged on 23 Oct at 18:11 IST and decision 069's plan was pushed at 13:38:03Z (19:08 IST), both
  before the first Cal.com 3.5 call (13:38:51Z).

| # | time | what's on screen | voice-over |
|---|---|---|---|
| 1 | 0:00–0:10 | Title card: "TraceHound: pull-request review on NVIDIA Nemotron, via Nebius Token Factory". Repo URL underneath. | "TraceHound is an open-source GitHub Action that reviews pull requests with NVIDIA Nemotron on Nebius Token Factory." |
| 2 | 0:10–0:40 | [[TBD-SEEDED]] GitHub, demo repo `SunnyBagal/tracehound-demo`, a seeded PR reviewed by the current config. Scroll the review: one line comment on the seeded line; its suggestion block with **Commit suggestion**; the review body naming the pipeline and the model id `nvidia/Nemotron-3.5-Super-VL`, the "model-generated, unverified" label, and the **Files you didn't edit that depend on this change** section if the PR has one. | "Here's a pull request with a one-line bug planted in it. TraceHound posted one review. The comment sits on the changed line, with a fix GitHub can commit in one click. Every comment says it's model-generated and unverified. Below it, files this pull request didn't touch but depends on: that check is deterministic, no model." |
| 3 | 0:40–0:55 | [[TBD-SEEDED]] Dashboard `https://tracehound-tau.vercel.app/reviews`: the same PR as bug cards, with the fix diff open. | "The dashboard reads the same reviews straight from GitHub: bug cards, suggested fixes, and which reviewer found each one." |
| 4 | 0:55–1:25 | Pipeline diagram (README's mermaid chart, rendered): PR → diff-only reviewer and context reviewer in parallel → pool → context verifier → one review. A side lane: cross-file contracts, no model. | "Two Nemotron reviewers run in parallel. One reads only the diff. The other also reads the code around it and every place that uses a changed name. We pool their findings, then a Nemotron verifier reads each one in context and keeps or drops it. Only what survives is posted." |
| 5 | 1:25–1:50 | Split screen: the line in the review body that names the pipeline and model, and `packages/analyzer/src/llm/client.ts` lines 11–25 (the 3.5 id routed to us-north1, `baseUrlFor`). Text overlay: "3.5 Super: reviewers + verifier · 3 Super: fixes · reasoning on · budget caps + ledger · review-freeze-2". | "Both reviewers and the verifier run Nemotron 3.5 Super from Token Factory's us-north1 region, with reasoning on. Suggested fixes run on Nemotron 3 Super. Every call goes through one client with a response cache, hard budget caps and a spend ledger. If a chunk comes back unusable, the review says it's partial instead of failing." |
| 6 | 1:50–2:15 | Title card, TraceHound's numbers only. "Blind test, 10 Cal.com PRs (n = 23): P 63.2% · R 52.2% · F 57.1% (second judge 58.5%). Statistically tied with 4 of 5 commercial reviewers, ahead of 1 (only 10 PRs)." "All 50 PRs (n = 97): F 52.2% (55.4%); 3rd of 6 as a point estimate." "ReviewBench test runs (25 PRs, one round, ReviewBench's own judge): grounded F1 12.2. Not a leaderboard submission." "Seeded demo: [[TBD-SEEDED]]." Small text: "Compared with five commercial reviewers' recorded reviews. Tables, intervals and limits: docs/bench/results.md". | "We tested it blind, on ten pull requests whose answers we never read while building it, with the plan and the freeze tag committed first. F fifty-seven percent: statistically tied with four of five commercial reviewers, and ahead of one, on only ten PRs. Across all fifty: behind the leading reviewer, statistically tied with the next two, ahead of the last two." |
| 7 | 2:15–2:33 | The levers table from `docs/bench/results.md` §6 (it names no other reviewer), then the held-out table from the README (graph on vs off). Overlay: "Every loss is published." | "Every loss is published. Voting across runs lost. An evidence-quoting verifier lost. On ReviewBench test runs, 3.5 lost to the older 3 Super. And the code graph we started with didn't help our repair agent, so we said so." |
| 8 | 2:33–2:45 | The YAML block below, full screen, plus "Settings → Secrets → `NEBIUS_API_KEY`". | "To install: add your Token Factory key as a secret and save this one file. It's MIT licensed." |
| 9 | 2:45–2:50 | End card: `github.com/SunnyBagal/TraceHound` · `tracehound-tau.vercel.app` · MIT. | "TraceHound." |

## Install block for shot 8

The review job from `docs/action/example-workflow.yml`, without the graph-history job, pinned to
`0aeef06` (tag `review-freeze-2`), with the product model set explicitly, as in the README.

```yaml
name: TraceHound review
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
permissions: {}
jobs:
  review:
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          persist-credentials: false
      - uses: SunnyBagal/TraceHound/.github/actions/tracehound-review@0aeef06fa8742cc8a36581c3894e554b8748c965 # review-freeze-2
        with:
          nebius-api-key: ${{ secrets.NEBIUS_API_KEY }}
          model: 'nvidia/Nemotron-3.5-Super-VL'
```

## Timing check

| shots | seconds |
|---|---:|
| 1 | 10 |
| 2 | 30 |
| 3 | 15 |
| 4 | 30 |
| 5 | 25 |
| 6 | 25 |
| 7 | 18 |
| 8 | 12 |
| 9 | 5 |
| **total** | **170 (2:50)** |
