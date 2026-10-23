# Devpost write-up (draft)

Fields in the order Devpost asks for them. Paste each section's body into its field. Everything
in `[[…]]` is filled on 26–27 Oct; nothing else in this file needs new numbers.

**Placeholders and what fills each one**

- `[[RB-FINAL]]`: the ReviewBench final result for TraceHound's image, as recorded in its
  results doc on 26 Oct.
- `[[SEEDED]]`: the 26 Oct seeded test on the demo repo, run from `review-freeze-2` (`0aeef06`):
  how many seeded defects got a comment on the seeded file and line, and what the control PR got.
- `[[CALCOM-V2]]`: the v2 Cal.com run (decision 069): pool-verify-v1 on Nemotron 3.5 Super from
  `review-freeze-2`, P / R / F under bench-judge-v1 with bench-judge-x1 alongside, n.
- `[[ALL50-V2]]`: the all-50 table recomputed with the v2 Cal.com run: TraceHound's F and its
  rank of 6 under both judges.
- `[[SUNNY: …]]`: a question only Sunny can answer. Each one is also listed in `checklist.md`.

Rules this text follows: no other reviewer is named (say "five commercial reviewers" and link the
results doc); never "beats"; never "3rd of 6" as a ranking; 3.5 on dev is "2 dev runs", and the
second judge's interval includes 0.

---

## Project name

TraceHound

## Tagline (≤ 60 characters)

A PR reviewer on Nemotron that publishes its losses

(51 characters. Alternative, 47: "Evidence-first PR review on NVIDIA Nemotron")

## Inspiration

[[SUNNY: the personal reason, two or three sentences. What the repo can support: TraceHound
started as an evidence-backed component graph for TypeScript repos, with the rule that no edge is
drawn without a file, symbol and line range behind it. A pre-registered evaluation then showed the
graph did not help a repair agent (decision 050), and the project turned to pull-request review,
where the same rule applies: a review comment is a claim about code, so measure it.]]

We wanted a reviewer whose numbers anyone can check: pre-registered before the blind run, scored
by a judge whose prompt is pinned by hash, and published with every loss next to every win.

## What it does

TraceHound is an open-source GitHub Action that reviews pull requests with NVIDIA Nemotron on
Nebius Token Factory. Add one secret and one workflow file, and every same-repository pull request
gets one review:

- **Line comments** on the diff, each labelled model-generated and unverified.
- **A suggested fix** for each comment where Nemotron can propose one that passes our checks,
  shown as GitHub's native suggestion block with its **Commit suggestion** button.
- **Cross-file contracts**: a section listing files the pull request did *not* edit that depend
  on an export, route, queue, Redis key, environment variable or event it changed. This part is
  deterministic: no model, no network, no script from the pull request is run.
- **A hidden machine-readable footer** (pipeline, model, pool and kept counts, fix counts) that the
  dashboard reads.
- **Optional learning** (`learn: 'on'`, off by default): findings similar to comments maintainers
  rejected (a 👎, a thread resolved with no change near the comment, or a reply such as "false
  positive") are suppressed, and each suppression is recorded in the
  footer. It is deterministic and not measured by the benchmark.

The dashboard, https://tracehound-tau.vercel.app, has three parts: `/reviews` (the demo repo's
reviews as bug cards with fix diffs), `/benchmark` (the results tables; a test fails the build if
they differ from `docs/bench/results.md`), and the graph (the repo map the project started as).

**Results.** On 10 blind pull requests (the Cal.com repo of a public benchmark, 5 repos × 10 PRs),
compared with five commercial reviewers' recorded reviews (see the results doc):

[[SUNNY: decision 066's claim names three of the five reviewers, and the Devpost text must name
none. Default below replaces the names with descriptions; confirm, or choose another wording.]]

> On 10 blind PRs, statistically tied with the two reviewers just above and below it; run-1 F 58.3
> vs 36.7 for the lowest-scoring reviewer, but not a significant lead (the 95% interval includes 0;
> ahead in 96% of resamples). 4th of 6 across all 50 under both judges. Every loss is published.

Those numbers are the first freeze (`review-freeze-1`, Nemotron 3 Super). The Action now runs
Nemotron 3.5 Super (below). Its results on the frozen v2 configuration:

- Cal.com, v2: [[CALCOM-V2]]
- All 50 pull requests, v2: [[ALL50-V2]]
- ReviewBench: [[RB-FINAL]]
- Seeded defects on the demo repo: [[SEEDED]]

Full tables, limits and every loss: `docs/bench/results.md`.

## How we built it

**The review pipeline** (`pool-verify-v1`, decision 059) is two Nemotron reviewers, a pool with no
model, and a Nemotron verifier:

1. **review-diff-v1** reads only the title, description and unified diff, in chunks of at most
   60,000 diff characters. Findings that don't land on an added or context line are dropped and
   counted.
2. **review-ctx-v1** runs in parallel and also sees repository context built without a model at
   the PR head: the changed files (long ones cut to ±60-line windows around each hunk), and
   `git grep -w` references to the changed function and class names in other files, capped at
   40,000 characters.
3. **The pool** is every diff finding plus each context finding that agrees with none of them
   (same path, both lines within 3). No model.
4. **verify-ctx-v1** sees each pooled finding with up to 24,000 characters of context (the file
   ±80 lines, its hunks, references to the enclosing and called names) and answers keep or drop.

Then a fix stage asks Nemotron 3 Super for one patch per kept finding, at most four in parallel.
A proposal is accepted only if it is at most 15 lines each way, touches only right-side diff lines,
contains the finding's line and changes something. Otherwise the comment is posted without a fix.

**How the models are used:**

- **Nemotron 3.5 Super** (`nvidia/Nemotron-3.5-Super-VL`) runs both reviewers and the verifier
  (decisions 067, 068). Token Factory serves it only from us-north1. Our client routes that one id
  there per request and leaves the response-cache key and spend ledger unchanged (tests pin both).
  Reasoning on (`chat_template_kwargs.enable_thinking: true`), temperature 0, `max_tokens` 32,000
  for reviewers and 16,000 for the verifier.
- **Nemotron 3 Super** (`nvidia/nemotron-3-super-120b-a12b`, us-central1) writes the suggested
  fixes. That stage was not measured on 3.5, so it stays on 3 Super. 3 Super is also the scorer of
  record for the benchmark (bench-judge-v1). A second judge from another model family
  (Qwen3-235B-A22B-Instruct-2507, also on Token Factory) is reported alongside and changes no
  decision.
- **Nemotron 3 Nano** (`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`) names graph components from
  extracted facts, with reasoning off. Nano and 3 Super ran the repair agent in the held-out
  evaluation.
- **Why 3.5:** on 2 dev runs (40 PRs each), 3.5 raised mean F from 42.3% (five 3 Super runs) to
  50.4% under the scorer of record, mostly by precision (about half the false positives). Under the
  second judge the gain was smaller (55.1% vs 51.3%), and its bootstrap interval includes 0. It
  costs about twice as much (median $0.063 vs $0.031 per PR), and on about 7 of 40 PRs per run one
  chunk returns invalid JSON twice. Those chunks are skipped and the review says it is partial
  ("N of M reviewer chunks failed"), which is how the dev runs were scored (decision 068).
- **Every call goes through one client** (`src/llm/client.ts`): response cache, then a budget
  reservation priced pessimistically (per-run and total caps), then the request, then an
  append-only spend ledger.

**How we kept the numbers honest:**

- Pre-registered plans, committed and pushed before the first model call (decisions 049, 061, 064,
  065, 067), and freeze tags (`eval-freeze-2`, `review-freeze-1`, `review-freeze-2` → `0aeef06`).
  The runner refuses to start if frozen paths changed.
- A blind test set: sessions that built or tuned the reviewer never read Cal.com's golden comments
  or any review text for it. Scripts report counts only.
- Prompts pinned by sha256 in tests, so a changed prompt is a failing test.
- An independent audit recomputed every published number (cc-01). It found no wrong number and
  five wording overclaims, which we fixed (decision 066).

**Stack:** TypeScript on Node 24 (native type stripping), pnpm workspaces, ts-morph, Zod, a
composite GitHub Action, Next.js static export with React Flow and ELK on Vercel, Vitest
(1,305 tests on 23 Oct), and Docker as the repair sandbox. 68 decisions, each with the alternative
we rejected, are in `docs/decisions.md`.

[[SUNNY: whether to say which AI coding assistants built it; `docs/reviewer-plan.md` lists the
lanes. Naming other companies' products may conflict with the trademark rule.]]

## Challenges we ran into

- **The graph didn't help.** The project started as a component graph to guide a repair agent. In
  a pre-registered held-out evaluation (8 seeded bugs, 160 runs), graph on and off resolved about
  the same (Nano 11 vs 13 of 40, Super 28 vs 26 of 40), and the agent never called a graph tool in
  80 graph-on runs (decision 050). We published that and turned to review.
- **Run-to-run spread at temperature 0.** Five dev runs of the same frozen reviewer ranged from
  35.6% to 48.0% F. That is larger than every effect we tried to measure, including the 0.6-point
  margin the reviewer was adopted on. From then on we compared 5-run means, not single runs.
- **A model the API lists but won't serve.** Token Factory's us-central1 `/v1/models` lists
  `nvidia/Nemotron-3.5-Super-VL`, but chat completions there answered 35 of 35 requests with
  `` HTTP 404: The model `nvidia/Nemotron-3.5-Super-VL` does not exist. `` It is served from us-north1, where 3 Super is
  `model_not_found`. We added per-model routing and voided the run under the plan's restart rule.
- **Invalid JSON from 3.5.** About 7 of 40 PRs per dev run had a chunk that returned invalid JSON
  twice, and 79 of 624 calls stopped at exactly the 32,000-token limit. That looks like reasoning
  using up the budget, but it was not checked call by call. Raising the limit or changing the prompt
  would have been a new, unmeasured variant, so we made reviews partial instead.
- **No Nebius sandbox.** Token Factory Sandboxes were not available on our account (support case
  AISTUDIOSUP-1966), so a hardened local Docker container became the sandbox of record
  (decision 036).

## Accomplishments that we're proud of

- **Every loss is published.** Precision ideas that failed on dev are in the results table next to
  the one that was adopted: a confidence-threshold verifier (056, no gain), context for the reviewer
  alone (057, F did not move), a context verifier alone (058, under its bar), voting across five
  runs (064, failed the second judge's condition), and an evidence-quoting verifier with a
  deterministic gate (065, failed every condition). Also published: a wrong prediction, void
  runs, runs stopped at the spending cap, a $0.0113 ledger gap we could not explain, and the graph
  result above.
- A blind, pre-registered test on 10 PRs, with the plan, freeze tag and predictions written before
  any TraceHound result on that repo existed.
- A reviewer that ships as one YAML block and costs cents per PR (dev median $0.063 per PR on 3.5,
  fixes excluded, prices from third-party listings).
- Cross-file contracts that look for breaks in files the PR didn't touch, with no model and a
  90-second budget. On the 40 dev PRs they made 0 findings (decision 065), so they are not yet
  measured on real breaks.
- 26 dated feedback entries to Nebius, with exact error strings and counts.

## What we learned

- Measure more than once. One run at temperature 0 is not a result: our spread was larger than our
  effects. (NVIDIA's model card recommends temperature 1.0 for this model; all our runs used 0,
  which is a limit, not a tuned choice.)
- A second judge from another model family changes results even when it changes no decision. It
  reversed one of our predictions on two of three blind runs.
- Our gap to the top two reviewers on the blind run was precision, and stages we added on dev did
  not close it. Switching the model from 3 Super to 3.5 Super moved mean dev precision more (40.5%
  to 54.8%, 2 dev runs) than any stage we added.
- Context alone did not move F, in the reviewer (057) or in the verifier (058). Pooling the context
  reviewer's extra findings and filtering them with the context verifier did (059), by 0.6 points
  over its bar.
- Write the stop rules before the first call. Runs went void (a killed process, a wrong region,
  model timeouts) and runs stopped at their spending caps; each was handled by a rule written in
  advance, not decided after seeing results.

## What's next

- Fill and publish the v2 results ([[CALCOM-V2]], [[ALL50-V2]], [[RB-FINAL]], [[SEEDED]]).
- Measure maintainer-feedback learning on real repositories: what it suppresses, and whether
  maintainers reject fewer comments.
- Run the reviewer at NVIDIA's recommended temperature (1.0) and measure the spread.
- A separate reasoning budget, if the API offers one, to cut 3.5's invalid-JSON chunks without
  changing the prompt.
- A Token Factory Sandboxes provider for the repair harness when access exists.
- [[SUNNY: anything else, e.g. beyond TypeScript, or a hosted version]]

## Built with

typescript, node.js, nvidia-nemotron, nebius-token-factory, github-actions, ts-morph, zod,
next.js, react, react-flow, elkjs, tailwind-css, vitest, docker, vercel, pnpm

## Links

- Repository: https://github.com/SunnyBagal/TraceHound (MIT)
- Dashboard: https://tracehound-tau.vercel.app
- Demo repository with reviewed pull requests: https://github.com/SunnyBagal/tracehound-demo
- Results, losses and limits: `docs/bench/results.md`
- Nebius and NVIDIA feedback: `FEEDBACK.md` (summary: `docs/devpost/nebius-feedback-summary.md`)
- What changed since 26 August: `docs/devpost/what-changed-since-26-aug.md`
- Video: [[SUNNY: YouTube URL]]
