# ts-freeze: tag `review-freeze-3` (F1, decision 078)

Written by artu1 on 2026-11-18 under `docs/runbooks/F1-freeze.md` §3. The held-out values come from codex's
`run/out/codex.ho-freeze.md` (GO 5740344, counts and digests only); the held-out files stay in `~/Projects/tracehound-ho-window`.

## Commit and tag
- **Gated code commit C = `8aeb28ba6ab0e4ea9c308e86a78b47cc5503f599`** (main). Gates in a plain shell, `GIT_*` check
  empty: `pnpm test` analyzer **1077 passed / 6 skipped**, action **423 passed**, viewer **225 passed**; `pnpm typecheck` OK.
- **The tag `review-freeze-3` is on the commit that adds this file, whose only parent is C** and which changes only
  `docs/bench/ts-freeze.md`. F1 §2 step 5 is checked as `git rev-parse review-freeze-3^{commit}^` = C and
  `git diff --name-only C review-freeze-3` = this file (a file cannot name its own commit).
- Scheduled T0 **Thu 19 Nov 2026 10:00 IST = 2026-11-19T04:30:00Z** (tag after 20:00 IST on 17 Nov; 076k item 5, 076w,
  076x item 3); snapshot T0 + 72 h; sittings Sun 22 Nov afternoon (about 150 min) and Mon 23 Nov (076w, 076x).
- R1's commit `997504328ea5f85926814fd43085cca721449c91`. §7 item 1: `git diff --name-only $R1 C -- packages scripts config`
  lists 25 files, each from a merge with a GO: (i) provider `db70908` (merged `2441a6b`): `llm/{anthropic,budget,client,ledger,provider}.ts`,
  `spend.ts`, `test/setup.ts`, `test/llm-anthropic.test.ts`; (ii) Claude-row runner `25908f3` (`833def6`) and the
  held-out Haiku change `9819e2f` (`b3377fd`): `scripts/run-tracehound.ts`, `review/{cli,ctx-cli,verify-ctx-cli,provider-option}.ts`,
  their tests; (iii) `config/prices.json`: Anthropic entries (`db70908`), Ultra at listed rates (`60b36fd`, 076q item 1),
  Qwen3-30B added (`86bb9eb`, 076r), with `test/llm-nvidia-api.test.ts`; (iv) dev-side `tools.json` (`1d07c82`, 076l, with
  its fixture and test) and `strip.json` (`5e87b77`). **Beyond the literal list:** the hand-check/scoring kit
  `scripts/testset/{handcheck-sheet,score-testset}.ts` and `packages/action/test/testset-kit.test.ts` (`e67d237` 076u item 4,
  `c4eced1` B2 §5.4, `8fdf6dc` fallback (d), which F1 row 17 requires in the tag), and the test-only
  `packages/analyzer/test/test-set-run.test.ts` (PR #78 `9ac699b`, 076v item 3). None is on the reviewer's request path.
  **Prompt sha256 equal to R1's** (computed from the source at C and read from R1 records): review-diff-v1
  `f77c203105111e02222d8f1c985a4629d9ac8cdd07b465fdb526cf1dddea4849`, review-ctx-v1
  `0c4dcdcf4d764919b87c581278943e1c6d7b0714aa72b0f3cf60aa0f728089e0`, verify-ctx-v1
  `75703fc6b34910f5bdebf29703023d6ec8e8cbbbfbc35574bfbf60830a383e70`; `review.ts`, `review-ctx.ts`, `verify-ctx.ts` and the
  three prompt files unchanged since R1.

## The arm and models
- **A0**, pool-verify-v1 on Nemotron; attempts 2; comment cap 15 (076g item 1, 077).
- Reviewer and verifier `nvidia/Nemotron-3.5-Super-VL` (`scripts/run-tracehound.ts:90`, `ACTION_DEFAULTS.model`); judge
  `bench-judge-v1` = `nvidia/nemotron-3-super-120b-a12b` (`SUPER_MODEL`, `packages/analyzer/src/bench/judge.ts:10`,
  reasoning on); judge `bench-judge-x1` = `Qwen/Qwen3-30B-A3B-Instruct-2507`, reasoning off (076r item 1; H2 §2). Not
  `scripts/bench/run-test-set.ts` (its `QWEN_MODEL` is the deprecated 235B; unused by H1/H2). Row 15: 3/3 answered on
  17 Nov and again on 18 Nov 10:47Z (`run/out/artu1.f1-model-check.md`; `docs/budget.md`). **H2 judging completes before 2026-12-09.**
- **Haiku 5.5 held-out row** (076k item 1; protocol rev 12 §5): `claude-haiku-5-5`; config `$HO/haiku.row.json`
  sha256 `239d5fa6c375abbbd8ee4b7ebd7633958cf160c7a82a6f110fc1581f43452564` (Anthropic, scope registered-heldout-haiku,
  adaptive thinking with `--reasoning on`, provider-default effort and sampling; passed `parseAnthropicRowConfig`);
  provider `2441a6b`, Claude-row runner `833def6`, held-out change `b3377fd` (`9819e2f`); cap **$1.00 of Sunny's Anthropic
  credit for both draws** (estimate 2 × $0.22) under the $9.50 combined Anthropic stop; Sunny's own money; draws
  `$HO/th-haiku-1`, `$HO/th-haiku-2`, after A0's batches and reruns, draw 1 then 2; command = the runner line below plus
  `--provider-config $HO/haiku.row.json`; one rerun per failed case, still failing = a reported miss; secondary,
  judges only, no hand-check, compared with A0 on judge v1 for both rows.

## Money (076r item 2, 076v item 2)
f = **1.17**; job trip above **1.26**; console reading used **$16.20** (Sunny, 17 Nov ~14:00 IST; no later reading given);
ledger_now **$48.09835**; new hard stop **$61.08980** (= ledger_now + (16.20 − 1.00) ÷ 1.17) in the main `.env`, whose
sha256 after the reset is `81b45b26fe8009456ed2b35aaf740c32835265743da82ee7fa21f54ef5bdfed0`. Case cap **$0.40**; H1 job cap
**$2.94** (077); rolling batch rule: run cap = job cap − job spend so far (076a); the reserve covers unstarted cases (076a item 4).

## Runner line (`docs/specs/R1.md` §2, from the tag worktree)
```sh
node --env-file=.env scripts/run-tracehound.ts --manifest <manifest> --clone <clone> --ids <ids> --out-dir <out-dir> \
  --fixes off --contracts off --cache off --max-usd-per-case 0.40 --max-usd-run <run cap>      # then the same with --execute
```

## Window, order and schedule (held-out side; files private, digests here)
- PR order rule: all 29 cases in one list by the committer date of the base commit, earliest first, ties by case id
  (076e item 2; H1 "Positions"; protocol §7). Case list `$HO/cases.json` sha256
  `4ad05d18c33c123ca7e6142e99085716edd240a47cb0098a7d08f3dd85e0c291` (29 rows, 0 out of order, 0 ties). First-review
  exposure file `$HO/planned-exposure.audit.json` sha256 `3b6985d43ec6241942d18ad56ddce296801234370a30044ef54ebe7002e51386`
  (exposed at first review 0/20; 5/20 can become exposed once all held-out refs are pushed).
- Trigger schedule: `$HO/plan.json` sha256 `b4130c5d77869388dce83653df7d784b20e4aadbb5de4aa99c8a9d50e2e71631`, t0
  2026-11-19T04:30:00Z; slotSeconds 3660, minTriggerSpacingSeconds 3660, firstSlot 0, retriggerFromSlot 29, lastSlot 63,
  retriggerDueSeconds 86400, graceSeconds 1800, firstTriggerAttempts 2, timeouts open/trigger/collect/retrigger
  600/300/300/300 (076e item 2, 076h item 3); `--list --execute`: 64 slots, "EXECUTE plan check passed".
- Window scheduler `scripts/testset/window-scheduler.ts` sha256 `b13f0a107a3f92e7ccc03ce84d962bae2b095156aefdc36e613363bbe771c717`
  (reviewed head `2c51913`); rehearsal `run/out/codex.076d-r3.md` (8 dry hourly slots, restart after slot 0, 0 late by
  30 min or more); S1's `--execute` run: both slots done, projection under 900 s.
- Held-out inputs and goldens: `$HO/hashes.freeze.txt` (manifest, three label files, overlay, three golden outputs)
  sha256 `1847840100b537b625c7ebf7b5bf9376e45faceda13b9f8ebc854dbda028fb4a`; goldens **29 / 20 bug / 9 clean / 1 alternate**.
- **F1 §4.7 (gap G7):** grok recomputed the held-out hashes on its own: equal to `hashes.freeze.txt` **yes**; counts 29, 20, 9, 1;
  case list 29 / 0 / 0; exposure 0/20 (5/20 at a re-trigger); 64 slots from 2026-11-19T04:30:00Z (`run/out/grok.ho-freeze-check.md`, GO).
- Clones: complete (0 missing), 58/58 commits and trees match the manifest (grok GO); 22,241 objects in clones 1–2
  fetched from forks over plain git, kept as a recorded deviation after a clean `git fsck --full` (076w, 076x).

## Tag worktree
Command set `docs/eval/tag-worktree.md` at `775c3d6` (merged `64a23a4`; grok GO `run/out/grok.tag-worktree-r2.md`);
worktree `~/Projects/th-h1`. Verifier line and untracked links: written by codex after the tag into
`run/out/codex.f1-heldout.md` (F1 §4.2, §4.8); no `pnpm install` in the main checkout and no `.env` edit until H2's commit.

## Hand-check
Seed **20261118** (the tag date). Sittings and blindness: 076w, 076x; minutes per item 4, an estimate.

## Other
- `tracehound-testset` commit `3254c913dcb6bcba8e4d50f42651c4788f524568` (holds `scripts/open-prs.ts` with re-trigger mode; `060c644` is an ancestor).
- node `v26.13.1`, pnpm `11.20.0`.
- sha256 of the frozen files at C:
```
60103811d250b54dc3b575e426812b2aebf003a7a2d0c4f39804488bb082b6df  scripts/run-tracehound.ts
608788a4fa5ab821618261d382f4bb8bd66c1ea67cf55d228c92e9a416a7ae25  scripts/testset/build-goldens.ts
bf5261543799fe493c48acee6735c5b598f1de977a33d2caf1756b039c8875e0  scripts/testset/collect-tool-reviews.ts
b868d4c88d5b91002143829343dc599c4dd19d30f21b3687e1a3d7c9c2f88d51  scripts/testset/delete-dev-branches.ts
6462f723dce4d99d7f1926d2f8e50cdb31b1b7a7766d7c7665e262ab3a1f2ef7  scripts/testset/handcheck-sheet.ts
52c33ea98223a624149730a7abe10acba5af9df75c4b13be40c3abce34809c7f  scripts/testset/kit.ts
bba6fb5d85e9b2bcbd8cdc6650d80aac814a61837afbdd33e94489f7394eec15  scripts/testset/location-hit.ts
e6d673aedf11d2fe3ffb4a5bdaf3ab30e90a3ee04dedba0bd27078550e8c15af  scripts/testset/policy.076a.json
caab087a9130717344ab975374f2a43742d105c471351b778c0daf7b7a60c1c0  scripts/testset/policy.076a.md
b5b33512cf802a7598278c692bcaa16afe33202971b536755b56210d8cb28679  scripts/testset/policy.076c.json
a25f405880680e6c9aea4d8128ac34609e39aff77f6f895519853759fefa68c3  scripts/testset/replay-arms.ts
7ea8dc2ffb2657d0800f5b8f6570508231ea45426c96ea90e817006ac7d16d8b  scripts/testset/score-testset.ts
c2dd3f4166dd962c2c7b941589e41e70dad3db690218ac088a7808bfd7609a8a  scripts/testset/strip.json
42c223846930fcdff6f95641ebb97f1c65cfb266d5997d06e6cb20d1e561b90f  scripts/testset/tools.json
692d8e1d7cf5d4ab527c0bc6e21f1e3e2e5fa6375e523b8c58bb3c630db64ffa  scripts/testset/tools.s1.json
b13f0a107a3f92e7ccc03ce84d962bae2b095156aefdc36e613363bbe771c717  scripts/testset/window-scheduler.ts
dbd176e32bae0309e77899088edc3b5a67393d990544e37493aa31bbcb0a10e9  config/prices.json
b23fe7c7033d4325502f1aa79a17a215b46b078608f2f1c3e542be8b4cb4329e  pnpm-lock.yaml
30cf9a334aa0a23ba97ee2044a7de0a27e0cc6bc7b5814c7d8d26fb9808232d8  docs/eval/ts-protocol.md
123e1f0f70c2c44174ebdef4369537f0073c0cdf757fdaae37e62083912de73c  docs/runbooks/H1-window.md
405037676bee2ba88c7327e4a09278f89135e99459ce6b98a5f68e2372ab0a34  docs/runbooks/H2-scoring.md
65ffb43bcb9c5fb2643f86bc996143deb0ef117ef05d9248f8281cbacf03618e  docs/runbooks/handover.md
```
