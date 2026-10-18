# ReviewBench feasibility spike (cc-02)

**Question:** can TraceHound's pull-request reviewer (pool-verify-v1, decision 059) be scored on
GitHub's ReviewBench (announced 2026-10-05: 219 PRs, 187 repos, 19 languages), and what would one
run cost? Our blind test is 10 Cal.com PRs (n = 23 golden comments, decision 062), which is too
small to carry a claim on its own.

**Answer: probably yes, but not confirmed.** ReviewBench gives each PR as a base and a head commit
in a mirror repository, and takes back a list of findings with line ranges. Our pipeline needs
the diff and a checkout of the head, and it produces path + line + body. The two fit. The adapter
skeleton is in `scripts/reviewbench/`. Four open items could still stop a run: (1) the exact
schemas and runner contract are unverified, because this session could not read the ReviewBench
repo; (2) whether the runner's container lets our reviewer reach Nebius; (3) the judge is
billed in real money on Anthropic, not on Nebius credit; (4) TraceHound's $45 spend cap. Details in
§6.

This spike made no model calls, and none of ReviewBench's data is in this repository.

## 1. How the facts were gathered (read this first)

This session's network policy blocked the blog post (github.blog), the leaderboard site
(review-bench.ai) and most news sites. Its GitHub access is limited to `SunnyBagal/tracehound`:
attaching `review-bench/ReviewBench` and running a plain `git ls-remote` of it were both refused.
**Nothing below was read from ReviewBench's own files.** Every fact comes from web-search
summaries of the sources listed in §9. Each fact has one of these labels:

- **[A]** stated in GitHub's announcement or the ReviewBench README, as quoted by search results;
- **[B]** stated in a ReviewBench pull request, or by a third party that read the repo (a forked
  vendoring PR, a research issue, a leaderboard mirror);
- **[U]** not found. The adapter guesses these and keeps every guess in
  `scripts/reviewbench/format.ts`.

Before any run, someone with access must read the corpus manifest, `docs/OFFLINE_EVAL.md`,
`HARNESS.md`, the judging docs and `scripts/try-agent.sh` at a pinned commit, then fix format.ts.

## 2. Findings

### 2.1 URLs and licence

| item | value | label |
|---|---|---|
| Announcement | https://github.blog/ai-and-ml/github-copilot/reviewbench-an-open-benchmark-for-ai-code-review/ (2026-10-05) | A |
| Repository (dataset, rubric, judge, runner) | https://github.com/review-bench/ReviewBench | A |
| Leaderboard | https://review-bench.ai | A |
| Per-repo mirrors | `review-bench/<owner>_<repo>`: each holds every task's base and head commits, so the benchmark still runs if an upstream repo is deleted | A |
| Offline guide | `docs/OFFLINE_EVAL.md` (added in ReviewBench PR #56) | B |
| Repository licence | MIT (README) | A |
| Dataset / golden findings licence | not stated separately | U |
| PR source code | under the licences of the 187 upstream repos | — |

Many forks copy the README word for word (beardedeagle, SanelShabani1995, luin, joahg, …); they
are not the source. `KyleSau/reviewbench` and LangChain's "ReviewBench" are different benchmarks.

**Consequence for this repo:** treat the data the way decision 054 treats `golden_comments`.
Even if the MIT licence covers the golden files, the PR code belongs to 187 repos under their own
licences. Keep the manifest, the golden findings and all per-comment output in the bench folder
outside the repo. Commit counts only. The adapter's fixture is hand-made (§4).

### 2.2 Data format

- Splits: a **25-task test (practice) split** (`corpus/test/test.json` plus 25 golden-findings
  files) and the **full 219-task set** with its manifest and all golden findings public. Vendors
  iterate on the 25, then run the full 219 three times for the final score. **[A]** Whether the 25
  are part of the 219 is **[U]**.
- Manifest entry fields: a vendoring PR checks each golden file against "the manifest entry
  (repo, pr_number, base, head)". **[B]** Other fields (id, title, description, language) are
  **[U]**. format.ts accepts `base`/`head` and falls back to `base_sha`/`head_sha`. When there
  is no `id`, it builds one as `<owner>_<repo>-<pr>`.
- Golden findings: one file per task, "a human-reviewed golden set of code review findings" with
  severity and category dimensions **[A]**. Senior engineers re-labelled them independently and
  agreed with the labels 96.6% of the time **[A]**. Producers (ReviewBench PR #57, 352 true
  positives in the test split): 194 `llm_review`, 153 `ccr` (Copilot code review), 4 human review
  comments, 1 Semgrep **[B]**. A third-party analysis puts LLM-produced golden TPs at about 98%,
  about 45% from Copilot code review and 46% from one model **[B]**.

### 2.3 How a third-party reviewer plugs in

- **Contract: a container image.** The runner starts one fresh container per PR, with fixed
  mounts and environment variables, and checks the findings file the reviewer writes
  **[A]**. `scripts/try-agent.sh` runs an image the way the leaderboard does. It needs docker, git
  and jq, and it fetches each PR's commits from its mirror **[A]**. The runner works only with
  containers: a host-mode `--command` option was added and then removed, because the container is
  the isolation boundary **[B]**. HARNESS.md runs (PR, agent) pairs one after another by default
  **[B]**.
- **What the reviewer outputs:** a findings file per PR in the run's `findings/` directory. The
  judge scores each finding on **{file, start_line, end_line, message}** **[B]**. The file's name,
  its wrapper (a bare array or an object) and any optional fields such as severity or category are
  **[U]**. Reviewers with their own output format can use a sample entrypoint adapter **[B]**.
- **Mount paths and variable names** (where the checkout is, where findings go, whether there is
  network access) are **[U]**. They decide the image's entrypoint, so they are the first thing
  to read.
- **Submission:** you can run and judge offline without registering. Leaderboard submission is
  separate. "ReviewBench covers the judge only for your final submission" **[B]**.

### 2.4 The judge

- **Model:** Claude Sonnet 5 is the official grader. One rubric applies to all submissions, and
  both rubric and judge are published **[A]**.
- **How it is called:** `npm run judge -- --candidate "$run/findings" --provider <provider>
  --model <model-id> --output "$run/scoring/results.json"`, which also writes
  `results.details.json`. The caller picks the provider and model and pays with their own
  credentials **[B]**. Offline, Sonnet 5 runs on an Anthropic (or other provider's) account.
- **What it decides:** a finding counts as a TP only if it is true, relevant and non-trivial.
  *Grounded* precision, recall and F1 use only golden labels. *Augmented* metrics also let the
  judge decide whether unmatched findings are true or false positives **[A]**. ReviewBench PR #58
  adds an opt-in `--exclude-producer` (score with one producer's golden findings left out); it does
  not change leaderboard scoring **[B]**.
- **Calls per PR and tokens per call: [U].** The matching step is at least one call per PR, and
  augmented scoring adds work for unmatched findings, possibly with code context. §5 therefore
  gives three scenarios instead of one number.
- **Price (Sonnet 5):** $2 / $10 per 1M input / output tokens on most aggregators, said to be
  permanent since 2026-08-10, with batch at half price. One guide says $3 / $15. Neither figure
  was checked against Anthropic's pricing page.

### 2.5 Published results

A leaderboard mirror (benchlm.ai, snapshot 2026-10-12) lists these grounded F1 scores:

| tool | grounded F1 | grounded P | grounded R | run date |
|---|---|---|---|---|
| GitHub Copilot code review (Balanced) | 40.1% | 87.8% | 26.0% | 2026-10-01 |
| Devin | 37.0% | | | |
| Qodo | 35.1% | | | |
| Cubic | 27.3% | 85.5% | 16.3% | June 2026 |
| Greptile | 27.2% | 86.1% | 16.2% | June 2026 |

CodeRabbit's grounded numbers did not appear. GitHub ran every entry itself on each vendor's
public product; no vendor ran or verified its own entry. The run dates also differ by months
**[A/B]**. On Martian's online Code Review Bench, a different benchmark with a different metric,
the order is reversed: Cubic is first, and Copilot is around fourth. These numbers are not
comparable with our `golden_comments` F (decision 062): ReviewBench uses different data, a
different judge and different metrics.

### 2.6 Language mix

| language | full set (219) | share | test split (25) |
|---|---|---|---|
| TypeScript | 68 | 31.1% | 5 |
| Python | 41 | 18.7% | 4 |
| C# | 25 | 11.4% | ? |
| Go | 19 | 8.7% | 3 |
| JavaScript | 15 | 6.8% | ? |
| Other (14 languages) | 51 | 23.3% | ? |

**[A/B]** The test split's other languages include Rust, Java, Jupyter Notebook, Kotlin, PHP,
Ruby, Shell and Swift. The full set's per-language counts within "Other" were not found.

**What this means for TraceHound.** review-diff-v1 sees only the diff and works for any language.
review-ctx-v1 finds the changed names with line patterns (`src/review/names.ts`) for Python, Go,
Java/Kotlin/Scala, Ruby and TS/JS; any other extension gets all the patterns at once, so it misses
more names. Of the 219 PRs, TS + JS is 83 (37.9%). With Python and Go it is 143 (65.3%), plus
whatever Java, Kotlin and Ruby add from "Other". C# (25 PRs) has no pattern. So the context half
of the pool is weakest on about a third of the set. Our only blind result so far is on one
TypeScript repo (Cal.com). Report results per language, and do not read a full-set F as a
TypeScript F.

## 3. Adapter design

```
ReviewBench task (manifest entry: repo, pr_number, base, head [, title, body, language])
  │  local clone of review-bench/<owner>_<repo>; git diff base...head  (prDiff)
  ▼
ReviewerInput {title, body, number, diff}            ← taskToInput   (`prepare`)
  │  pool-verify-v1, unchanged, at `head`:
  │    tracehound review     --pr input.json                         (review-diff-v1)
  │    tracehound review-ctx --pr input.json --repo <clone> --head <head>  (review-ctx-v1)
  │    pool (059's rule) → tracehound verify-ctx --kept kept.json    (verify-ctx-v1)
  │  = packages/action/src/pipeline.ts runPipeline, or run-test-set.ts pipeline()
  ▼
kept.json {comments: [{path, line, body}], verify: …}
  │  toSubmission: start_line = end_line = line, message = body;
  │  line null or empty body → dropped and counted              (`submit`)
  ▼
findings/<task id>.json  [{file, start_line, end_line, message}]  → npm run judge --candidate findings/
```

Choices:

- **The diff is `base...head` (from the merge base),** which matches what the Action gets from
  GitHub's `application/vnd.github.diff`. If the manifest's `base` is already the merge base, it is
  the same as `base..head`.
- **The title comes from the manifest when there is one.** Otherwise `owner/name#pr` stands in. If
  the manifest has no title or description, fetch them once when building the run's inputs:
  review-diff-v1's prompt shows both, so a run without them is not the reviewer we froze.
- **A finding becomes a one-line range.** Our findings have one line, and the reviewers already
  drop findings that are not on a new-side diff line. File-level (null-line) findings are dropped
  and counted, because the judge format seems to need lines **[U]**.
- **No pipeline change.** The adapter only writes the `--pr` file the CLIs already read, and reads
  the `--kept` file verify-ctx already writes. pool-verify-v1 stays as frozen at
  `review-freeze-1`.
- **Inside the ReviewBench container:** the entrypoint maps the runner's mounts and variables to
  `prepare` → pipeline → `submit`. This step is not written: it depends on the unverified mount
  paths and variable names (§2.3). The image needs Node ≥ 24, git, this repo and `NEBIUS_API_KEY`.
- **Subset:** `stratify` allocates by language with largest remainder, then orders tasks within each
  language by sha256(seed + id). The subset depends only on the seed, not on manifest order.

## 4. What was built (`scripts/reviewbench/`)

| file | role |
|---|---|
| `format.ts` | ReviewBench's shapes and every unverified guess: task fields, finding fields, mirror URL, findings file name; `parseTask`, `parseManifest` |
| `adapter.ts` | `prDiff`, `taskToInput`, `toSubmission` (+ drop counts), `parseKept`, `stratify`, `languageCounts` |
| `cli.ts` | `prepare` / `submit` / `subset`; no model, no network; stdout prints counts and ids only; never overwrites a file |
| `adapter.test.ts` | 11 tests on a hand-made 2-PR fixture (`fixtures/`) and a temporary git repo |
| `vitest.config.ts`, `test-setup.ts`, `tsconfig.json` | the folder's own test and typecheck setup (network off, git env scrubbed) |

```
pnpm exec vitest run --config scripts/reviewbench/vitest.config.ts   # 11 passed
pnpm exec tsc --noEmit -p scripts/reviewbench/tsconfig.json          # clean
```

`pnpm test` and `pnpm typecheck` stay green, but they do not cover this folder: it is not a
workspace package, and this spike was limited to `scripts/reviewbench/` and this doc. Wiring it
into CI needs a one-line change elsewhere, which is left for when the adapter is adopted.

## 5. Cost of one run

### 5.1 Our side (Nebius, pool-verify-v1)

Measured per PR: median $0.027–$0.043 over four runs, max $0.247 (062 dev 2r, 059). On
the brief's range of $0.03–$0.05 per PR:

| | 25 (test split) | 60 (stratified) | 219 (full) | 219 × 3 (official final) |
|---|---|---|---|---|
| pool-verify-v1 | $0.75 – $1.25 | $1.80 – $3.00 | $6.57 – $10.95 | $19.71 – $32.85 |
| with 5× voting | $3.75 – $6.25 | $9.00 – $15.00 | $32.85 – $54.75 | $98.55 – $164.25 |

ReviewBench diffs may be larger than `golden_comments` diffs. Cost grows with diff chunks and
findings, and one dev PR already cost $0.25. Budget a tail above the range. All of this is
Nebius credit, at the third-party prices in `config/prices.json`.

**Wall time:** median 86–158 s per PR, max 777 s (062). So 219 PRs one after another take about
8 hours per run, and 60 PRs take about 2 hours. The session's 2-hour limit on background commands
killed dev run 2 in 062. A full run must run detached and be able to resume.

### 5.2 Their side (judge: Claude Sonnet 5)

Calls and tokens per PR are **[U]**, so this table gives three scenarios. For calibration, our
bench-judge-v1 averaged 1,653 input and 650 output tokens per call, one call per PR (212 calls,
scorer-validation). ReviewBench's golden sets are larger (the test split has about 14 golden TPs
per PR, if PR #57's 352 cover its 25 tasks), and augmented scoring adds work for unmatched
findings.

| scenario | per PR (in / out tokens) | $/PR at $2/$10 | 25 | 60 | 219 | $/PR at $3/$15 | 60 | 219 |
|---|---|---|---|---|---|---|---|---|
| A. one matching call, no code | 4k / 1.5k | $0.023 | $0.58 | $1.38 | $5.04 | $0.035 | $2.07 | $7.56 |
| B. matching + one validity call per unmatched finding with a diff excerpt | 30k / 5k | $0.11 | $2.75 | $6.60 | $24.09 | $0.165 | $9.90 | $36.14 |
| C. one call per finding with full diff/context and long reasoning | 150k / 20k | $0.50 | $12.50 | $30.00 | $109.50 | $0.75 | $45.00 | $164.25 |

For three official runs, multiply the 219 column by 3. Batch pricing, if the judge supports it,
halves it.

**Who pays:** this is real money on an Anthropic account. Our hackathon credits are Nebius only,
so this spend is outside `src/llm/client.ts`'s budget and ledger. Reportedly, ReviewBench pays
for the judge only on the final submission **[B]**. Running the judge offline on a Nebius model
would cost almost nothing, but the scores would not be comparable with the leaderboard. That is
fine for development and not for claims.

### 5.3 Totals for one run (our side at $0.03–$0.05 + judge at $2/$10)

| | 60 PRs | 219 PRs |
|---|---|---|
| single run, judge A | $3.18 – $4.38 | $11.61 – $15.99 |
| single run, judge B | $8.40 – $9.60 | $30.66 – $35.04 |
| single run, judge C | $31.80 – $33.00 | $116.07 – $120.45 |
| 5× voting, judge B | $15.60 – $21.60 | $56.94 – $78.84 |

**Spend cap:** `TRACEHOUND_BUDGET_TOTAL_USD` = 45, and the ledger stood at $17.76 after 062.
That leaves about $27 of Nebius budget. One full run fits; three full runs at the top of the range
($32.85) do not; 5× voting on the full set does not. The judge's spend does not count against
this cap.

## 6. Blockers, in the order to clear them

1. **Read the repo (needs the owner).** Allow `review-bench/ReviewBench` in a session, by adding
   it to the environment or approving `add_repo`, then pin a commit and check every [U] in this
   doc against it: manifest fields, the findings schema, mounts and variables, network policy,
   calls per PR. Fix `format.ts`; nothing else in the adapter should need to change.
2. **Network from the reviewer container.** pool-verify-v1 calls Nebius on every stage. If the
   runner's container has no egress (the repo calls the container its isolation boundary), our
   reviewer cannot run inside it. The way around it is to run the pipeline outside the container
   and only write files in it, which may not be accepted for a leaderboard entry.
3. **A judge account and budget.** We need an Anthropic key, and the owner must agree to the
   spend (scenario B: about $7 for 60 PRs, about $24 for 219). Measure the real tokens per PR on
   the 25-task split before committing to more.
4. **Nebius cap.** About $27 is left under the $45 total cap. Pick the run size accordingly, or
   raise the cap explicitly.
5. **Pre-registration.** pool-verify-v1 is frozen (`review-freeze-1`). A ReviewBench run is a new
   test and needs a 061-style plan first: rows, seed, subset, judge, predictions, cap, and what
   counts as a void run.
6. **Wall time.** Run detached with resume (§5.1).

Things that are not blockers but limit what the result means: the golden set is mostly
LLM-produced and nearly half comes from Copilot code review, which favours reviewers that think
like Copilot (§2.2). Leaderboard entries were run by GitHub, not by the vendors. And our context
reviewer is weaker on about a third of the languages (§2.6).

## 7. Recommended subset

1. **First, the 25-task test split.** It is the published practice set, so others' offline numbers
   are comparable. It tests the full contract (image, findings, judge) and measures the judge's
   real tokens per PR. Cost: about $1 ours plus $0.6–$12.5 judge.
2. **Then a stratified 60 of the 219**, with the seed fixed in the pre-registration (and the 25
   excluded if they turn out to be part of the 219). With `stratify` the allocation is TS 19, Other 14,
   Python 11, C# 7, Go 5, JS 4 (largest remainder over 68/51/41/25/19/15). That is six times our
   10 blind PRs, and with about 14 golden findings per PR its n is far above 23. One run costs
   $1.80–$3.00 ours plus $1.38–$30 judge (scenario B about $6.60). Run it twice to see the spread
   (062 showed that single runs move a lot).
3. **Run the full 219 × 3 only for a leaderboard entry,** where ReviewBench reportedly pays for
   the judge. Our side is $20–$33, which does not fit the remaining cap at the top of the range.

## 8. Not done in this spike

No ReviewBench data was downloaded. No model was called, so no tokens were measured. The
container entrypoint was not written, and no decision record was added (this job was limited to
`scripts/reviewbench/` and this file). When the plan is adopted, the decision belongs in
`docs/decisions.md`.

## 9. Sources (as returned by web search, 2026-10-18)

- GitHub blog announcement — https://github.blog/ai-and-ml/github-copilot/reviewbench-an-open-benchmark-for-ai-code-review/
- Repository — https://github.com/review-bench/ReviewBench ; PRs #56 (offline evaluation, try-agent.sh, judging CLI), #57 (golden set composition by producer), #58 (`--exclude-producer`)
- Leaderboard — https://review-bench.ai ; mirror https://benchlm.ai/benchmarks/reviewbench
- Third-party analysis — https://github.com/JPHutchins/code-review/issues/282
- Vendoring of the test split — https://github.com/beiyanpiki/pir/pull/76
- Coverage — https://thenewstack.io/github-reviewbench-code-review/ , https://www.devx.com/coding/what-is-reviewbench-ai-code-review-benchmark/ , https://www.heise.de/en/news/GitHub-ReviewBench-Benchmark-for-AI-assisted-Code-Reviews-11479094.html , https://news.lavx.hu/article/github-releases-reviewbench-an-open-benchmark-for-evaluating-ai-code-review-agents
- Sonnet 5 pricing — https://anotherwrapper.com/tools/llm-pricing/claude-sonnet-5 , https://www.chatbase.co/blog/claude-sonnet-5 , https://www.verdent.ai/guides/claude-sonnet-5-pricing-reality-check
- Martian Code Review Bench — https://codereview.withmartian.com/
