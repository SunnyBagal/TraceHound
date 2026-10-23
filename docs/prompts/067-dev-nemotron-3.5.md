# 067: Nemotron 3.5 Super on dev: does the smarter model make a better reviewer? (dev only)

Tool: **relay**, i.e. Sunny's Claude Code (account A), builder plus reviewer. Folder `~/Projects/TraceHound`. Start it from `~/Projects/tracehound-ops`:

```
caffeinate -i bun src/relay.ts start tracehound briefs/067-dev-nemotron-3.5.md
```

**Sunny, before starting:**
- Copy this file to `~/Projects/tracehound-ops/briefs/067-dev-nemotron-3.5.md`.
- Set `nebiusCapUsd` to **8** in `~/Projects/tracehound-ops/ops/lanes.json`.
- Main has #50 and #51 merged (it does, as of 20 Oct).

Decision number: 067. Nebius cap: **$8**. Ledger about $25.82; the total cap is $45.

## Why
Nemotron 3.5 Super is on Token Factory at the same price as Nemotron 3 Super. Its SWE-bench Verified is 71.1 vs 60.5, but those come from different harnesses. The question here: on our own dev set, with the **same frozen prompts and the same pipeline (pool-verify-v1)**, does swapping only the model raise F?

This runs on dev only. It touches no ReviewBench data and no Cal.com data. The answer decides the Action's default model before freeze-2 on 24 Oct.

## Step 0 (if any check fails, STOP AND REPORT)
- `git fetch origin`; `git status --porcelain` prints nothing. Switch to main and fast-forward (`git merge --ff-only origin/main`). HEAD equals origin/main.
- `config/prices.json` has `nvidia/Nemotron-3.5-Super-VL` at 0.30/0.90 (from #50).
- `grep -c '^## 066' docs/decisions.md` prints 0 or 1 (066 may still be open; that's fine). `grep -c '^## 067'` prints 0.
- The 3 Super dev records for runs 1, 2r, 4, 5 and 6 exist under `~/Projects/tracehound-bench/reviews/dev-repeat/` (064 used them). They are the baseline; don't re-run them.
- The `GIT_*` env check prints nothing.

## Steps (one commit each; run `pnpm test` and `pnpm typecheck` as **their own command**, read the result, then commit separately; messages `area: what changed`)
1. Branch `build/067-dev-3.5`. Save this brief verbatim as `docs/prompts/067-dev-nemotron-3.5.md`.
2. **Runner:** `scripts/bench/run-test-set.ts` gets a `--model <id>` option, for `--set dev` only.
   - The default stays `REVIEW_MODEL`. The Cal.com path stays byte-identical; add a test that proves it.
   - Records for a non-default model go to `reviews/dev-repeat/run-<N>-<model-slug>/`, and `run.json` records the model.
   - It applies to every stage (`review`, `review-ctx`, `verify-ctx`). Prompts, temperature 0, reasoning on and `max_tokens` are unchanged.
   - The judges stay as they are: v1 is Nemotron 3 Super (the scorer of record), and x1 is reported alongside.
3. **Freeze commit (push it before any model call).** Write `docs/bench/dev-3.5-plan.md` containing the rule below, exactly as written:
   - **Baseline:** pool-verify-v1 on 3 Super, the 5-run mean on dev (runs 1, 2r, 4, 5, 6): v1 F 42.3, P 40.5; x1 F 51.3. Recompute these from the records and state them. If they differ from these numbers by more than 0.1, STOP.
   - **Candidate:** pool-verify-v1 on `nvidia/Nemotron-3.5-Super-VL`, dev runs 7, 8 and 9.
   - **Adopt 3.5 as the Action's default** only if all of these hold:
     - its 3-run mean F (v1) is ≥ **baseline + 3.0**;
     - its mean P (v1) is ≥ the baseline's mean P;
     - its mean F under x1 is ≥ the baseline's x1 mean.

     Also report a per-PR paired bootstrap (10,000 resamples, seed 67) of the F difference, with its 95% interval. If the rule isn't met, it's a **loss** and 3 Super stays.
   - **Fallback:** if the cap stops a run, decide on the runs that completed (at least 2), and say so. Write this fallback in the plan before the first call.
4. **Run dev runs 7, 8 and 9** with `--model nvidia/Nemotron-3.5-Super-VL`.
   - Launch each one **detached** (`nohup … > runs/067-devN.log 2>&1 &`) and poll `run.json` until it shows complete or stopped-at-cap.
   - **Before run 8 starts**, check run 7: if any PR has failed chunks, or every PR got 0 findings (truncation, a wrong model id), STOP and report the first failure reason. Don't burn the cap.
5. **Score and write `docs/bench/dev-3.5.md`:**
   - per-run and mean P/R/F under v1 and x1, next to the baseline;
   - the bootstrap interval;
   - tokens and cost per PR for 3.5 vs 3 Super (3.5 may think longer);
   - the adoption verdict, stated plainly.

   Append decision 067 to `docs/decisions.md`.
6. Push. Open the PR to main **as a draft**, titled `067: Nemotron 3.5 Super on dev (decision 067)`. Wait for CI; make one fix attempt if it's red. Never merge.

## Rules
- **Cal.com is blind**: don't open, run or score anything under `~/Projects/tracehound-bench/test/`, and don't run `--set cal_dot_com`.
- **ReviewBench:** don't open anything of it.
- Don't open `linea-seeded`, `recall-seeded` or `tracehound-seeds`.
- May touch: `scripts/bench/` and its tests, `docs/bench/`, `docs/decisions.md` (append only), `docs/prompts/067-dev-nemotron-3.5.md`, `FEEDBACK.md` (one entry on how 3.5 behaved on Token Factory), and `runs/`.
- Don't touch: `packages/`, `config/`, `.github/`, `viewer/`, `AGENTS.md`, `pnpm-lock.yaml`, or anything in `~/Projects/tracehound-ops/`.
- No tag operations and no destructive git. Stage only by explicit path.

## STOP AND REPORT
Make your final message the report:
- step 0 results;
- the frozen plan's commit sha, and its time against the first model call;
- the table;
- the bootstrap interval;
- spend;
- the verdict;
- the PR number and head sha.

Also write it verbatim to `~/Projects/tracehound-brain/inbox/2026-10-2x-sunny-067.md` (rules in `inbox/README.md`: only that file; then `git pull --rebase`, commit and push).

## Resume 2 (067b)

# 067b, resume 2: merge the region fix, then run Nemotron 3.5 Super on dev (decision 067)

Folder: ~/Projects/TraceHound. Fresh session. Decision 067 (no new number). Nebius cap: $8 for this whole job, which is the runner's CAP_067_USD. Deadline: the verdict is written by 23 Oct 23:59 IST.

Background (verified by the reviewer):
- Run 7 got HTTP 404s because Nebius serves `nvidia/Nemotron-3.5-Super-VL` only from us-north1. The model id is right.
- PR #55 (origin/main da13585) routes that one id to us-north1 in `packages/analyzer/src/llm/client.ts`. Every other model, including the judges, stays on the configured URL. `config/prices.json` on main has the 3.5 key.
- A previous attempt stopped at the merge: FEEDBACK.md conflicted because both sides appended a dated entry at the end.
- After the merge, `client.ts` will differ from the review-freeze-1 tag. `freezeCheck067` (`scripts/bench/run-test-set.ts`, `ALLOWED_MODIFIED_067`) would then refuse the run. Step 3 handles that.
- A ReviewBench smoke test on 3.5 saw invalid JSON twice on one large PR, probably because reasoning used up max_tokens. That counts as model behaviour, not an infrastructure failure.

## Step 0 (if any check fails, STOP AND REPORT)
- `git fetch origin`. `git status --porcelain` prints nothing.
- `git switch build/067-dev-3.5`. HEAD is cf5b70b.
- `git merge-base --is-ancestor da13585 origin/main` succeeds.
- `env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'` prints nothing. Repeat this check before every gate.
- `~/Projects/tracehound-bench/.../run-7-nvidia-nemotron-3-5-super-vl/run.json` (the dev records folder the runner uses) still says status `running` with nothing scored.
- The Nebius ledger total is $25.83 or less.

## Steps (one commit each; run `pnpm test` and `pnpm typecheck` as separate commands, read the results, then commit)
1. **Merge.** Run `git merge --no-ff origin/main` into build/067-dev-3.5.
   - If FEEDBACK.md is the only conflicted file, resolve it by keeping both appended entries word for word. The branch's `## 2026-10-20 · job 067 …` entry goes first, then main's `## 2026-10-21 · Token Factory regions …` entry, separated by one blank line. Change no other text.
   - Check that `grep -n '^<<<<<<<\|^=======$\|^>>>>>>>' FEEDBACK.md` prints nothing.
   - If any other file conflicts, run `git merge --abort` and STOP.
   - Run the tests and typecheck. They must be green. Commit the merge (normal merge commit) and push.
2. **Save this prompt.** Append it verbatim to `docs/prompts/067-dev-nemotron-3.5.md` under the heading `## Resume 2 (067b)`. Commit and push.
3. **Let the freeze check accept the region fix.**
   - Run `git diff --name-only --no-renames --diff-filter=DMTUXB review-freeze-1 HEAD -- packages/analyzer/src scripts/bench config`. If it lists any file other than the five already in `ALLOWED_MODIFIED_067` plus `packages/analyzer/src/llm/client.ts`, STOP AND REPORT the list.
   - Otherwise, add `"packages/analyzer/src/llm/client.ts"` to `ALLOWED_MODIFIED_067` and update the comment above it to say why: region routing for the 3.5 id only, from #55.
   - Update the pinned list in `packages/analyzer/test/test-set-run.test.ts`.
   - Add one test asserting that `baseUrlFor` returns the configured us-central1 URL for `REVIEW_MODEL` and for every judge model in `JUDGES`, and returns the us-north1 URL for `nvidia/Nemotron-3.5-Super-VL`.
   - Run the tests and typecheck, then commit and push.
4. **Amendment commit.** Append a section `## Amendment 1 (21 Oct, before any successful 3.5 call)` to `docs/bench/dev-3.5-plan.md` that says exactly this, with no other edits to the plan:
   - The model id is unchanged. The 404s were a region problem, fixed in the client by #55 (main da13585). This branch merged it at `<merge sha>`.
   - The freeze check's allowed list gains `packages/analyzer/src/llm/client.ts` (commit `<sha from step 3>`). That file's only change since the tag is routing this one model id to us-north1. The judges' routing is unchanged, as a test asserts.
   - The original run 7 is void (an infrastructure failure, $0). It is restarted once under 061a with `--restart` into `run-7r-…`, which stands for run 7. Runs 8 and 9 follow.
   - **New stop rule before run 8**, which replaces "any PR has failed chunks". Stop if any of these holds:
     - every PR got 0 findings;
     - any failure string is a request error (HTTP 4xx/5xx, or a budget refusal);
     - more than 10 of the 40 PRs have a failed reviewer chunk.

     Otherwise continue.
   - Failed chunks caused by invalid or truncated replies count as the candidate's result. Those PRs are scored exactly as the scoring scripts score any PR whose reviewer failed, which is the rule the baseline runs were scored with. State that rule in one sentence and cite the file:line where it lives.
   - The adoption rule and thresholds are unchanged: v1 mean F ≥ 45.28, v1 mean P ≥ 40.52, x1 mean F ≥ 51.29, plus the 2-run fallback if the cap stops a run.

   Commit and push it. Record the push time. No model call may come before this push.
5. **Probe.** Make one request for `nvidia/Nemotron-3.5-Super-VL` through `TokenFactoryClient` (one small dev PR, any stage). Confirm that it went to us-north1 and succeeded. If it fails or returns a 404, STOP.
6. **Run 7r, then runs 8 and 9.** Use `--set dev --run 7 --restart --model nvidia/Nemotron-3.5-Super-VL`, then `--run 8` and `--run 9` with the same `--model`.
   - Launch each one detached with nohup, logging to `runs/067-dev7r.log`, `runs/067-dev8.log` and `runs/067-dev9.log`, and poll run.json.
   - If the runner refuses to start for any reason, STOP and report its message verbatim. Don't edit around it.
   - Before run 8, apply the amended stop rule. For each run, record: the PRs with a failed reviewer chunk, their failure strings (first 120 characters), and completion tokens on failed chunks if the records hold them.
   - If the cap stops a run, apply the plan's 2-run fallback as written.
7. **Score and write it up.**
   - Score with `scripts/bench/dev-3-5.ts`.
   - Write `docs/bench/dev-3.5.md` with:
     - per-run and mean P/R/F under v1 and x1 against the baseline;
     - the paired bootstrap (10,000 resamples, seed 67);
     - tokens and cost per PR for 3.5 against 3 Super;
     - a table of failed-chunk PRs per run with their failure strings;
     - the verdict, stated plainly. A loss is recorded as a loss.
   - Append decision 067 to `docs/decisions.md`.
   - Append one new FEEDBACK.md entry for this session's calls: counts, the JSON failures with counts, latency if measured. Refer to the 21 Oct regions entry rather than repeating it.
8. **Gate and PR.** Run `pnpm test` and `pnpm typecheck` as separate commands, commit, and push. Open a draft PR to main titled `067: Nemotron 3.5 Super on dev (decision 067)`. Wait for CI. If it's red, make one fix attempt. Never merge.

## Rules
- **Cal.com is blind:** nothing under `~/Projects/tracehound-bench/test/`, and never `--set cal_dot_com`.
- No ReviewBench data, nothing under its `golden/`.
- Don't open linea-seeded, recall-seeded or tracehound-seeds.
- Never read or ask for Recall's real bug list.
- **May touch:**
  - `scripts/bench/` and its tests (including `packages/analyzer/test/test-set-run.test.ts` and `packages/analyzer/test/dev-3-5.test.ts`);
  - `docs/bench/`;
  - `docs/decisions.md` (append only);
  - `docs/prompts/067-dev-nemotron-3.5.md`;
  - `FEEDBACK.md` (the merge resolution in step 1 and one new entry in step 7);
  - `runs/`.
  - The merge in step 1 brings in main's files. That's expected, but make no edits to them.
- **Don't touch:** `packages/*/src`, `config/`, `.github/`, `viewer/`, `AGENTS.md`, `CLAUDE.md`, `pnpm-lock.yaml`, or anything in `~/Projects/tracehound-ops/`.
- No prompt changes and no `max_tokens` changes.
- No tag operations, and never move review-freeze-1 or eval-freeze-2.
- No history rewriting, no rebases, and no destructive git commands. Stage only by explicit path.
- Nothing else runs on the machine during a gate or a model batch.
- Spend: $8 Nebius at most, which includes the probe.

## STOP AND REPORT
Make your final message the report:
- step 0 results;
- the merge sha and how FEEDBACK.md was resolved;
- the step 3 diff list and commit sha;
- the amendment commit sha, its push time, and the time of the first 3.5 call;
- the probe result and the URL it went to;
- the per-run and mean table;
- the failed-chunk table;
- the bootstrap interval;
- spend from the ledger delta;
- the verdict;
- the PR number, head sha and CI result;
- anything not done.

Also write the report verbatim to `~/Projects/tracehound-brain/inbox/2026-10-2x-sunny-067b.md` (use the real date). Follow the rules in that folder's `inbox/README.md`: touch only that file, then pull, commit and push.
