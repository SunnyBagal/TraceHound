# TraceHound vs CodeRabbit and Greptile on dev: the E1 table (decisions 076g, 076j, 076r, 076t)

Spec: `docs/specs/E1.md`. Protocol: `docs/eval/ts-protocol.md` revision 13. Numbers: bunny's E1 report
(`run/out/bunny.e1.md`, test-set repo), every row recounted independently by grok (`run/out/grok.e1-check.md`: MATCH on
every row, both judges, location hits, comments, costs and pairs). Files: `~/Projects/tracehound-runs/dev/{r1,p1,e1}/`
(outside the repo). Dev case ids may appear here; no comment text and no label text does.

**Label for every table on this page, and for every copy of a number from it:** dev, selection set, one draw, one judge
of record, not hand-checked; dev exposure 10 of 31 (grok).
- The judge of record is bench-judge-v1 (Nemotron 3 Super, reasoning on, decision 060). x1 is printed beside it and
  changes nothing.
- x1 is bench-judge-x1 on `Qwen/Qwen3-30B-A3B-Instruct-2507`, reasoning off, with the same frozen prompt (decision 076r
  item 1).
- Dev exposure 10 of 31 means that 10 of the 31 dev bug fixes could be reached from another dev case's branch on the
  forks while the tools reviewed. That is grok's count (`run/out/grok.dev-exposure.md`). The exposure list is
  `run/out/grok.dev-exposure.ids.json`, sha256 `5374b210…`.

A0, CodeRabbit and Greptile are the comparison. A1, A2 and the Claude rows are **report-only**: they adopt nothing,
change nothing in the freeze, and A0 stays the frozen primary (decision 076g item 1).

**Stop/go reading: RETHINK** (decision 076t). d = 19 − 12 = 7 on v1, and CodeRabbit completed 40 of 40. Under decision
076k item 4 this **does not gate the tag** or the held-out run. It pauses company work (pricing, demo) until the
held-out result.

## 1. What was run

| step | what | commit / when | money |
|---|---|---|---|
| R1 | A0 = `pool-verify-v1` on `nvidia/Nemotron-3.5-Super-VL`, attempts 2, comment cap 15. 40 dev cases (31 bug, 9 clean), one draw, reviewer cache reads off | TH `346fc7a` (batch 1) and `9975043` (batches 2–5 and the rerun; no code change between the two). 14 Nov 2026, 08:01–13:15Z | Nebius, job $2.82003 |
| P1 | CodeRabbit and Greptile reviews of the same 40 dev pull requests on the forks (`docs/specs/P1.md`) | collection 16 Nov 20:49Z, 40/40 completed each | $0 (CodeRabbit plan; Greptile credits) |
| A1, A2 | Replays from R1's lineage, no new model call. A1 = pool-raw, A2 = review-diff-v1 alone, each capped at 15 comments in its own order | from R1's records (`arms/replay.json`) | none |
| Claude rows | R1's cases, prompts and pipeline unchanged, `pool-verify-v1` arm, default sampling (decision 076j item 1): Haiku 5.5 two draws on 40 cases, Sonnet 5.5 on R1 §7's 8 bug cases | Haiku `9bedd9d` / `580ede7`, Sonnet `76757e9`, 14 Nov 2026 | Sunny's own Anthropic money |
| judging | bench-judge-v1 and bench-judge-x1, `--concurrency 1`, one paid process at a time, in L1's one envelope (`L1 L0=47.88030`, written once on 14 Nov) | v1 at TH `d15bbdd`, x1 at `742574d` (the Qwen3-30B price entry, `86bb9eb`). 14 Nov 14:57–15:14Z (076j), 16 Nov 23:31:13–23:41:37Z (E1) | Nebius, L1 $0.14367 of $0.40 |

- Judging: 12 E1 processes plus 7 under decision 076j. v1 is reused from R1 for A0 and from 076j for the Claude rows.
  0 `JUDGE_FAILED` in every detail file, and all requests to Nemotron 3 Super and Qwen3-30B succeeded.
- The 235B x1 details of 076j (`<row>.x1.json`) are kept on disk and not used here. Every x1 number on this page is the
  30B detail (`<row>.x1q30.json`).
- Order of events (E1 §0 item 1): protocol revision 10 registered the pooled analysis and the stop/go rule. It was
  committed at 07:52:05Z on 14 Nov (`95ddd0a`) and merged at 13:18:39Z (`a2dda87`), before E1's first judge call
  (14:57:06Z). R1's own A0 v1 judging (13:14:41–13:15:21Z) came after that commit and 3 minutes before the merge.

## 2. R1 (A0's run)

| item | count |
|---|---|
| Cases | 40 attempted, 40 ok (official), 0 failed, 0 cap, 0 unstarted. 6 cases failed in batch 1 on a local network outage and were rerun once, all ok |
| Chunks | 84. `CHUNK_FAILED` 1 of 42 in the diff reviewer (`read ETIMEDOUT`) and 1 of 42 in the ctx reviewer (invalid JSON after one retry) |
| Empty reviews (0 comments) | 19 of 40 |
| Cost per case, official attempt | mean $0.0567, median $0.0445, max $0.2232. Total $2.26957 |
| Runner spend, every attempt | $2.80987, including $0.54030 of upper-bound charges on batch 1's failed attempts |
| Wall time per case (official) | median 101.5 s, max 358 s |

## 3. The dev table

All 40 dev cases: 31 bug, 9 clean. **C** is the number of bug cases caught (judged), with a Wilson 95% interval (no
continuity correction). **H** is location hits (a comment within ±10 lines of a labelled location). **M** is counted
comments per case over the 40 cases.

### 3a. Catches, both judges, all 31 and the 21 unexposed

*dev, selection set, one draw, one judge of record, not hand-checked; dev exposure 10 of 31 (grok). A1, A2 and the
Claude rows are report-only. The Claude rows are Haiku 5.5 (40 cases, two draws), Sunny's own money.*

| row | C v1 /31 | C x1 /31 | C v1 /21 unexposed | C x1 /21 unexposed | H /31 | H /21 |
|---|---|---|---|---|---|---|
| **A0** (pool-verify-v1) | **12** (23.7–56.2%) | 14 (29.2–62.2%) | 10 (28.3–67.6%) | 12 (36.5–75.5%) | 9 | 7 |
| **CodeRabbit** | **19** (43.8–76.3%) | 22 (53.4–83.9%) | 15 (50.0–86.2%) | 16 (54.9–89.4%) | 18 | 13 |
| **Greptile** | **18** (40.8–73.6%) | 18 (40.8–73.6%) | 15 (50.0–86.2%) | 15 (50.0–86.2%) | 17 | 13 |
| A1 (pool-raw), report-only | 13 (26.4–59.2%) | 17 (37.8–70.8%) | 11 (32.4–71.7%) | 15 (50.0–86.2%) | 11 | 9 |
| A2 (review-diff-v1), report-only | 13 (26.4–59.2%) | 18 (40.8–73.6%) | 11 (32.4–71.7%) | 16 (54.9–89.4%) | 11 | 9 |
| Haiku 5.5 draw 1, report-only | 14 (29.2–62.2%) | 16 (34.8–68.0%) | 10 (28.3–67.6%) | 12 (36.5–75.5%) | 13 | 9 |
| Haiku 5.5 draw 2, report-only | 11 (21.1–53.1%) | 11 (21.1–53.1%) | 9 (24.5–63.5%) | 9 (24.5–63.5%) | 9 | 7 |

On the 10 exposed cases, v1 catches were: A0 2, CodeRabbit 4, Greptile 3, A1 2, A2 2, Haiku 4 and 2. Under x1: 2, 6,
3, 2, 2, 4 and 2. The 21-case columns are descriptive. They replace neither the 31 nor the stop/go rule (protocol
revision 13).

**Sonnet 5.5, R1 §7's 8 bug cases (5 unexposed), report-only, Sunny's own money.** *Same label. It is never presented as
a 31- or 21-case row: its 32 missing cases would count as misses.*

| row (8 bug cases) | C v1 /8 | C x1 /8 | C v1 /5 unexposed | C x1 /5 unexposed | H /8 |
|---|---|---|---|---|---|
| Sonnet 5.5 | 2 (7.1–59.1%) | 4 (21.5–78.5%) | 1 (3.6–62.4%) | 3 (23.1–88.2%) | 2 |
| A0 on the same 8 | 3 (13.7–69.4%) | 4 (21.5–78.5%) | 3 (23.1–88.2%) | 4 (37.6–96.4%) | 2 |

### 3b. Completion, comments, clean cases, cost

*dev, selection set, one draw, one judge of record, not hand-checked; dev exposure 10 of 31 (grok). A1, A2 and the
Claude rows are report-only. The Claude rows are Haiku 5.5 (40 cases, two draws) and Sonnet 5.5 (8 bug cases), Sunny's
own money.*

| row | completed | reviews with 0 inline comments | M mean / median / max | comments on the 9 clean cases | cost per case: mean / median / max |
|---|---|---|---|---|---|
| **A0** | 40/40 (official; 6 rerun once) | 19 | 1.075 / 1 / 5 | 1 | $0.0567 / $0.0445 / $0.2232 (official attempt). Every attempt: $0.0702 / $0.0511 / $0.4373 |
| **CodeRabbit** | 40/40 (P1 status file) | 9 | 3.075 / 2.5 / 10 | 8 | $0 (plan) |
| **Greptile** | 40/40 (P1 status file) | 7 | 2.850 / 3 / 10 | 9 | $0 (credits) |
| A1, report-only | 40/40 (replay) | 14 | 1.700 / 1 / 8 | 3 | none of its own (R1's run) |
| A2, report-only | 40/40 (replay) | 14 | 1.425 / 1 / 7 | 3 | none of its own (R1's run) |
| Haiku 5.5 draw 1, report-only | 40/40 | 18 | 0.900 / 1 / 4 | 1 | $0.0076 / $0.0071 / $0.0249 |
| Haiku 5.5 draw 2, report-only | 40/40 | 24 | 0.800 / 0 / 4 | 0 | $0.0076 / $0.0070 / $0.0247 |
| Sonnet 5.5 (8 bug cases), report-only | 8/8 | 4 | 1.500 / 1 / 4 | n/a (no clean case) | $0.1704 / $0.1694 / $0.2424 |

- A tool's summary text is not scored; only inline comments are (decision 076i item 1).
- `JUDGE_FAILED` is 0 on every row under both judges.
- Cost excludes judging.
  - TraceHound rows use Nebius ledger dollars from the runner records. Claude rows use the Anthropic ledger.
  - The judging of every row, Claude rows included, is Nebius money inside L1 ($0.14367 in all).
- `a0NotInA1` is 0 on every case (`arms/replay.json`): A1 holds every A0 comment.
- Failures (codex, `run/out/codex.076j.md`):

  | row | failed reviewer chunks | `VERIFY_FAILED` | failed requests |
  |---|---|---|---|
  | A0 | 2/84 | 2 | 1/176 official, 17/192 with batch 1's failed attempts |
  | Haiku draws | 0 | 0 | 0 |
  | Sonnet | 0 | 0 | 0 |

### 3c. Paired catches vs A0, v1, all 31

*dev, selection set, one draw, one judge of record, not hand-checked; dev exposure 10 of 31 (grok). Counts only: the dev
policy registers no test. A1, A2 and the Claude rows are report-only.*

| pair | A0 only | other only | both | neither |
|---|---|---|---|---|
| A0 vs CodeRabbit | 1 | 8 | 11 | 11 |
| A0 vs Greptile | 1 | 7 | 11 | 12 |
| A0 vs A1 | 1 | 2 | 11 | 17 |
| A0 vs A2 | 2 | 3 | 10 | 16 |
| A0 vs Haiku draw 1 | 4 | 6 | 8 | 13 |
| A0 vs Haiku draw 2 | 4 | 3 | 8 | 16 |
| CodeRabbit vs Greptile | CodeRabbit only 2 | Greptile only 1 | 17 | 11 |

The same pairs (A0 only / other only / both) for x1 on all 31, and for both judges on the 21 unexposed:

| pair | x1, 31 | v1, 21 unexposed | x1, 21 unexposed |
|---|---|---|---|
| A0 vs CodeRabbit | 1 / 9 / 13 | 1 / 6 / 9 | 1 / 5 / 11 |
| A0 vs Greptile | 1 / 5 / 13 | 1 / 6 / 9 | 1 / 4 / 11 |
| A0 vs A1 | 0 / 3 / 14 | 1 / 2 / 9 | 0 / 3 / 12 |
| A0 vs A2 | 0 / 4 / 14 | 2 / 3 / 8 | 0 / 4 / 12 |
| A0 vs Haiku draw 1 | 3 / 5 / 11 | 4 / 4 / 6 | 3 / 3 / 9 |
| A0 vs Haiku draw 2 | 4 / 1 / 10 | 4 / 3 / 6 | 4 / 1 / 8 |
| CodeRabbit vs Greptile | 4 / 0 / 18 | 1 / 1 / 14 | 1 / 0 / 15 |

### 3d. v1–x1 agreement per row

*dev, selection set, one draw, one judge of record, not hand-checked; dev exposure 10 of 31 (grok). A1, A2 and the
Claude rows are report-only.*

| row | bug n | both | v1 only | x1 only | neither | agreement | Cohen's κ |
|---|---|---|---|---|---|---|---|
| A0 | 31 | 11 | 1 | 3 | 16 | 87.1% | 0.736 |
| CodeRabbit | 31 | 19 | 0 | 3 | 9 | 90.3% | 0.786 |
| Greptile | 31 | 18 | 0 | 0 | 13 | 100% | 1.000 |
| A1 | 31 | 13 | 0 | 4 | 14 | 87.1% | 0.746 |
| A2 | 31 | 13 | 0 | 5 | 13 | 83.9% | 0.686 |
| Haiku draw 1 | 31 | 14 | 0 | 2 | 15 | 93.5% | 0.871 |
| Haiku draw 2 | 31 | 11 | 0 | 0 | 20 | 100% | 1.000 |
| Sonnet (8) | 8 | 2 | 0 | 2 | 4 | 75.0% | 0.500 |

Over the seven 31-case rows there are 18 disagreements, and in 17 of them x1 is the judge that caught. On every row x1
catches at least as many as v1.

## 4. Stop/go (E1 §2; decision 076t)

*dev, selection set, one draw, one judge of record, not hand-checked; dev exposure 10 of 31 (grok).*

The rule (decision 076g item 6) is read on v1 over the 31 dev bugs, between A0 and CodeRabbit, with d = C(CodeRabbit) −
C(A0) = 19 − 12 = **7**.

| condition | figures | holds |
|---|---|---|
| GO: A0's catches ≥ CodeRabbit's − 3 | 12 ≥ 16 | no |
| GO: A0's comments per case ≤ 2 × CodeRabbit's | 1.075 ≤ 6.150 | yes |
| RETHINK: CodeRabbit leads by 6 or more | 7 ≥ 6 | **yes** |
| Low coverage: CodeRabbit completed fewer than 30 of 40 | 40 of 40 | no |

**Reading: RETHINK** (artu1, decision 076t, read once from grok's recount). Coverage does not change a RETHINK (decision
076i). Under decision 076k item 4 the reading does **not** gate the tag or the held-out run. It is told to Sunny the same
day and pauses company work (pricing, demo) until the held-out result.

Beside the rule, not inputs to it (E1 §2 point 1; the rule is not re-read on another judge or subset):
- On x1, d = 22 − 14 = 8.
- On the 21 unexposed cases, d = 15 − 10 = 5 under v1 and 16 − 12 = 4 under x1.
- Greptile caught 18 under v1 and 18 under x1. Greptile is not in the rule.

## 5. Report-only rows

*Every table in this section: dev, selection set, one draw, one judge of record, not hand-checked; dev exposure 10 of 31
(grok); report-only.*

### 5a. A1 and A2 (E1 §3; no verdict, no adoption)

| X | C(X) − C(A0), v1 | C(X) − C(A0), x1 | H(X) − H(A0) | M(X) against M(CodeRabbit) 3.075 |
|---|---|---|---|---|
| A1 (pool-raw) | +1 | +3 | +2 | 1.700 |
| A2 (review-diff-v1) | +1 | +4 | +2 | 1.425 |

Whatever these show, the held-out run is A0. H2 scores A1 and A2 on held-out as secondary rows, judges only.

### 5b. The Claude rows (decision 076j; E1 §3b)

*Model and cases: Haiku 5.5 (40 cases, two draws) and Sonnet 5.5 (R1 §7's 8 bug cases). Sunny's own money.*

They ran on R1's cases with R1's three prompts and pipeline, unchanged. The only difference allowed was default sampling.
Catches, intervals, comments, cost, failures and v1–x1 agreement are in §3. The rows below are the paired tests with A0.

**Paired catches with A0 and exact two-sided sign tests on the discordant cases.** Dev, report-only: **the p-values
register nothing**, and non-significance does not establish equivalence.

| judge | pair | bug n | both | A0 only | other only | neither | exact p |
|---|---|---|---|---|---|---|---|
| v1 | A0 vs Haiku draw 1 | 31 | 8 | 4 | 6 | 13 | 0.754 |
| v1 | A0 vs Haiku draw 2 | 31 | 8 | 4 | 3 | 16 | 1.000 |
| v1 | A0 vs Sonnet | 8 | 1 | 2 | 1 | 4 | 1.000 |
| x1 | A0 vs Haiku draw 1 | 31 | 11 | 3 | 5 | 12 | 0.727 |
| x1 | A0 vs Haiku draw 2 | 31 | 10 | 4 | 1 | 16 | 0.375 |
| x1 | A0 vs Sonnet | 8 | 3 | 1 | 1 | 3 | 1.000 |

p = min(1, 2 · P[Binomial(a + b, ½) ≤ min(a, b)]), with a and b the two discordant counts (protocol revision 13's
formula).

**Haiku draw to draw.**
- v1: 4 cases were caught in draw 1 only and 1 in draw 2 only.
- x1: 5 were caught in draw 1 only and none in draw 2 only.
- Location hits fell from 13 to 9; 4 cases lost a hit and none gained one.

**Blind check (decision 076j item 6).** `run/out/sunny-blind-check.md` holds the 8 v1/x1 disagreements of the 235B x1
judge on the Claude rows and A0. It is **not marked**. Since decision 076r the x1 judge is Qwen3-30B, so its items are no
longer the x1 disagreements on this page. No count here depends on it.

**Disclosure (decision 076k item 1).** Planner B drafted the Haiku thresholds (decision 076k item 2) before 076j's
results existed. They were adopted after. Haiku 5.5 is a registered secondary held-out row because Sunny registered it
(076k item 1), not because of these dev numbers. A0 stays the primary. No Sonnet row runs on held-out (076k item 3).

## 6. L3 (report only; no run)

These numbers are from bunny's audit (c) (`run/out/bunny.audits.md`):
- References to other code reach the model in **13 of 42** chunks today. They would reach it in **36 of 42** with a
  10,000-character reserve.
- The reserve would push the labelled lines of **4** bug cases out of the context block (case-024, 033, 038, 039).

Step 2 was cut (decision 076), and nothing is adopted.

## 7. Sheet size for Sunny's hand-check (E1 step 4, $0)

`handcheck-sheet.ts build` was run with A0, CodeRabbit and Greptile, their v1 and x1 details and `--seed 20261111`:
- **I_dev = 95 items** (CodeRabbit 40, Greptile 35, A0 20) over 24 cases. Nobody fills this sheet.
- Held-out estimate: 95 × 20 ÷ 31 = **61.3 items**. Minutes per item are Sunny's to give (decision 078).
- Built with `--strip scripts/testset/strip.json` (`b18-strip`), the sheet has the same 95 items and names no tool.
  Since `b19-strip-refusal`, a build that leaves a tool name on the sheet refuses with exit 2.
