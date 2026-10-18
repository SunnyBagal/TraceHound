# Round 1 summaries — 18 Oct 2026

The follow-up starts from main `e95ef20`, which contains the merge of PR #35 (`3113c3a`). Step 0 fetched main without force, created `ui/round-1-summaries`, and confirmed a clean worktree before any Nebius request. The referenced `ui-01-codex.md` filename was not found locally; the step 9 text already supplied in the task conversation was followed, with the owner's follow-up replacing the old branch/PR destination.

Both temporary clones were refreshed from their remote main branches. Recall remains at `20ac149ea593ccc032426674ec36927da3f30f16`; tracehound-demo remains at `efc58448e828167d909bedca5b3f7a697449c7fd`. The existing CLI ran with `--naming llm --model nvidia/nemotron-3-super-120b-a12b` and `configs/recall.tracehound.json`, without changing the analyzer. The model received extracted naming facts only. Temperature was 0, thinking was disabled, and the existing deterministic name checks and heuristic fallback stayed active.

The two processes shared a $0.20 ceiling: each received the remaining run allowance and the same baseline-plus-$0.20 total cap. Ledger baseline was 0 entries / $0. The final ledger contains 8 successful completion requests, 2,689 input tokens and 277 output tokens, for **$0.001056** using the configured $0.30/$0.90 per million input/output tokens. Both free model-list checks succeeded. There were no HTTP failures or timeouts. One proposed name failed the deterministic scope check and retained its heuristic fallback; no retry was made.

## Published summaries

Each stored summary has `naming.source: "llm"` and `naming.model: "nvidia/nemotron-3-super-120b-a12b"`. The viewer discloses **Nemotron 3 Super**, with summaries marked unverified. Existing heuristic subtitles remain unchanged.

| Repo | Component id | Model-written name | Model-written summary |
| --- | --- | --- | --- |
| Recall | `recall-backend:shared` | Shared Utilities | Provides common types, database configuration, and services used across Brainly backend modules. |
| tracehound-demo | `recall-backend:shared` | Shared Utilities | Provides reusable TypeScript types, database configuration, and AI service helpers for backend modules. |

For each repo, the existing `summary: false` rules suppress summaries for `recall-backend:worker`, `bullmq:content-processing`, and `recall-backend:brainly-server`. The existing naming CLI skips the fixed-name overrides `redis:redis-url`, `recall-backend:queue`, and `recall-frontend:brainly-frontend-app`; their names are retained, and no summaries were added by hand. Consequently there is one retained generated summary per repo.

Names accepted by the naming pass are also stored. Recall accepted 4 of 4 names; tracehound-demo accepted 3 of 4, with its worker keeping the heuristic name after the scope-check rejection. All component ids, kinds, files, routes, memberships, entry points, counts, heuristic subtitles, edges, file facts, evidence, warnings and ignore lists were compared with the previous published snapshots and remain unchanged. Commit-date/branch metadata and the demo display name were preserved. Both repos still have 2 orphan-file warnings.

## Validation

Each logical commit was checked with the full tests, typecheck, viewer static build and snapshot version guard. The Git override environment check printed nothing before the gates. Viewer tests cover the Super provenance label, stored summary disclosure, fixed-name preservation and `summary: false` suppression. All model interactions occurred in the naming CLI, outside tests; tests use offline fetch stubs.

Final gates: `pnpm test` passed **737 tests** with **6 skipped** (action 64, analyzer 509, viewer 164; 66 test files passed and 5 skipped). `pnpm typecheck` passed for all 3 packages. `pnpm --filter @tracehound/viewer build` and the snapshot version guard passed.

The dated FEEDBACK entry records the requests, tokens, spend, validation rejection and measured latency. No source details or credentials were included in that entry. No dependency, analyzer source, benchmark configuration or frozen prompt changed. PR #35's branch was not modified.
