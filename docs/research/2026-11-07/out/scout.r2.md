# scout r2 — cross-examination

TL;DR 1/10: The Nov 2026 official comparison set is Claude Fable 5 ($10/$50), Sonnet 5 / 5.5, GPT-6 Astra ($10/$50), and Gemini 3.8 Flash ($0.75/$3.75 through 2026-12-31). ag.r1's Claude 3.5 / GPT-4o / Gemini 1.5 rows are the wrong generation.
TL;DR 2/10: Nebius `models_info` confirms Nemotron 3.5 Super VL at $0.30 in / $0.06 cached / $0.90 out. https://nebius.com is the wrong citation for that card.
TL;DR 3/10: The cache rate does not pick the next task. Completed 3.5 dev runs cached 0 calls, and a hit is ledgered at $0 (`client.ts:145`, `client.ts:262`).
TL;DR 4/10: This repo has both files. Claude Code's default is CLAUDE.md only when both exist. `AGENTS.md:3` matches https://code.claude.com/docs/en/memory.
TL;DR 5/10: Codex discovers `AGENTS.override.md`, then `AGENTS.md`, then configured fallbacks. The agents-md guide contains no `CODEX.md`.
TL;DR 6/10: Generator misses 56 vs verifier drops 23 (69+56+23=148). `both` is 34/53 = 64.2% precise; diff-only is 34/90 = 37.8%. Nothing I opened contradicts that.
TL;DR 7/10: "both skips the verifier" returns +6 TP and +8 FP comments over runs 7r+8. That replay is F-neutral, so it is not rank 2.
TL;DR 8/10: Posts since 30 Oct 2026 do not name a technique this repo lacks a measured reason to copy. Lost levers stay lost. Cal.com stays closed.
TL;DR 9/10: A new 40+40 set is about $18 in tokens at $0.0743/PR. Labelling hours are unmeasured. Name the matcher before any new held-out set.
TL;DR 10/10: Next task: one dev-only rerun of the PRs that already CHUNK_FAILED, `attemptsDetail` on, one built switch, existing judge. Exit is failure count, finish_reason, and ΔF. About $1 and a few evenings. Leave the shared cache unread.

## Agree

- Generator misses are the larger recall bin on the golden-run join: hit 69, generator miss 56, verifier drop 23, sum 148 = 74×2 (`claude.r1.md:6`). No competitor page contradicts those counts. Codex's caveat is attribution, and the generator bin stays larger: official raw FN 29/28, verdict-aligned dropped TP comments 10/10, of which `both` is 4/2 (`comms/devin-to-claude-1.answer.md:17-18`; `codex.r1.md:62-64`).
- Source precision matches the answer table. Combined `both` TP 34 / FP 19 = 64.2%. Combined diff-only TP 34 / FP 56 = 37.8%. Diff-only is 31 of 57 final FPs (`comms/devin-to-claude-1.answer.md:12-21`).
- Pipeline dollars match. `codex.r1.md:95` totals $5.94395 over 80 run×PR pairs, mean $0.07430/PR, the same order as claude.r1 §4. Stage share is diff 39% / ctx 48% / verifier 13%.
- Reliability is the right family for this week. 17 CHUNK_FAILED chunks, every one "the reply is not valid JSON; after one retry" (`comms/devin-to-claude-1.answer.md:23-26`). 7 of 40 PRs per run (`devin.r1.md:72`). The lenient parser and the fresh retry exist and are off (`devin.r1.md:20-21`).
- The review path does not use the graph, Cal.com is closed (decision 069b; `devin.r1.md:54`), and the verifier's F move stays inside the interval (`codex.r1.md`). Those constraints stand.
- Cache-read dollars are on the vendor catalog, fetched 2026-11-07 from https://tokenfactory.nebius.com/api/public/models_info. 3.5 Super VL `nvidia/Nemotron-3.5-Super-VL`: $0.30 / $0.06 / $0.90. Super `nvidia/nemotron-3-super-120b-a12b`: the same. Nano: $0.06 / $0.012 / $0.24. Lightning `nvidia/Nemotron-3_5-Lightning`: $0.06 / $0.03 / $0.24. Ultra `nvidia/Nemotron-3-Ultra-550b-a55b`: $1 / $0.12 / $3. Qwen3-235B-A22B-Instruct-2507: $0.20 / $0.05 / $0.60. `config/prices.json:6-11` matches the base rates except Ultra and Lightning, which are still `placeholder: true`. The $0 Ultra id is the separate NVIDIA route (`prices.json:1`, `prices.json:9`).
- Claude Code's memory doc matches this repo. If `AGENTS.md` and `CLAUDE.md` both exist, Claude reads "Your CLAUDE.md files only." Default: read `AGENTS.md` only when no `CLAUDE.md` is in the working directory or above it. https://code.claude.com/docs/en/memory (indexed 2026-11-07). `AGENTS.md:3` says Claude Code reads CLAUDE.md and CLAUDE.md wins on disagreement.
- Codex discovery is global `AGENTS.override.md` else `AGENTS.md`, then one file per directory: `AGENTS.override.md`, then `AGENTS.md`, then `project_doc_fallback_filenames`. https://developers.openai.com/codex/guides/agents-md. A fetch of that page has 0 occurrences of `CODEX.md`.
- Round 1 still holds. Since 30 Oct 2026, competitor posts supply no new reason to retry decisions 056, 064, 065, 070, or 071. Leaderboard rank is not a technique, because the matchers differ (`scout.r1.md:8-9`, `scout.r1.md:84-85`).

## Disagree

- ag.r1.md:7 and ag.r1.md:26-31 list Claude 3.5 Sonnet ($3/$15), GPT-4o ($2.50/$10), and Gemini 1.5 Flash ($0.075/$0.30) as the Nov 2026 set, on generic URLs. Current pages:
  - https://platform.claude.com/docs/en/about-claude/pricing lists Fable 5 at $10/$50, Opus 4.8 at $5/$25, Haiku 4.5 at $1/$5, and Haiku 3.5 as retired at $0.80/$4. Sonnet 5 is $2/$10 through 2026-08-31 and $3/$15 from 2026-09-01. The models overview still shows Sonnet 5 at $3/$15 beside Fable 5. https://platform.claude.com/docs/en/models/sonnet-5/overview.md calls Sonnet 5 legacy at $2/$10 and lists Sonnet 5.5 at $2/$10. The introducing-Fable page says access to Fable 5 was suspended on 12 Jun 2026. "Claude 3.5 Sonnet" is absent from the pricing table I retrieved. $3/$15 is a real Sonnet list price on the wrong name. The 15.0× row (`ag.r1.md:62`) uses that name. Fable 5 output on the same pricing table is $50/MTok against Super VL $0.90.
  - https://developers.openai.com/api/docs/pricing published 2026-11-07, flagship table: gpt-6-astra $10/$50 (cached $1), gpt-6.1-sol $2/$10, gpt-6.1-terra $1/$5, gpt-6-luna $0.10/$0.50. The retrieved page has no GPT-4o chat row. `gpt-4o-transcribe` is $2.50/$10, a transcription model. ag's URL https://openai.com/api/pricing is a different page.
  - https://ai.google.dev/gemini-api/docs/pricing published 2026-10-30: Gemini 3.8 Flash input $0.75 through 2026-12-31, then $1.50; output $3.75, then $7.50. The retrieved sections show no Gemini 1.5 row. The context-mode fetch of that URL returned only the title, so a 1.5 row past the extract is [not shown]. $0.075/$0.30 is not on the retrieved current page.
- ag.r1.md:12-13 and ag.r1.md:88-89 say all six tools auto-load `AGENTS.md` and that `{ AGENTS.md }` alone covers them. In this repo Claude Code's default is CLAUDE.md only (memory-doc table above).
- ag.r1.md:74 says Codex loads `CODEX.md`, cited as https://github.com/openai. The agents-md discovery list is `AGENTS.override.md` and `AGENTS.md`, and the fetched guide has no `CODEX.md`.
- ag.r1.md:20-25 cite https://nebius.com for every Nebius row. The rates above are on `tokenfactory.nebius.com/api/public/models_info`. Cache rates the table omits, except Super VL: Nano $0.012, Lightning $0.03, Ultra $0.12, Qwen $0.05. Ultra $1/$3 is the Token Factory card and is real; `prices.json:8` still marks that id placeholder.
- ag.r1.md:58 prices a 50% cache-hit scenario at $0.0540 median / $0.0653 mean per PR. Completed runs had 0 cached calls (`codex.r1.md` cost section; claude's answers). The ledger records a hit at `costUSD: 0` (`client.ts:145`, `client.ts:258-262`), which is separate accounting from the provider's $0.06 card.
- ag.r1.md:50 says dropping the verifier on agreed findings gains recall. The same replay is +6 TP and +8 FP comments (`comms/devin-to-claude-1.answer.md:18-19`). Recall ticks up; F stays flat on that arithmetic. `devin.r1.md:8` rank 2 ("$0 replay of both skips the verifier") is therefore not the next task.
- `devin.r1.md:57` says the lenient parser can be replayed at $0 from cached invalid JSON. Attempt records do not keep the raw bodies, and `.tracehound/cache` also holds Cal.com replies, so those counts are not dev-only (`comms/devin-to-claude-1.answer.md:27-29`). I did not open the cache.
- Devin, Cursor, Grok, and Antigravity rows (`ag.r1.md:75-78`) were outside this check. I do not endorse https://docs.devin.ai, https://docs.cursor.com/rules, https://x.ai, or "Built-in rules.md".

## Gaps

- `finish_reason` on the 17 JSON failures is unmeasured. `attemptsDetail` arrived in #67 after runs 7r/8. `truncation-scan.ts` has not been run (`devin.r1.md:24`). The shared cache stays unread.
- Hours to label an 80-PR SZZ-style set are not measured. Token arithmetic does follow: 40×2×2×$0.0743 ≈ $11.9, plus one held-out pass ≈ $5.9, about $18 (`devin.r1.md:100`). Whether labelling fits ~2 h/day for one week is [not measured]. With ~70 goldens, only about 8–10 F points clear noise (`devin.r1.md`).
- Any new held-out set still needs the matcher named first (golden-comment F, author-fixed, or a ReviewBench-style rubric). `scout.r1.md:9`. An SZZ precision would not sit on the golden-comment table.
- Symbol context and running the app remain the published gaps and are larger than this week. The prior for more context is weak (decision 057 F flat; decision 050). They are the successor measurement, after a set exists.

## Candidate next task

Rerun the existing dev PRs that recorded CHUNK_FAILED, with `attemptsDetail` on and one already-built switch (lenient parser, or the reasoning-off fresh retry). One switch, not a stack. Score recovered findings with bench-judge-v1. No new model, no Cal.com, no cache scan, no product edit in this research round.

Exit criterion: CHUNK_FAILED count before vs after, the `finish_reason` split, and dev ΔF with the interval. A lower failure count with F inside the interval passes the reliability metric. An F move outside the interval decides keep or drop.

Cost: about $1. Seven PRs × one new arm × ~$0.0743, twice if the first pass is noisy, plus a judge call per PR on the order of devin.r1.md:100 ($0.0005/PR). Hours: a few evenings inside one week at ~2 h/day. The set, the judge, and the switch already exist.

Why this one: the `both`-skip replay is already F-neutral on saved labels. The TS dev-plus-held-out set is the right later measurement, its token bill is about $18, and its labelling hours are unmeasured, so it misses this week. A swap to Claude, GPT, or Gemini is out of bounds (Nemotron on Nebius only), and ag.r1's comparison prices are the wrong generation. Cache discounts do not move a run that cached nothing. Lost levers stay lost. Posts since 30 Oct 2026 did not publish a technique with a measured reason to copy.

HEAD `b49864763a203ea16a86a692dcd924129626cbee` (rev-parse this round). PR: none. Tests and typecheck: not run. Nebius model calls: none (public `models_info` GET only). Files written: this report, then `out/scout.r2.done`. Inbound comms: none at draft time; rechecked before the `.done` file.
