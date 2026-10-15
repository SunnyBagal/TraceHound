# AGENTS.md: rules for every coding agent in this repo

This file is for agents that are not Claude Code (Codex, Grok Build, others). Claude Code reads CLAUDE.md; the rules below repeat the ones that matter for everyone. Where they disagree, CLAUDE.md wins.

## Who works where

- Benchmark lane (relay, Claude Code): `~/Projects/TraceHound`, branches `build/*` and `docs/*`. Owns `packages/analyzer/`, `docs/decisions.md`, `docs/bench/`, `scripts/bench/`.
- Product lane (Codex): `~/Projects/TraceHound-codex`, a separate git worktree, branches `codex/*`. Owns `.github/actions/`, `packages/action/`, `docs/action/`, `docs/demo/`.
- Never edit another lane's paths. Never work in another lane's checkout.
- Every change goes through a PR. Never merge your own PR. Never force-push or rewrite history.

## Blindness (non-negotiable)

- Cal.com is the benchmark's test set. Never open, fetch, print or summarise anything about the Cal.com pull requests, their golden comments, other tools' review comments on them, or per-comment score detail.
- Never open `~/Projects/tracehound-bench`, `~/Projects/tracehound-ops`, `~/Projects/TraceHound-eval`, `~/Projects/tracehound-heldout` or `~/Projects/Recall`.
- Never copy text from the benchmark dataset into code, tests or docs. Counts only.

## Models and keys

- The product's model calls go to Nemotron on Nebius Token Factory (hackathon rule). Do not add calls to any other model provider in product code.
- Never print, log or commit `NEBIUS_API_KEY` or any other secret. Tests never hit the network.

## Gates

- Before any test, typecheck or build, this must print nothing:
  `env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'`
- Run gates in a plain shell, never through git hooks or `git rebase --exec`.
- `pnpm test` and `pnpm typecheck` must pass before you open a PR.
- Stage files by explicit path. Do not use `git add -A`, `git add .` or `git commit -a`.

## Stack

- pnpm workspaces, Node >= 24, TypeScript run through Node's native type stripping: `.ts` import extensions, erasable-only syntax (no enums, no parameter properties, no namespaces).
- Ask the owner before adding a dependency.

## Reporting

End every task with: PR number and head sha, test and typecheck results with counts, files changed, and anything not done. No claims beyond what ran.

## Code Review Rules

Treat every rule below as P1 when it is broken.

### Blindness
- Any text that looks copied from benchmark golden comments or from another tool's review comments, in code, tests, fixtures or docs.
- Any code path that could read, fetch, clone, review or score Cal.com pull requests or data (for example a repo list or fetch script that does not refuse calcom/cal.com).
- Any reference to `~/Projects/tracehound-bench`, `tracehound-ops`, `TraceHound-eval`, `tracehound-heldout` or `Recall` paths from product code under `packages/action/`, `.github/actions/` or `docs/action/`.

### Lanes
- A PR from a `codex/*` branch that changes files outside `.github/actions/`, `packages/action/`, `docs/action/`, `docs/demo/` and `AGENTS.md`.
- A PR from a `build/*` or `docs/*` branch that changes files under `.github/actions/`, `packages/action/`, `docs/action/`, `docs/demo/` or `AGENTS.md`.

### Benchmark integrity
- A change to a frozen prompt or to the judge `bench-judge-v1` (prompt text, model, temperature, matching rules) without a new decision entry in `docs/decisions.md`.
- In `docs/bench/*.md` and `docs/decisions.md`: a precision, recall or F value that does not follow from the counts in the same row (precision = TP/(TP+FP), recall = TP/(TP+FN), F = harmonic mean).
- A results claim that calls a difference of a few points on one run with n under 100 an improvement or a win without saying it is within noise.

### Build and safety
- A new dependency in any package.json.
- Product code that calls a model provider other than Nebius Token Factory.
- A secret (`NEBIUS_API_KEY`, `GITHUB_TOKEN` or any token) that can reach a log, an error message, a file or a commit.
- A test that can reach the network.
