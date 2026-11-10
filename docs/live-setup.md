# Live setup: TraceHound, CodeRabbit (and later Greptile) on the test-set forks

Written 2026-11-10 by artu1 from `tracehound-testset/run/out/grok.live-setup.md` (doc quotes re-checked by artu1 on the
pages below) and bunny's files in `tracehound-testset/live/` and `scripts/`. **Nothing here has been run.** Every step
that writes to GitHub is Sunny's, by hand, in the order given.

Forks (all public, 0 stars): `SunnyBagal/medusa` (default `develop`), `SunnyBagal/twenty` (`main`),
`SunnyBagal/payload` (`main`), `SunnyBagal/bullmq` (`master`). Case PRs go from `cases/<id>` into `cases/<id>-base`
inside the fork, so **no case PR targets the default branch**.

## 0. Before anything: three blockers for Sunny
1. **Public forks make held-out cases public.** A PR in a public fork is visible to everyone, including artu1 and bunny,
   who must never see held-out cases (firewall). GitHub forks of public repos can't be private. Options: (a) run only
   dev cases on the forks now and decide held-out later; (b) for held-out, use private non-fork mirrors (CodeRabbit's
   free open-source tier covers public repos only, so this needs a paid plan or a different tool setup, and
   `open-prs.ts` requires a fork, so it would need a reviewed change); (c) accept the exposure. artu1 recommends (a).
2. **Actions is ON at the API level on the forks** (`actions/permissions` = `{"enabled":true}`, bunny 2026-11-10), and
   case branches carry upstream workflow files that the default branch doesn't have (dev: medusa 22, twenty 15,
   payload 1 extra paths). **Do not push any case branch until §3 step 1 is done.**
3. **The spend freeze.** The smoke test (§5) runs TraceHound once (one PR, estimated $0.03–0.23 from the pipeline's
   per-PR cost) and needs the freeze lifted, a line in `docs/budget.md`, and artu1's approval. CodeRabbit costs $0.

## 1. CodeRabbit (now)
What the docs say (re-checked 2026-11-10):
- Auto-review covers only PRs into the default branch unless `reviews.auto_review.base_branches` adds more
  ("`base_branches` defaults to only the repository's default branch",
  https://docs.coderabbit.ai/configuration/auto-review).
- **The repo config is read from the PR's head (feature) branch**, not the base
  (https://docs.coderabbit.ai/getting-started/yaml-configuration). A `.coderabbit.yaml` would have to be inside each case
  head, which would change the case diff, so **we do not add one**. Payload's own `.coderabbit.yaml`
  (`high_level_summary: false`, `base_branches: ['^3\.x$']`) is part of the upstream code at those heads; leave it.
- "For public repositories with less than 10 stars, CodeRabbit requires reviews to be triggered manually"
  (https://docs.coderabbit.ai/management/plans), and "regardless of any auto-review configuration, you can always
  trigger a review manually by commenting `@coderabbitai review` … or `@coderabbitai full review`" (auto-review page).
- Open-source repos get Team features free; OSS PR reviews are 1–10 per developer per hour (plans page). **Budget about
  1 hour per 10 PRs, and plan for the worst case of 1 per hour.**

Click steps:
1. Go to https://app.coderabbit.ai, sign in with GitHub as SunnyBagal.
2. Add repositories → install the CodeRabbit GitHub App on the SunnyBagal account with **"Only select repositories"**:
   medusa, twenty, payload, bullmq. Nothing else.
3. Leave repository settings at their defaults. Don't add `base_branches` in the UI or in a file.
4. Per case PR: comment `@coderabbitai full review`. On the first PR, also comment `@coderabbitai configuration` and keep
   the reply (it shows where each setting came from).

## 2. Greptile (later, not now)
- `greptile.json` / `.greptile/`: none on any fork tip or dev base. "Settings are read from the source branch of the PR
  and override dashboard settings" (https://www.greptile.com/docs/code-review/greptile-json-reference); `includeBranches`
  empty means all branches except excluded ones, so non-default bases are not excluded by a documented default.
- Dashboard: "Code Review settings" → "Greptile Review Configuration" sets the trigger (Never / On PR opened / On new
  pushes / On all events); excluded branches are also set there
  (https://www.greptile.com/docs/code-review/controlling-nitpickiness).
- **Free use on public repos or inside forks is not documented** (billing page). Check pricing before installing.
- Click steps when we get there: install the Greptile GitHub App on the four forks only; in the dashboard set the trigger
  to "On PR opened" or "Never" (then trigger by hand), and leave excluded branches empty.

## 3. Fork preparation (costs $0)
**Review status (codex, `tracehound-testset/run/out/codex.live-review.md`):** `scripts/disable-upstream-workflows.ts`
GO; `live/workflows/tracehound-review.yml` **NO-GO** with two P1s: (1) the pinned action's `actions/setup-node` step runs
`yarn --version` with the checked-out PR tree as cwd, and Yarn 1 honours a repo `.yarnrc` `yarn-path`, so PR content
could run before the credentialed step; (2) the action uses `actions/setup-node@v4` by tag, not a full sha.
Upstream workflows on the forks include `push`, `schedule` and `pull_request_target` jobs (files with a `pull_request`,
`pull_request_target`, `push` or `schedule` trigger: medusa 34, twenty 47, payload 11, bullmq 12; `grok.live-setup.md` §2),
and case branches add more paths. Disabling them one by one can't cover paths GitHub hasn't registered yet.
**Plan (codex's recommendation, artu1 agrees): Actions stays OFF on every fork; TraceHound runs from a separate
controller repo; no Nebius secret on any fork.** For each fork `F`:
1. Turn Actions off at the repository level: Settings → Actions → General → "Disable actions", or
   `gh api -X PUT repos/SunnyBagal/F/actions/permissions -F enabled=false`. Check that
   `gh api repos/SunnyBagal/F/actions/permissions` prints `"enabled":false`. Do this before any case push.
2. Do not add a secret or the review workflow to the fork. `disable-upstream-workflows.ts` is then not needed (kept as a
   fallback if Actions ever has to be on).

**Controller repo (to build, then review; nothing exists yet):** a private SunnyBagal repo with a `workflow_dispatch`
workflow taking `fork` (allowlist of the four) and `pr_number`. It needs a TraceHound action change: a target-repo
input (`cli.ts` reads `GITHUB_REPOSITORY` today), a repo-dir input so the PR is checked out into a subdirectory and no
tool runs with the PR tree as cwd, `setup-node` pinned to a full sha and run before the PR checkout, and a token that can
write PR reviews on the forks (a GitHub App or a fine-grained token limited to the four forks: Pull requests write,
Contents read, nothing else). Then a codex review; the pins in the four CI repos move to the new commit.

## 4. Opening case PRs (`scripts/open-prs.ts`, codex GO 2026-11-10)
Dev cases only until §0.1 is decided, and only after §3 step 1 (Actions off) on that fork. Always dry run first, then `--execute`. Example for one case:
`node scripts/open-prs.ts --manifest cases/dev/manifest.json --clone repos/F --fork SunnyBagal/F --ids case-0NN`
(add `--execute` after reading the plan). Batches are capped at 10 with a delay; the resume file prevents duplicates.

## 5. Smoke test: one PR (after §0.3, §3 step 1 and the controller repo has a GO)
1. Pick one small dev case in one fork (artu1 names it in `docs/budget.md` with the spend line).
2. Open its PR with §4 (dry run, then `--execute`). Note the PR number `N`. Check `gh run list --repo SunnyBagal/F`
   is empty (Actions off: nothing ran on the push or the PR).
3. TraceHound: `gh workflow run <controller workflow> --repo SunnyBagal/<controller> -f fork=F -f pr_number=N`, then
   `gh run watch --repo SunnyBagal/<controller>`. Pass: the run is green; a review is posted on PR `N`; the job summary
   shows tokens and $ per stage; still no run in the fork.
4. CodeRabbit: comment `@coderabbitai full review` and `@coderabbitai configuration`. Pass: a review appears; the config
   reply shows no repo YAML for a medusa/twenty/bullmq case.
5. Record: job-summary $ in `docs/budget.md` (compare with the console ≥ 2 h later, rule 5), and the result in
   `.agents/LOG.md`. If anything else ran or the secret appears in any log, stop and disable Actions on that fork.
