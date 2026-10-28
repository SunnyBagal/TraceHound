# Devpost write-up (draft)

Fields in the order Devpost asks for them. Paste each section's body into its field. Numbers and
claims come from the brain's `submission/numbers.md` (27 Oct) only.

**Open slots**

- `[[SUNNY: …]]`: a question only Sunny can answer. Each one is also listed in `checklist.md`.

Rules this text follows (numbers.md §0): no other reviewer is named, in text or logo (say "five
commercial reviewers" or "the leading commercial reviewer"); "ahead of / behind" only where the 95% interval excludes 0, otherwise
"statistically tied"; "3rd of 6" only with "point estimate"; dev numbers say "on our 40-PR dev
set" and 3.5 on dev is "2 dev runs"; ReviewBench results are test runs, never a leaderboard rank;
Ultra is report only.

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
  deterministic: no model calls; network only for a credential-free git fetch of the base commit.
  It doesn't install dependencies, run the pull request's
  scripts or load TypeScript plugins. It does parse the pull request's `tsconfig.json` and type
  files with TraceHound's bundled TypeScript, and those can reference files outside the checkout.
  So contracts, like the rest of the Action, are for same-repository pull requests only: fork pull
  requests are skipped, and the stage is not a sandbox.
- **A hidden machine-readable footer** (pipeline, model, pool and kept counts, fix counts) that the
  dashboard reads.
- **Optional learning** (`learn: 'on'`, off by default): findings similar to comments maintainers
  rejected (a 👎, a thread resolved with no change near the comment, or a reply such as "false
  positive") are suppressed, and each suppression is recorded in the
  footer. It is deterministic and not measured by the benchmark.

The dashboard, https://tracehound-tau.vercel.app, has three parts: `/reviews` (the demo repo's
reviews as bug cards with fix diffs), `/benchmark` (the results tables; a test fails CI if
they differ from `docs/bench/results.md`), and the graph (the repo map the project started as).

**Trying it without a key.** Judges can browse the recorded reviews, the dashboard and
the 30 seeded PRs on two public mirror repos
([Recall](https://github.com/SunnyBagal/recall-seeded) and
[Linea](https://github.com/SunnyBagal/linea-seeded)) without a Nebius key. They can't trigger a new review on the demo repo: that
needs write access, because the Action runs only on same-repository pull requests (forks get no
repository secrets) and every review spends our Token Factory key. The demo repo runs the Action
pinned to `review-freeze-2.1` (`86fd5d7`), the measured pipeline with an install fix,
with the 3.5 model set explicitly; on demo PR #2 that config posted no findings
(24 Oct). The older reviews on the demo repo came from earlier generators on Nemotron Nano, not the
current config.

**Results.** Every result here is the product as it ships: pool-verify-v1 on Nemotron 3.5 Super
(`nvidia/Nemotron-3.5-Super-VL`) at tag `review-freeze-2` (`0aeef06`), via Nebius Token Factory.
The benchmark is a public one (5 repos × 10 PRs, human-written golden comments). We compare with
five commercial reviewers' recorded reviews in that dataset, scored by our judge (Nemotron 3 Super,
the scorer of record) with a second judge alongside.

- **Blind test, 10 Cal.com PRs (n = 23 golden comments).** Pre-registered before the run; chosen
  on dev before this look; no tuning after; one run. Precision 63.2% (12/19), recall 52.2% (12/23),
  F 57.1% (58.5% under the second judge). On 10 blind Cal.com PRs, TraceHound is statistically tied
  with four of five commercial reviewers and ahead of one (only 10 PRs). This is the second blind
  look at Cal.com; the first, on Nemotron 3 Super (`review-freeze-1`), had F 58.3%.
- **All 50 PRs (n = 97).** F 52.2% (55.4% under the second judge). Across all 50 PRs: behind the
  leading reviewer, statistically tied with the next two, ahead of the last two (3rd of 6 as a
  point estimate). 40 of the 50 are our dev set, which we tuned on.
- **ReviewBench test runs (25 PRs, one round, ReviewBench's own judge); not a leaderboard
  submission.** We ran six pre-registered configurations on the same 25 PRs, so the top score
  among them carries selection bias. The product scored grounded F1 12.2; the pre-registered winner
  (pool-raw-x2 on Nemotron 3 Super, no verifier, two passes) scored 21.3. There is no final run:
  it would have cost about $107 with VAT (measured: $3.45 per 25-PR round) against a $43.52
  balance.
- **Nemotron 3 Ultra (report only, free NVIDIA API, not Token Factory, not the product).** The 550B
  Nemotron 3 Ultra did not review better than 3.5 Super on our pipeline (report only). Over 2 dev
  runs (judge v1), its pool-verify-v1 mean F was 47.1, against 3.5 Super's 50.4 and 3 Super's 42.3,
  with no interval-backed difference. Its unverified-pool (pool-raw) mean F was 43.6 against 3.5's
  53.9 (−10.2 [−17.7, −3.2]), the only interval that excludes 0. Under the second judge: 54.9 and
  51.4.
- **Seeded PRs on the live config:** On 30 pre-registered seeded PRs, TraceHound caught 9 of 22 seeded defects and stayed silent on all 8 clean controls. It caught 5 of 6 bugs inside the diff but only 4 of 16 that break files the PR didn't touch, and 3 of those 4 came from the deterministic contract check, not the model.
  Pre-registered 19 Oct (seeds, key and scorer committed at `a4a6c83`, hashes published before any PR);
  scored 28 Oct by the committed scorer, automatic rule only
  ([RESULTS.md](https://github.com/SunnyBagal/tracehound-seeds/blob/main/RESULTS.md)).
  Not run: no other reviewer was run on these PRs. Model 3.5, not the 3 Super the 19 Oct plan assumed;
  Recall ran the Action at `0aeef06`, Linea at `86fd5d7` (the install fix).
  Deviations: Linea opened after the Action fix, same order; open-PR script copy with 4 disclosed
  changes; linea#1 base re-set once (no content change) and re-triggered twice; a third-party review
  app auto-commented on the first 3 PRs (not scored; removed); first-PR gate widened to 3 PRs.

Full tables, intervals, limits and every loss: `docs/bench/results.md`, `docs/bench/v2-calcom.md`,
`docs/bench/v2-intervals.md`.

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
(1,421 tests on 27 Oct), and Docker as the repair sandbox. Every decision, with the alternative we
rejected, is in `docs/decisions.md`.

**AI coding assistants:** the code and docs were written with AI coding assistants: Claude Code,
Codex, Devin, Grok and Gemini.

## Challenges we ran into

- **Our own Action failed before review.** The seeded test caught an install bug: on a repo
  pinning another pnpm version via `packageManager`, the setup step failed before any model call.
  We fixed it as `review-freeze-2.1`, a one-file change with the review code unchanged (decision 072).
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
  deterministic gate (065, failed every condition). Since then: a recall-first variant (070, both
  arms below their pre-registered precision floor; it was measured partly hampered by truncation
  and a per-PR cap, and 2 defects an automated review found in it are documented, not fixed) and
  Nemotron 3 Ultra (071). Also published: a wrong prediction, void runs, runs stopped at the
  spending cap, a $0.0113 ledger gap we could not explain, no ReviewBench final (money), and the
  graph result above.
- A blind, pre-registered test on 10 PRs, with the plan, freeze tag and predictions written before
  any TraceHound result on that repo existed, and a second blind look for the product config
  (3.5), whose plan and freeze tag (`review-freeze-2`) were also pushed before its first call.
- A reviewer that ships as one YAML block and costs cents per PR: about $0.06–0.07 per PR on 3.5
  (pre-VAT; dev median $0.063, mean $0.074, fixes excluded), about 2 minutes wall time per PR
  (median on dev). The whole project's Nebius spend was $57.05 + VAT (30 days to 24 Oct).
- Cross-file contracts that look for breaks in files the PR didn't touch, with no model and a
  90-second budget. On the 40 dev PRs they made 0 findings (decision 065), so they are not yet
  measured on real breaks.
- 29 dated feedback entries to Nebius, with exact error strings and counts.

## What we learned

- Measure more than once. One run at temperature 0 is not a result: our spread was larger than our
  effects. (NVIDIA's model card recommends temperature 1.0 for this model; all our runs used 0,
  which is a limit, not a tuned choice.)
- A second judge from another model family changes results even when it changes no decision. It
  reversed one of our predictions on two of three blind runs.
- Our gap to the top two reviewers on the blind run was precision, and stages we added on dev did
  not close it. Switching the model from 3 Super to 3.5 Super moved mean dev precision more (40.5%
  to 54.8%, 2 dev runs) than any stage we added.
- A gain on our own dev set doesn't carry over by itself. 3.5 beat 3 Super on our dev set but lost
  on ReviewBench in both pipelines (12.2 vs 13.9 with the verifier; 13.5 vs 16.0 without).
  ReviewBench's grounded metric rewards volume (findings), which the product's verifier cuts.
- Context alone did not move F, in the reviewer (057) or in the verifier (058). Pooling the context
  reviewer's extra findings and filtering them with the context verifier did (059), by 0.6 points
  over its bar.
- Write the stop rules before the first call. Runs went void (a killed process, a wrong region,
  model timeouts) and runs stopped at their spending caps; each was handled by a rule written in
  advance, not decided after seeing results.

## What's next

- Recover chunks lost to invalid JSON (JSON repair or schema-constrained output; a retry with
  reasoning off mostly failed in our recall-first experiment).
- A per-PR comment cap, against noise in posted reviews: replayed on saved dev runs at $0, no cap
  on the shipped, verified pipeline improves F with an interval excluding 0; small gains appear
  only on the unverified pool at k = 4–5. A hypothesis, not adopted.
- The verifier: on our 40-PR dev set, verified scores above the unverified pool with an interval
  excluding 0 in 2 of 9 runs; on 3.5 neither run shows a difference (−1.6 and −5.4, intervals
  include 0); on ReviewBench the unverified pool scores higher in both models. An open question,
  not a finding (replay: `docs/bench/levers-v2.md`).
- A cheaper 2-of-3 vote across runs: no gain established.
- Where the misses are: both 3.5 dev runs miss 35 of 74 Medium+ golden comments; none of the 7
  Critical ones is missed by both; the most missed repo is sentry (14 of 21 Medium+).
- Cheaper experiments: run-to-run spread exceeds most effects, so replay on saved records before
  paying for new runs.

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
