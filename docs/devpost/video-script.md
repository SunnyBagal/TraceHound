# Video script (≤ 2:50)

Devpost rules for the video: under 3 minutes, public on YouTube, shows the project working, no
third-party trademarks. **No competitor names or logos on screen or in the voice-over.** Target
length 2:50, leaving 10 seconds of margin. The voice-over is about 400 words at roughly 150 words
a minute. Shoot on 27–28 Oct, after the 26 Oct seeded test, so every review on screen comes from
`review-freeze-2`.

**Before shooting:**

- Use a demo PR reviewed on 26 Oct or later. The reviews on the demo repo's PRs #1–#5 date from
  17–18 Oct (Nano reviewers, before freeze-2). Don't show them, and don't quote their old counts.
- Shot 2's voice-over assumes the chosen PR has a comment on its seeded line. Pick one from
  [[SEEDED]] that does. If none does, rewrite the line to say what the review did find.
- `/benchmark` shows other reviewers' names in its tables. Don't film it as is: film a title card
  with TraceHound's own numbers (shot 6), or crop to TraceHound's rows.
- The graph canvas shows technology logos (`viewer/public/icons/`). It isn't in this script.
- [[SUNNY: confirm R14 allows the NVIDIA and Nebius names and marks (sponsors) and GitHub's UI on
  screen. If not, use the names as plain text and crop GitHub's header.]]

| # | time | on screen | voice-over |
|---|---|---|---|
| 1 | 0:00–0:10 | Title card: "TraceHound: pull-request review on NVIDIA Nemotron, via Nebius Token Factory". Repo URL underneath. | "TraceHound is an open-source GitHub Action that reviews pull requests with NVIDIA Nemotron on Nebius Token Factory." |
| 2 | 0:10–0:40 | GitHub, demo repo `SunnyBagal/tracehound-demo`, a fresh seeded PR. Scroll the review: one line comment on the seeded line; its suggestion block with **Commit suggestion**; the review body naming the pipeline and model, the "model-generated, unverified" label, and the **Files you didn't edit that depend on this change** section if the PR has one. | "Here's a pull request with a one-line bug planted in it. TraceHound posted one review. The comment sits on the changed line, with a fix GitHub can commit in one click. Every comment says it's model-generated and unverified. Below it, files this pull request didn't touch but depends on: that check is deterministic, no model." |
| 3 | 0:40–0:55 | Dashboard `https://tracehound-tau.vercel.app/reviews`: the same PR as bug cards, with the fix diff open. | "The dashboard reads the same reviews straight from GitHub: bug cards, suggested fixes, and which reviewer found each one." |
| 4 | 0:55–1:25 | Pipeline diagram (README's mermaid chart, rendered): PR → diff-only reviewer and context reviewer in parallel → pool → context verifier → one review. A side lane: cross-file contracts, no model. | "Two Nemotron reviewers run in parallel. One reads only the diff. The other also reads the code around it and every place that uses a changed name. We pool their findings, then a Nemotron verifier reads each one in context and keeps or drops it. Only what survives is posted." |
| 5 | 1:25–1:50 | Split screen: the line in the review body that names the pipeline and model, and `packages/analyzer/src/llm/client.ts` lines 11–25 (the 3.5 id routed to us-north1, `baseUrlFor`). Text overlay: "3.5 Super: reviewers + verifier · 3 Super: fixes · reasoning on · budget caps + ledger". | "Both reviewers and the verifier run Nemotron 3.5 Super from Token Factory's us-north1 region, with reasoning on. Suggested fixes run on Nemotron 3 Super. Every call goes through one client with a response cache, hard budget caps and a spend ledger. If a chunk comes back unusable, the review says it's partial instead of failing." |
| 6 | 1:50–2:15 | Title card, TraceHound's numbers only: blind Cal.com test [[CALCOM-V2]]; all 50 PRs [[ALL50-V2]]; ReviewBench [[RB-FINAL]]; seeded demo [[SEEDED]]. Small text: "Compared with five commercial reviewers. Tables, intervals and limits: docs/bench/results.md". | "We tested it blind, on ten pull requests whose answers we never read while building it, with the plan and the freeze tag committed first. [[SUNNY: true for the v2 run only if decision 069's plan and review-freeze-2 were committed before it; check on 26 Oct.]] [[CALCOM-V2: one sentence, e.g. the F score and how it compares, in 066's wording without names]]. Across all fifty, [[ALL50-V2: rank and F]]." |
| 7 | 2:15–2:30 | The levers table from `docs/bench/results.md` §6 (it names no other reviewer), then the held-out table from the README (graph on vs off). Overlay: "Every loss is published." | "Every loss is published. Voting across runs lost. An evidence-quoting verifier lost. And the code graph we started with didn't help our repair agent, so we said so." |
| 8 | 2:30–2:45 | The YAML block below, full screen, plus "Settings → Secrets → `NEBIUS_API_KEY`". | "To install: add your Token Factory key as a secret and save this one file. It's MIT licensed." |
| 9 | 2:45–2:50 | End card: `github.com/SunnyBagal/TraceHound` · `tracehound-tau.vercel.app` · MIT. | "TraceHound." |

## Install block for shot 8

The review job from `docs/action/example-workflow.yml`, without the graph-history job, pinned to
`review-freeze-2`. The `model` input is left at its default (`nvidia/Nemotron-3.5-Super-VL`).

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
| 7 | 15 |
| 8 | 15 |
| 9 | 5 |
| **total** | **170 (2:50)** |
