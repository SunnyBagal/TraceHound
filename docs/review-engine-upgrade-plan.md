# Review engine upgrade plan

Planning only. This document changes no code. It audits the shipped review pipeline
(`pool-verify-v1`, review-freeze-2), summarises what four competitors have published about how
they find bugs, and ranks 7 upgrades by expected benchmark gain per unit of effort.

Conventions used below:

- **Measured** means a number in this repo's `docs/bench/` or `docs/decisions.md`. Every number
  in this document is either measured (with the file it comes from) or arithmetic on measured
  counts. Expected effects and costs of upgrades are **guesses** and are labelled that way.
- **Published** means a competitor said it in a blog, its docs or a talk (linked under Sources).
  **Inferred** means it is my reading, not their claim.
- Blindness holds: nothing here reads or reasons from Cal.com golden comments, recorded tool
  comments or per-comment score detail. Cal.com appears only as counts from `docs/bench/results.md`.

## 0. Where we stand (measured)

From `docs/bench/results.md` (bench-judge-v1, Cal.com, n = 23 Medium-or-higher golden comments,
10 PRs):

| tool | TP | FP | FN | P | R | F |
|---|---|---|---|---|---|---|
| augment | 15 | 3 | 8 | 83.3% | 65.2% | 73.2% |
| cursor | 13 | 3 | 10 | 81.3% | 56.5% | 66.7% |
| **TraceHound v2** (one run) | 12 | 7 | 11 | 63.2% | 52.2% | 57.1% |
| greptile | 10 | 7 | 13 | 58.8% | 43.5% | 50.0% |
| copilot | 15 | 27 | 8 | 35.7% | 65.2% | 46.2% |
| coderabbit | 9 | 17 | 14 | 34.6% | 39.1% | 36.7% |

TraceHound is 3rd of 6 on the point estimate. `results.md` reports that on intervals it is tied
with Augment, Cursor, Greptile and Copilot and ahead of CodeRabbit, and that n = 23 is small.
Over all 50 PRs it is also 3rd, behind Augment on an interval-backed gap.

**What top 2 means in counts (arithmetic, not a forecast):** to pass Cursor's 66.7% at n = 23,
TraceHound needs, for example, 15 TP with at most 6 FP (P 71.4%, R 65.2%, F 68.2%), or 14 TP with at
most 4 FP (P 77.8%, R 60.9%, F 68.3%). With 7 FP, 15 TP only ties Cursor at 66.7%. So it needs
roughly +2 to +3 true positives *and* fewer false positives than it has today. Recall alone is not
enough, and neither is precision alone.

Other measured facts that shape this plan:

- **The verifier costs recall.** Dev means (40 PRs, n = 74, 3.5 Super, 2 runs): pool-raw
  P/R/F 48.0 / 61.5 / 53.9 vs pool-verify-v1 54.8 / 46.6 / 50.4 (`results.md`). On the Cal.com
  run, review-diff-v1 alone had F 58.5% and pool-raw had F 57.8% (R 56.5%), against 57.1% for the
  verified pipeline. Decision 058: verify-ctx-v1 dropped 62 of 93 false positives but also 10 of 32
  true positives.
- **Output failures cost whole PRs.** About 7 of 40 dev PRs per run have a reviewer chunk that
  fails on invalid JSON. On the Cal.com v2 run, 1 of 10 PRs had *both* reviewer chunks fail and was
  scored with no findings (`results.md`, `dev-3.5.md`).
- **Run-to-run noise is large.** On 3 Super, pool-verify dev F ranged from 35.6% to 48.0% across
  runs. One Cal.com run cannot separate changes worth a few points.
- **The dev set has no TypeScript.** The four dev repos are Sentry (Python), Grafana (Go), Keycloak
  (Java) and Discourse (Ruby). Cal.com is the only TypeScript repo, and it is the blind test set. So
  anything TypeScript-specific (ts-morph graph, `tsc`, typed ESLint) **cannot be measured on the
  current dev set**. Section 5.0 deals with this.
- **Losses already recorded (don't repeat them):** 056 verify-v1 confidence threshold (no gain);
  064 vote across runs (loss); 065 evidence-quote verifier + deterministic gate (loss); 070
  recall-v3 multi-lens + missed pass (neither arm met its precision floor, e.g. 3.5 P 20.9%, F 31.4%);
  071 Nemotron 3 Ultra (no gain); `levers-v2.md`: per-PR caps gave no interval-backed gain on the
  verified pipeline.
- **Cost:** v2 costs about $0.06 to $0.07 per PR. The Cal.com run 4 median was $0.0717 and the
  max $0.1298, with a median wall time of about 128 s (`results.md` section 10).

## 1. Audit: how a PR review runs today

### 1.1 Trigger and guards

- **Files:** `.github/actions/tracehound-review/action.yml` → `packages/action/src/cli.ts`
  (`main`, env parsing: `TRACEHOUND_REVIEWER` defaults to `pool-verify-v1`, max comments 15, fixes
  on, contracts on, learn off) → `packages/action/src/action.ts` (`runAction`).
- **What it does:** refuses `calcom/cal.com`, skips fork PRs, validates options, checks that the
  checkout has the PR head SHA, fetches the unified diff and metadata from the GitHub API, and
  drops stale events whose head moved.
- **Weak spots:** none that touch the score. The stale-head and fork checks are correct
  product behaviour.

### 1.2 Candidate generation A: diff-only reviewer (`review-diff-v1`)

- **Files:** `packages/action/src/pipeline.ts` (`runPipeline` spawns the analyzer CLI) →
  `packages/analyzer/src/review/cli.ts` → `review.ts` (`reviewPull`), `diff.ts` (chunking,
  `DiffIndex`), `prompt.ts` (frozen prompt).
- **What it does:** splits the diff into chunks of at most 60,000 characters and makes one model
  call per chunk (temperature 0, reasoning on, `max_tokens` 32,000). It parses the reply as strict
  JSON and retries once on invalid JSON. If the retry also fails, the chunk is `CHUNK_FAILED` and
  contributes nothing. Each finding must name a path in the diff and an integer line on the
  new-side diff; anything else is dropped. The prompt asks for defects "you would block the merge
  for", rules out style, tests and docs, and limits contract reasoning to "as far as the diff
  shows them".
- **Recall losses:**
  1. A `CHUNK_FAILED` chunk loses every bug in it, and when all chunks fail the whole PR scores
     zero (measured above). A likely cause, not confirmed, is reasoning tokens using up the output
     budget.
  2. The reviewer cannot see callers, callees or types outside the diff, so it misses broken
     contracts by design.
  3. Findings with a null line are dropped, and so is a finding whose line sits just outside a
     hunk.
  4. Temperature 0 gives a single sample, and the repo's run-to-run spread shows that the sample
     is not stable anyway.
- **False-positive sources:** guesses about unseen code ("this may be undefined if the caller…").

### 1.3 Candidate generation B: context reviewer (`review-ctx-v1`)

- **Files:** `packages/analyzer/src/review/review-ctx.ts`, `ctx-cli.ts`, `context.ts`, `names.ts`,
  `prompt-ctx.ts`.
- **What it does:** same model and contract as A, plus a deterministic context block for each
  chunk (no model involved):
  - changed files in full when they are at most 12,000 characters, otherwise ±60-line windows
    around hunks;
  - changed names pulled out by **regex** (`names.ts`: minimum length 4, stoplist, multi-language);
  - references found with `git grep -n -w -F` (8 per name, 30 per chunk, ±3 lines, tests last);
  - a 40,000-character budget, with references cut first.
- **Recall losses:**
  1. The regex extraction misses and misidentifies names, as the file's own comment says.
  2. `git grep` matches the word, not the symbol, so common names drown out the real use sites,
     and caps of 8 per name / 30 per chunk then drop the relevant ones.
  3. The budget cuts references first. Decision 057 notes how often references fell out.
  4. There are no callees, types, interfaces, Zod/Prisma schemas or related tests by symbol.
  5. **The ts-morph component graph, `changes` (declaration-level diff) and contracts
     `dependents` are not used anywhere in the review path.**
- **False-positive sources:** unrelated grep hits that look relevant. Decision 057 measured P up and
  R down when this reviewer ran alone.

### 1.4 Pooling

- **Files:** `packages/action/src/pipeline.ts` (`poolFindings`), `scripts/bench/agree-rule.ts`
  (`agrees`, `norm`).
- **What it does:** keeps every diff finding, then adds each ctx finding that does not agree with
  one of them. Two findings agree when they have the same normalised path, non-null lines and
  |Δline| ≤ 3. It records the source of each kept finding as `both`, `diff` or `ctx`.
- **Weak spots:**
  1. The agreement signal (`both`) is recorded but never used for decisions. The verifier treats a
     finding both reviewers found exactly like a finding only one of them found.
  2. Agreement is decided by location only, so two different bugs within 3 lines collapse into one
     (a recall loss) and the same bug reported 5 lines apart becomes two findings (a duplicate).
     The judge counts duplicates as neither TP nor FP, but they still use comment budget. On Cal.com
     v2, 11 of 30 comments were judged duplicates.
  3. Product code imports a module from `scripts/bench/`, which is a maintenance smell, not a
     score issue.

### 1.5 Verification (`verify-ctx-v1`)

- **Files:** `packages/analyzer/src/review/verify-ctx.ts`, `verify-context.ts`,
  `verify-ctx-prompt.ts`, `verify-ctx-cli.ts`.
- **What it does:** one model call per pooled finding. Context for each call is the finding's file
  ±80 lines (shrinking to ±40), that file's hunks up to 12,000 characters, and names found by regex
  (the enclosing definition, names defined or called on the line) with `git grep` references (6 per
  name, 15 per finding), all within a 24,000-character budget. The verifier is a "sceptical
  maintainer" that answers `keep`/`drop` with a reason. `VERIFY_FAILED` counts as keep.
- **Recall losses (measured):** this is the biggest measured recall drain in the pipeline. Pool-raw
  dev R is 61.5% and verified R is 46.6%; decision 058 dropped 10 of 32 true positives. The
  verifier sees *less* context than the reviewer that produced some of these findings, and a
  binary verdict with no evidence requirement lets it drop a true positive that it simply cannot
  confirm.
- **False positives:** it removes many (62 of 93 in 058). That is why precision is the one metric
  where v2 is competitive at all.

### 1.6 Deterministic contracts (Action only)

- **Files:** `packages/analyzer/src/contracts/` (`typed.ts`, `keyed.ts`, `dependents.ts`,
  `findings.ts`), `packages/action/src/contracts.ts`, `docs/contracts.md`.
- **What it does:** runs in parallel with the pipeline. It reports `tsc` diagnostics that are new at
  head in unedited files, and string-key contracts (routes, queues, Redis keys, env names, events)
  that the diff broke. `dependents` finds symbol-confirmed use sites of changed exported
  declarations but emits **no** findings. Model findings within 3 lines of a contract finding are
  removed.
- **Weak spots:**
  1. **It does not run in the benchmark pipeline**, so it adds nothing to the score.
  2. Dependencies are not installed, so package types resolve to `any` and many real type breaks
     never show up.
  3. Behavioural changes that still compile are out of scope.
  4. Decision 065 / `evidence.md`: contracts made 0 findings on the 40 dev PRs, which is expected
     because none of the dev repos is TypeScript.

### 1.7 Feedback suppression, cap, fixes, posting

- **Files:** `packages/action/src/learn.ts` and `docs/learn.md` (deterministic fingerprints from
  👎, resolved-unchanged threads and reply phrases; default off); cap ordering in `action.ts`;
  `packages/action/src/fix.ts` (fix suggestions, not tested); review payload, inline comments,
  422 fallback and `tracehound:v1` footer in `action.ts`.
- **Benchmark effect:** none. The benchmark has no maintainer feedback, and the cap is above the
  typical comment count. The conventions loader (`packages/analyzer/src/learn/conventions.ts`:
  AGENTS.md, CLAUDE.md, `.cursor/BUGBOT.md`, Copilot instructions, `.tracehound/rules.md`) exists
  but **is not fed into any prompt**.

### 1.8 Summary of the audit

| stage | biggest recall loss | biggest FP source |
|---|---|---|
| diff reviewer | failed chunks (whole PRs lost); no cross-file view | guesses about unseen code |
| ctx reviewer | regex names + word grep + budget cuts; graph unused | noisy grep hits |
| pooling | location-only merge; agreement signal unused | duplicates |
| verifier | drops TPs it can't confirm (−15 R pts dev) | — (it is the FP filter) |
| contracts | not in bench path; no installed deps | — |

## 2. How competitors find bugs

### 2.1 Cursor Bugbot

**Published:**
- *Launch pipeline:* eight parallel bug-finding passes, each with a randomised diff order;
  majority voting to filter out bugs found in only one pass; a validator model to catch false
  positives; dedupe against bugs posted in previous runs.
- *Agentic redesign:* the largest gains came from switching to a fully agentic design, in which the
  agent reasons over the diff, calls tools and decides where to dig deeper. With the agent they had
  to make prompts *more aggressive*, because it was too cautious. They moved information from
  static context to dynamic context.
- *Measurement:* the metric is "resolution rate", which uses AI to decide at merge time which
  flagged bugs the author fixed. It went from 52% to over 70%, and bugs flagged per run went from
  0.4 to 0.7, across 40 major experiments. Offline evaluation uses an internal BugBench. Many
  changes regressed the metrics.
- *Rules and learning:* Bugbot rules: team rules, then `.cursor/BUGBOT.md` (nested files picked up
  by walking up from the changed files), then learned rules, then manual rules, each truncated at
  30,000 characters. Learned rules come from GitHub activity when a PR is merged or closed, and
  from `@cursor remember`.
- *Other:* reads existing PR comments to avoid duplicate suggestions; effort levels
  low/default/high/smart. Running code to verify its own bug reports is described as a *future*
  capability.

**Inferred:** the shipped agent's tools are not listed publicly. Treating "call tools" as code
search plus file reads is a guess. Nothing published says Bugbot uses embeddings or a symbol graph.

### 2.2 Augment Code Review

**Published:**
- Powered by GPT-5.2.
- The Context Engine retrieves "dependency chains, call sites, type definitions, tests, fixtures,
  and historical changes", keeps a live understanding across repos, services and history, and is
  credited for recall ("precision can be dialed up with filtering… recall requires… context
  retrieval").
- Custom review guidelines.
- Adapts on which comments developers address or ignore, which Augment says raises precision over
  time.
- Two review styles: Thorough (the default, "50% more bugs") and Precise (fewer comments).
- Avoids style nags.
- Published its own run on this same 50-PR benchmark (Augment 65/55/59 P/R/F; Cursor 60/41/49;
  Greptile 45/45/45; CodeRabbit 36/43/39).

**Inferred:** how the Context Engine indexes (embeddings, a graph or both) is not described in the
pages I read. It's a guess that it is hybrid. Augment has published no verifier or multi-pass
design for review. Its results suggest strong filtering, but that is an inference.

### 2.3 CodeRabbit

**Published:**
- *Context and analysis:* it assesses the impact of changes on the entire codebase. It runs 20+
  linters and security scanners; its tools docs list ESLint, Biome, Oxlint, Semgrep, ast-grep and
  ShellCheck, among others. Its agent writes and runs shell scripts (`cat`, `grep`, `ast-grep`) in
  a sandbox (two layers on Cloud Run gen2) to navigate and verify. A "code verification" analysis
  chain is published with the review.
- *Inputs:* a code graph of file dependencies; PR intent from the description and linked issues;
  "verification agents".
- *Learning:* a vector database of learnings from past reviews. Learnings come from chat replies
  and are stored per repo. Path-based and AST-based path instructions.

**Inferred:** the published "code graph" sounds file-level ("how files interrelate"). Whether it is
symbol-level is not stated. How verification agents decide to drop a comment is not published.

### 2.4 Greptile

**Published:**
- *Graph:* it builds a graph of the whole repo (files, functions, classes, variables; calls,
  imports, dependencies, variable usage) and queries it for each changed function (dependencies,
  similar functions).
- *Embeddings:* raw-code embeddings retrieve poorly. Translating code into natural language before
  embedding and chunking per function work better.
- *v3:* replaced a fixed flowchart with an agent loop that has codebase search and learned rules,
  a high limit on inference and tool calls, and access to git history.
- *Noise ("How to make LLMs shut up"):* about 79% of earlier comments were nits. Prompting and
  few-shot examples failed. An LLM judge scoring severity 1 to 10 with a cut at 7 was "nearly
  random" and slow. What worked was per-team embeddings of upvoted and downvoted comments: a new
  comment is blocked if it is similar to at least 3 downvoted ones.
- *Runtime and models:* runs code in a sandbox (install, dev server, mock API inputs). "Model
  inversion": reviewing with a different model family than the author's raised catch rate about 10%
  in Greptile's own research. Right-sized models per subtask.
- *Learning:* learns from team comments, replies and reactions.

**Inferred:** how Greptile combines the graph with embeddings at query time is not specified. It's
a guess that it is hybrid.

### 2.5 Cross-cutting summary

| dimension | Cursor | Augment | CodeRabbit | Greptile |
|---|---|---|---|---|
| context beyond diff | agent tools (pub.); specifics unpublished | call sites, types, tests, fixtures, history (pub.) | codebase-wide, scripts, file graph, linked issues (pub.) | graph neighbours, similar functions, git history (pub.) |
| indexing | not published | not published (guess: hybrid) | file graph + vector DB for learnings (pub.) | graph + NL-summary embeddings (pub.) |
| multi-pass | 8 passes + vote (pub., launch); later agentic | not published | not published beyond "verification agents" | agent loop (pub.) |
| verification | validator model (pub.) | not published | sandboxed scripts / verification chain (pub.) | runtime sandbox (pub.); LLM severity judge failed (pub.) |
| feedback learning | learned rules from PR activity (pub.) | addressed/ignored comments (pub.) | chat learnings (pub.) | votes, replies, comments (pub.) |
| noise control | vote, validator, dedupe vs earlier runs (pub.) | Thorough vs Precise (pub.) | not published | embedding filter against downvotes (pub.) |

## 3. Gap analysis

| technique | competitors using it | does TraceHound have it (yes/partial/no) | expected effect on recall and precision | effort (S/M/L) |
|---|---|---|---|---|
| Symbol-level callers/callees/types context | Augment, Greptile (pub.); CodeRabbit file-level (pub.) | partial (regex + word grep; graph unused in review) | R up (guess), P up from cleaner context (guess) | M |
| Agentic tool loop (dig deeper on demand) | Cursor, Greptile, CodeRabbit (pub.) | no | R up (guess), P risk; cost up | L |
| Multiple passes + agreement / voting | Cursor (pub., launch) | partial (2 reviewers pooled; agreement unused; vote across runs lost in 064) | P up if agreement is used as a signal (guess) | S |
| Validator / verifier model | Cursor (pub.) | yes (verify-ctx-v1) but recall-costly | tune to recover R at a small P cost (guess) | S |
| Static analyzers merged with LLM findings | CodeRabbit (pub.) | partial (contracts/tsc in Action only, no deps) | small R up on type breaks; high P (guess) | M |
| Running code / tests to confirm | Greptile, CodeRabbit (pub.); Cursor (future) | no in review (sandbox exists for repair/repro) | P up on confirmed findings; R neutral (guess) | L |
| Embeddings / hybrid retrieval | Greptile (pub.); CodeRabbit (learnings, pub.) | no | small or unknown on this benchmark (guess) | M |
| Repo rules files | Cursor, Augment, CodeRabbit, Greptile (pub.) | partial (loader exists, not in prompts) | small (guess) | S |
| Feedback learning | all four (pub.) | partial (learn.ts, default off) | none on benchmark | — |
| Dedupe vs earlier runs / existing comments | Cursor (pub.) | partial (location-based pooling only) | removes duplicates, frees comment budget (guess) | S |
| Output reliability (no lost chunks) | not published (table stakes) | partial (one retry) | R up on the affected PRs (guess) | S |
| Different model family as reviewer | Greptile, "model inversion" (pub.) | no (all Nemotron) | unknown here; Cal.com authors were humans when the PRs were made (inferred) | S (if allowed) |

## 4. Constraints the plan keeps

- **Custom TypeScript.** No LangChain or LangGraph. An "agent loop" here is a hand-written loop over
  typed tool functions, like the repair agent that already exists.
- **Storage:** no graph DB. The graph stays as deterministic facts: today JSON snapshots, later a
  Postgres `edges` table (from, to, kind, evidence JSON) via Drizzle, with k-hop queries as a
  recursive CTE, or in memory from the snapshot. At this repo size (thousands of nodes) a graph DB
  buys nothing. BullMQ is for later, one job per stage, when the Action becomes a service.
- **Grounding:** the LLM never creates edges. It only reads context the deterministic layer built,
  and every finding keeps `path`, new-side `line` and an evidence field (a quote, or graph/contract
  evidence ids) that is checked mechanically.
- **Models:** `AGENTS.md` limits product model calls to Nemotron on Nebius Token Factory (the
  hackathon rule). Every upgrade below is costed on Nemotron. Opus and GPT appear only as optional
  judges or comparison arms for evaluation, unless the owner lifts that rule.

## 5. Ranked upgrade plan

All gains are **guesses**. Order is expected gain per effort.

### 5.0 Prerequisite: a measurement setup that can see the changes

- **Why:** a single Cal.com run has n = 23, and the dev set has no TypeScript.
- **What:** keep the 40 dev PRs for language-agnostic changes (5.1, 5.2, 5.5). Add a TypeScript dev
  set from TS repos that are not in the benchmark, for example seeded-bug PRs on Recall and CEX (the
  repair harness already seeds bugs) or real public PRs with known fixes, scored with the same judge.
  Seeds must be new: the existing `recall-seeded`, `linea-seeded` and `tracehound-seeds` sets are
  held out and are not to be tuned on.
- **A/B rules:**
  - at least 3 runs per arm;
  - a paired bootstrap over PRs, with intervals reported;
  - offline replay from cached candidates wherever a change touches only later stages (as
    `levers-v2.md` did);
  - a pre-registered single Cal.com run only at the end, as in decisions 061 and 069.
- **Effort and cost:** M; judge cost only.

### 5.1 Stop losing whole chunks (S)

- **What:** make chunk failures rare and partial instead of total:
  - on invalid or truncated JSON, retry with a fresh request with reasoning off (this exists
    default-off in `docs/post-freeze-fixes.md`);
  - enable the lenient parser;
  - split a failed chunk in half and retry each half;
  - keep null-line findings by attaching them to the nearest hunk line in the same file, or as a
    body comment.
- **Where:** `packages/analyzer/src/review/review.ts`, `review-ctx.ts`, `diff.ts`.
- **Technique:** deterministic, same Nemotron model.
- **Measure:** the count of `CHUNK_FAILED` chunks and of PRs with zero reviews (target 0). Dev R and
  F, 3 runs per arm, replay not possible because it changes generation.
- **Risks:** lenient parsing can admit malformed findings, and `DiffIndex` still guards them.
- **Cost:** guess +$0.00 to $0.01 per PR (retries only on failure).

### 5.2 Use agreement as a signal in verification (S)

- **What:**
  - findings that both reviewers produced (`both`) skip the verifier, or need a `drop` with a
    concrete counter-quote to be removed;
  - single-source findings are verified as today;
  - the verifier gets a three-way verdict (`keep` / `drop` / `unsure`), and `unsure` is kept for
    `both` findings and dropped for single-source ones;
  - merge duplicates by body similarity as well as location, so different bugs within 3 lines
    survive and paraphrases of one bug collapse.
- **Where:** `packages/action/src/pipeline.ts` (`poolFindings`, verify input), `review/verify-ctx.ts`,
  `verify-ctx-prompt.ts` (a new prompt version, with a decision entry, because the prompt is frozen).
- **Technique:** deterministic routing plus the same Nemotron verifier. Text similarity is token
  Jaccard, as in `learn.ts`, so no embeddings are needed.
- **Measure:** offline replay on cached dev candidates (cheap and paired), then 3 fresh runs. The
  metrics are dev R, P and F, plus TPs dropped by the verifier (058-style counts).
- **Risks:** `both` findings can be shared false positives. That is why the counter-quote path
  exists.
- **Cost:** below today's, because fewer verifier calls are made.

### 5.3 Symbol-graph k-hop context for reviewer and verifier (M)

- **What:** for TS/JS files, replace `names.ts` regex and word `git grep` with symbol-resolved
  context built from what already exists:
  - `tracehound changes` gives the changed declarations;
  - contracts `dependents.ts` gives symbol-confirmed use sites;
  - ts-morph gives callees and the type and interface declarations of parameters and returns;
  - test files that import the changed module;
  - schema declarations (Zod, Prisma) referenced by the changed code;
  - k = 1 for callers and callees and k = 2 for types, ranked by graph distance and then by whether
    a node sits in the changed component (`impact`). Non-TS repos fall back to today's grep path,
    so dev results stay comparable.
  - Every context item carries its evidence (file:line of the call or import), and the prompt can
    cite it as evidence.
- **Where:** `packages/analyzer/src/review/context.ts` and `verify-context.ts`, new `review/graph-context.ts`
  reusing `changes`, `contracts/dependents.ts`, `contracts/projects.ts`.
- **Technique:** deterministic (ts-morph). The model only reads.
- **Measure:** this needs the TS dev set from 5.0. Track R and F, and also the share of TPs whose
  evidence lies outside the diff. Check that Python, Go, Java and Ruby dev results do not move.
- **Risks:**
  - ts-morph project load time on large repos (`changes` already handles worktrees; cap the files
    loaded);
  - noise if k is too large;
  - unresolved types without installed deps (see 5.4).
- **Cost:** no extra calls at a fixed context budget. Guess +5 to 20 s wall time for the project load.

### 5.4 Deterministic analyzers in the benchmark path, with installed deps (M)

- **What:**
  - run contracts (typed + keyed) in the bench pipeline too;
  - install dependencies in the existing Docker sandbox so `tsc` sees real types, and report only
    new-at-head diagnostics;
  - add a small typed ESLint rule set aimed at bugs (no-floating-promises, no-misused-promises,
    await-thenable, no-unnecessary-condition, switch-exhaustiveness-check);
  - optionally add a curated Semgrep security set;
  - each diagnostic either becomes a finding with tool evidence (only if new at head and on a diff
    line) or is passed to the reviewers and verifier as a hint.
- **Where:** `packages/analyzer/src/contracts/typed.ts` and `projects.ts`, `harness/` sandbox
  provider, `packages/action/src/pipeline.ts` (merge), bench runner under `scripts/bench/`.
- **Technique:** deterministic. Adding ESLint or Semgrep is a new dependency, so it needs owner
  approval (`AGENTS.md`).
- **Measure:** the TS dev set; P of analyzer-sourced findings on their own, and R and F of the
  merged set.
- **Risks:**
  - install time and failures (lockfile, private packages);
  - lint rules produce findings that are true but not golden, so start in hint mode and promote
    only rules with measured precision.
- **Cost:** $0 tokens; guess 1 to 3 minutes of CPU per PR for install plus `tsc`.

### 5.5 Triggered specialist passes (M)

- **What:** one extra narrow pass per triggered category, never a blanket lens set (070 lost on
  that).
- **Triggers:** deterministic, on the declaration-level diff and imports:
  - async/await or Promise changes;
  - DB or ORM query changes;
  - route handlers or auth checks;
  - date, time or timezone arithmetic;
  - null or optional handling on changed signatures;
  - concurrency (locks, queues).
- **Pass contents:** each pass gets a short category checklist plus 5.3 context. Its findings go
  through the 5.2 verifier, with at most 2 per pass.
- **Where:** new `review/specialists/` alongside `review/recall/`, plus a trigger table, then
  `pipeline.ts`.
- **Technique:** Nemotron, deterministic triggers.
- **Measure:** dev (language-agnostic triggers) and the TS dev set. Gate on dev P not falling more
  than 2 points below the current arm while R rises.
- **Risks:** precision collapse, as in 070. The per-pass cap and verifier are the guard.
- **Cost:** guess +$0.01 to $0.03 per PR, depending on triggers.

### 5.6 Sandbox confirmation for top candidates (L)

- **What:** for verifier-kept findings on TS repos, try to confirm them mechanically:
  - a new `tsc` error;
  - an existing test that fails at head and passes at base;
  - a one-test reproduction through the existing repro-v1 stage (decision 048).
  - A confirmed finding is marked "confirmed" with the test or diagnostic as evidence, which helps
    ordering and precision. An unconfirmed finding is not dropped, because absence of a repro is
    weak evidence.
- **Where:** `packages/analyzer/src/harness/reproduce.ts`, Docker provider, `pipeline.ts`.
- **Technique:** Nemotron writes the test, and pass or fail is deterministic.
- **Measure:** the TS dev set, P among confirmed findings, and wall time. The benchmark gain is
  probably small because most golden comments are not about compile errors (guess).
- **Risks:**
  - per-repo setup cost (profiles);
  - flaky tests;
  - wall time.
- **Cost:** guess $0.02 to $0.10 per confirmed attempt plus minutes of sandbox time. Cap the number
  of attempts per PR.

### 5.7 Feed repo rules into prompts (S)

- **What:** pass `conventions` output (scoped by `applyTo` globs, 8,000 characters) into reviewer
  and verifier prompts as "repository rules".
- **Where:** `packages/analyzer/src/learn/conventions.ts`, `review/prompt.ts`, `prompt-ctx.ts`,
  `verify-ctx-prompt.ts` (new prompt versions).
- **Technique:** deterministic, Nemotron.
- **Measure:** dev and TS dev, looking at P. Expected benchmark effect is small, because golden
  comments target bugs, not house rules (guess). It is product value.
- **Cost:** +2,000 to 3,000 input tokens per call (guess), well under $0.01 per PR.

## 6. What not to do

- **Score severity or confidence with the LLM and cut on a threshold.** Greptile published that it
  was "nearly random", and TraceHound's 056 found no gain.
- **Add broad lenses or a blanket missed-issues pass.** 070 failed its precision floor. More volume
  helps ReviewBench's grounded metric, not this benchmark.
- **Vote across whole reruns.** 064 was a loss. Bugbot's published voting was within one run over
  shuffled diffs, which is different, and it is still unmeasured here.
- **Expect a bigger model alone to fix it.** 071 (Ultra) gave no gain.
- **Gate findings on a quote matching the code.** 065 was a loss. Evidence should be checked, not
  used as a hard filter on model-written quotes.
- **Tune on Cal.com, or read its golden comments.** It breaks blindness and the result.
- **Add a graph database.** The graph is small and deterministic; Postgres plus recursive CTEs
  covers k-hop queries.
- **Let the LLM propose edges or "infer" relationships into the graph.** It breaks the evidence
  rule.
- **Use LangChain or LangGraph.** Out of scope by constraint.
- **Build an embedding index first.** It needs a new provider and pgvector, and Greptile's own post
  says raw-code embeddings retrieve poorly. Symbol context (5.3) is cheaper and fits TypeScript.
- **Expect feedback learning to move the benchmark.** The benchmark has no feedback. Keep it as a
  product feature.

## Sources

Repo (measured):
- `docs/bench/results.md`, `docs/bench/levers-v2.md`, `docs/bench/v3-recall.md`, `docs/bench/dev-3.5.md`,
  `docs/bench/evidence.md`, `docs/post-freeze-fixes.md`, `docs/contracts.md`, `docs/learn.md`,
  `docs/reviewer-plan.md`, `docs/decisions.md` (054–072)

Cursor Bugbot:
- https://cursor.com/blog/building-bugbot
- https://cursor.com/docs/bugbot

Augment Code Review:
- https://www.augmentcode.com/blog/introducing-augment-code-review
- https://www.augmentcode.com/blog/we-benchmarked-7-ai-code-review-tools-on-real-world-prs-here-are-the-results
- https://docs.augmentcode.com/codereview/overview
- https://www.augmentcode.com/context-engine

CodeRabbit:
- https://cloud.google.com/blog/products/ai-machine-learning/how-coderabbit-built-its-ai-code-review-agent-with-google-cloud-run
- https://www.coderabbit.ai/blog/the-art-and-science-of-context-engineering
- https://docs.coderabbit.ai/tools
- https://docs.coderabbit.ai/knowledge-base
- https://docs.coderabbit.ai/knowledge-base/learnings

Greptile:
- https://www.greptile.com/blog/make-llms-shut-up
- https://www.greptile.com/blog/semantic-codebase-search
- https://www.greptile.com/docs/how-greptile-works/graph-based-codebase-context
- https://www.greptile.com/docs/how-greptile-works/memory-and-learning
- https://www.greptile.com/blog/greptile-v3-agentic-code-review
- https://www.greptile.com/blog/how-to-build-a-code-review-agent
