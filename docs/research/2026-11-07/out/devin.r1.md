# devin r1 — re-audit of my plan (PR #71) against HEAD `b498647`

**TL;DR**
1. Nothing in the plan has landed. §5.1 is partly built (PR #67 flags: fresh retry, lenient parser, cacheTruncated, all off and unmeasured). §5.2 is partly built (source labels, `capOrder`), and §5.0 and §5.3–5.7 are not started.
2. "Verifier cuts dev recall 61.5 → 46.6" is right as a recall number (TP 45/46 → 35/34 of 74). Framing it as the main loss is not supported: on 3.5 the verifier-on/off ΔF intervals include 0 (−1.6 [−10.0, +5.5]; −5.4 [−14.7, +3.3]) and x1 is about 0.
3. "Graph unused in the review path" is still true at HEAD. The Action builds snapshots and change sets only for the viewer's data branch.
4. Stale because Cal.com is spent (069b): the "top 2 in counts" target (§0), the Cal.com claims rule (§0) and "one pre-registered Cal.com run at the end" (§5.0). §1.4 used a Cal.com count to motivate a change and should use a dev count instead.
5. New ranking: (1) 5.1 reliability, whose main metric is a failure count and which is mostly cheap to replay. (2) A $0 replay of "both skips the verifier", pending claude's counts. (3) Build a TS dev set **plus a fresh held-out set**. (4) 5.3 symbol context. (5) 5.4 analyzers. (6) 5.7 rules. (7) 5.5 specialists. (8) 5.6 sandbox.
6. The TS dev set is still the blocker for 5.3 and 5.4. The bigger blocker is that **no test set is left**, so every future claim needs a new held-out set. One mining pipeline should build both, split by repo.
7. Proposal: 6–8 public TS app repos that are in no benchmark. Bugs are labelled SZZ-style from later fix commits, never from review comments. Size: 40 dev PRs + 40 held-out PRs. About $18 of the $43.52 left covers one 2-arm A/B and one held-out final.
8. Honest limit: with about 70 goldens, only effects of roughly 8–10 F points or more can be separated from noise (same as the current dev set). Smaller levers stay hypotheses.
9. §6 "don't" list: all still valid. Add: per-PR cap and 2-of-3 vote (levers-v2), any further Cal.com run (069b).
10. Open: claude's dev-only counts (comms/devin-to-claude-1.md) decide whether ranks (1) and (2) can be screened at $0.

## 1. Item-by-item status at HEAD

| item | status | evidence |
|---|---|---|
| 5.0 measurement setup | **not started**; A/B practice partly exists | No TS dev set (CONTEXT.md). `levers-v2.md` already uses offline replay + paired PR bootstrap (`levers-v2.md:9`). "Single Cal.com run at the end" is no longer valid: `decisions.md:3449-3450` ("no further Cal.com run is allowed"). |
| 5.1a fresh retry, reasoning off | **built, off, unmeasured** | `review.ts:170-171, 236-237`; `post-freeze-fixes.md:9`. No Action input exposes it (`post-freeze-fixes.md:5`). |
| 5.1b lenient parser | **built, off, unmeasured** | `post-freeze-fixes.md:10`. |
| 5.1c split a failed chunk and retry halves | **not started** | No split/halve logic in `src/review/*.ts`. Only `recall/chunk.ts` splits, and that is recall-v3. |
| 5.1d keep null-line findings | **not started** (the flag does not reach it) | `review.ts:152-153` still drops a non-integer `line` as `malformed`. `poolNullLines` acts after that drop, so it changes nothing for today's reviewers (`post-freeze-fixes.md:17`). |
| 5.1 observability | **done** | `attemptsDetail` (finishReason, reasoning/output tokens); `scripts/bench/truncation-scan.ts` exists but has **not been run** (`post-freeze-fixes.md:14-15`). |
| 5.2a `both` skips the verifier / counter-quote drop | **not started** | Sources are computed (`pipeline.ts:22, 96, 157`) and carried to the output (`pipeline.ts:188-197`), but the verifier input ignores them. |
| 5.2b agreement in ordering | **partly** (cap only, off) | `capOrder: agreement-first` (`action.ts:52-53, 297`). levers-v2 tested agreement-ranked caps: no gain on verified (`levers-v2.md:23`). |
| 5.2c three-way verdict | **not started** | Needs a new verifier prompt version and a decision entry. |
| 5.2d similarity-based dedupe | **not started** in the product path | Word-set Jaccard exists only in `recall/reduce.ts:8` (recall-v3) and `learn/fingerprint.ts:4-5`. |
| 5.3 symbol k-hop context | **not started** | `src/review/` imports nothing from the graph, `changes`, `contracts/` or ts-morph (grep at HEAD: 0 hits). |
| 5.4 analyzers in the bench path, deps installed | **not started** | `packages/action/src/contracts.ts` has no install step. In `scripts/bench/`, only `evidence.ts` (065 arm C, 0 dev findings) calls contracts. ESLint/Semgrep would be new deps and need owner approval. |
| 5.5 triggered specialists | **not started** | No `review/specialists/`. |
| 5.6 sandbox confirmation | **not started** | `harness/reproduce.ts` is not wired into the review path. |
| 5.7 repo rules into prompts | **not started** | `learn/conventions.ts` is reachable only as a CLI command (`bin.ts:28`). No prompt imports it. |
| §6 don'ts | **all still valid** | Add: per-PR cap and 2-of-3 vote (`levers-v2.md:32, 61`; results.md §7), another Cal.com run (069b). |

## 2. Claims that are now stale or wrong

**(a) "The verifier costs recall … the biggest recall drain (−15 R pts dev)" (§0, §1.5, §1.8).**
- *Arithmetic correct.* 3.5 runs 7r/8: raw TP 45/46 → verified 35/34 of n = 74, so R 60.8/62.2 → 47.3/45.9, means 61.5 → 46.6 (`levers-v2.md:45-46`).
- *Implication wrong or unsupported.* The verifier also raises P (45.9/50.0 → 54.7/54.8). The F effect is inconclusive: v1 ΔF −1.6 [−10.0, +5.5] and −5.4 [−14.7, +3.3]; x1 ΔF +0.84 [−8.49, +9.59] and −0.41 [−7.99, +6.98] (`levers-v2.md:45-46, 111-112`). So "it drains recall" is a fact, and "removing it or loosening it raises F" is an open hypothesis.
- *Outdated support.* The plan's mechanism numbers (62 of 93 FP dropped, 10 of 32 TP dropped) are 058's: 3 Super, review-diff-v1 only (`decisions.md:2840-2841`).
- On 3.5 the filter is less selective. Net of re-judging, it removes 45%/39% of FPs against 22%/26% of TPs (7r: FP 53→29, TP 45→35; run 8: FP 46→28, TP 46→34). 058 removed 67% of FPs against 31% of TPs. Inference: with a more precise reviewer (raw P 48.0), the verifier adds less.
- §1.5's "drops a TP it simply cannot confirm" is a mechanism guess: [UNVERIFIED], not measured.

**(b) "The ts-morph graph, `changes` and `dependents` are not used anywhere in the review path" (§1.3.5).**
- Still true for generation and verification. Grep of `packages/analyzer/src/review/` for graph, snapshot, changes, contracts, dependents and ts-morph gives 0 hits.
- One nuance the plan didn't state: the Action's data step runs the analyzer and `changes` (`packages/action/src/data.ts:9, 182-210`) to write the `tracehound-data` branch for the viewer (#65, "graph as the review surface"). That is presentation only; no finding depends on it.

**(c) Claims that assume Cal.com can be re-run.**
- §0 "What top 2 means in counts": the arithmetic is right, but the target can no longer be measured. Drop it as a goal.
- §0 claims rule: still correct for the existing numbers, moot for new ones. Every new claim needs a new held-out set.
- §5.0 "a pre-registered single Cal.com run only at the end": **invalid** (069b; CONTEXT.md "Cal.com is spent").
- §1.4 "on Cal.com v2, 11 of 30 comments were judged duplicates" was used to motivate dedupe. That is reasoning from test-set results toward a change. Replace it with a dev duplicate count (not checked here).
- §1.2's "1 of 10 Cal.com PRs had both chunks fail" is a published count. The dev count (7 of 40 PRs per run, results.md:145) is enough motivation, so use only that.

**(d) Measurement claims in §5 that were too pessimistic.**
- §5.1 "replay not possible because it changes generation" is partly wrong. The cache stores any non-empty reply, including invalid JSON (`client.ts:301`, `cacheTruncated` default true). The lenient parser can therefore be replayed on cached failed replies at $0 generation cost. Only recovered findings need verifier and judge calls.
- `retryOnLength: fresh` needs new calls, but only on failing chunks (about 7 of 40 PRs per run).
- §5.2 "offline replay" is right, and cheaper than stated for variant (a). Pool-raw is already judged per run, and `levers-v2.ts:61-68` already rebuilds both/diff/ctx tiers, so "verified ∪ `both`" costs $0. Caveat: judge labels are reused across comment sets (levers-v2 did the same).

**(e) Minor.**
- §2 competitor facts were not re-checked today: [UNVERIFIED as of 2026-11-07].
- §4's Postgres/Drizzle storage line is off-scope (a new dep, and nothing needs it).
- §6's reason against embeddings ("needs a new provider") is [UNVERIFIED]. Token Factory may serve embedding models. The measured reason is that nothing has been measured; Greptile's post is the published one.

## 3. Re-ranking with what is known now

Inputs: $43.52 left. Dev F spread at temperature 0 is larger than every lever measured (results.md:210). The 40 dev PRs have been reused by about 17 decisions (`levers-v2.md:3`). There is no test set.

| rank | item | why here | first step, cost |
|---|---|---|---|
| 1 | **5.1 stop losing chunks** (lenient parser → fresh retry → split halves → null-line rescue) | Language-agnostic. The main metric (CHUNK_FAILED count, PRs with 0 findings) is a count, not a judged F, so it is not "tuning on dev" in the selection-bias sense. 7 of 40 PRs per run are affected, 3 of 40 end with no findings (068). Not a retry of any loss. | Run `truncation-scan.ts` and replay the lenient parser on cached replies: $0. Fresh retry and splitting: new calls on failed chunks only, guess <$1 per dev run. Gate: failures down, and dev F not down beyond its interval. |
| 2 | **5.2a `both` skips the verifier** (only the routing; no 3-way prompt yet) | Different from the lost ideas. Agreement-ranked caps (levers-v2) and the agreement-only set (058: P 57.7, R 20.3) both *restricted* output; this *adds back* verifier-dropped `both` findings. Concrete reason it could differ: it recovers TPs the verifier drops (about 10–12 per 3.5 run). Risk: same-family reviewers, so errors are correlated. | $0 replay on 7r/8 plus the 3 Super runs, but only if claude's Q1 counts show `both` TPs are a real share of the dropped TPs. A result is a hypothesis only (overused dev set). 5.2c/d wait for fresh data. |
| 3 | **5.0 TS dev set + fresh held-out set** (section 4) | Needed for 5.3 and 5.4, and for *any* future claim now that Cal.com is spent. Effort is mostly mining and labelling, not tokens. | Mining $0 (GitHub API). One A/B about $12, one held-out final about $6. |
| 4 | 5.3 symbol-resolved context (TS only) | The prior for "more context" is weak: 057 F flat, 050 graph no help, 0 graph tool calls in 80 runs. The concrete new reason is that word-grep references reached the model in only 12 of 48 chunks (058 rejected (a), `decisions.md:2859`) and symbol resolution changes *which* references arrive. Test first on a cheap cross-file seeded probe (section 4) before a full A/B. | After rank 3. |
| 5 | 5.4 tsc/typed rules with deps installed | 065's 0 findings were on non-TS repos and say nothing either way. Needs owner approval for any new dep; tsc-only needs none. | After rank 3; run in hint mode first. |
| 6 | 5.7 repo rules into prompts | Product value; expected benchmark effect small (guess). Needs new prompt versions. | Any time; not a benchmark lever. |
| 7 | 5.5 triggered specialists | 070's precedent (P 20.9) is the closest loss. Needs a concrete reason beyond "narrower than 070", which I don't have yet. | Park. |
| 8 | 5.6 sandbox confirmation | L effort, low expected benchmark gain (guess), large wall time. | Park. |

Not proposed again: per-PR caps, any vote, thresholds, quote gates, bigger models, broad lenses (losses list). Temperature 1.0 (NVIDIA's recommendation, results.md:211-214) is an untested setting, not a lost idea. I don't rank it because it changes every stage and needs ≥3 runs per arm, which the budget cannot cover alongside rank 3.

## 4. Proposal: a blind-safe TS dev set and a fresh held-out set

- **Repos.** 6–8 public TypeScript application repos with an active PR history, none of them in `golden_comments` (cal.com, sentry, grafana, keycloak, discourse). Also excluded: Recall, Linea, TraceHound and CEX (held-out seeds and harness repos), and ReviewBench's repos (list not checked here).
  - Candidates [UNVERIFIED for licence and PR volume]: documenso, formbricks, twenty, dub, outline, excalidraw, trpc, immich.
  - Split **by repo**: about 4 repos for dev (40 PRs) and 3–4 for held-out (40 PRs). Freeze the held-out list (sha256 of the PR list committed) before any tuning. Tuning sessions never open it: the Cal.com discipline, but with a fresh set.
- **Selection (mechanical, $0).** Merged PRs whose changed lines are ≥60% TS/TSX, with 50–2,000 changed lines, merged as recently as possible to limit training contamination (cutoffs [UNVERIFIED]).
  - A PR qualifies when a later commit or PR within 90 days matches fix|bug|regression|revert, **and** the lines it deletes or modifies `git blame` back to the candidate PR's commits (SZZ-style).
- **Labels.** Each label is a golden: the path and new-side line(s) in the candidate PR, plus a one-sentence description written from the **fix commit's diff and message only**.
  - The fetch script never downloads PR review comments from any bot or human. That avoids copying tool text and avoids 060's "built from tools' comments" bias.
  - Severity is Medium when the fix changed behaviour (it touches a test, or links an issue); otherwise the label is dropped.
  - A second labeller (owner, or a session with no reviewer access) checks a 20% sample, and the agreement rate is reported.
- **Known bias.** SZZ labels are incomplete: real bugs that were never fixed get counted as FP. So absolute P is not comparable to the Cal.com table. Compare arms on paired ΔF and ΔR, and add 060's augmented precision (validity-v1, `src/bench/validity.ts`) as a secondary.
- **Secondary probe for 5.3 (optional).** 30 *new* seeds, each a one-line change inside a real PR hunk that breaks a contract used only *outside* the diff (caller, type, schema, route).
  - Exact labels, cheap. It tests the mechanism, not the benchmark.
  - It lives outside the repo, and it must not reuse recall-seeded, linea-seeded or tracehound-seeds.
- **Storage and blindness.** The data lives in a new sibling directory outside the repo (needs owner approval for the path); only counts go into the repo. The fetch script refuses calcom/cal.com, the four other benchmark repos and the held-out-seed repos, and AGENTS.md's forbidden paths are untouched.
- **Size and noise.** About 40 PRs gives roughly 60–80 goldens if yields resemble the current dev set (not measured; the first mining pass measures it). The current dev set (n = 74) gives per-run ΔF intervals about ±8–10 points, so only large effects will separate. State that in advance.
- **Cost.** One 2-arm A/B, 2 runs each: 40 × 2 × 2 × $0.0743 ≈ $11.9. Held-out final, 1 run per arm: ≈ $5.9. Judging is about $0.0005 per PR per row (Cal.com run 4: $0.0142 for 10 PRs × 3 rows), so negligible. Total ≈ $18 of $43.52. Labelling time is not measured.

## 5. Open items

- `comms/devin-to-claude-1.md` asks for: Q1 pool-source split of raw/verified TP/FP on 3.5 dev; Q2 the CHUNK_FAILED cause split + truncation-scan counts. Both are dev-only. Unanswered at the time of writing; ranks 1–2 assume the answers make $0 screening possible.
- Not checked: the plan's competitor facts (§2), ReviewBench's repo list, and candidate repos' licences and PR yield.
