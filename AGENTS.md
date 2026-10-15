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
