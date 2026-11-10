# Live setup: TraceHound (local), CodeRabbit, Greptile, Cursor Bugbot on the test-set forks

Rewritten 2026-11-10 by artu1 after Sunny's decisions of the same day. Sources: `tracehound-testset/run/out/grok.live-setup.md`
(doc quotes re-checked by artu1 on the pages below), `grok.triggers.md` (trigger facts; see §2), bunny's scripts, codex's
reviews. **Nothing here has been run except §3 step 1.** Every step that writes to GitHub is Sunny's or needs artu1's go.

Forks (all public, 0 stars): `SunnyBagal/medusa` (default `develop`), `SunnyBagal/twenty` (`main`),
`SunnyBagal/payload` (`main`), `SunnyBagal/bullmq` (`master`). Case PRs go from `cases/<id>` into `cases/<id>-base`
inside the fork, so **no case PR targets the default branch**.

## 0. Decisions (Sunny, 2026-11-10) and what is still blocked
1. **Held-out PRs open only after TraceHound is frozen** (a final tag). Then every tool runs on the held-out cases in one
   window. Until then the forks get **dev cases only**. (Closes the old "public forks expose held-out" blocker: the
   exposure happens only after the freeze, when no more tuning is allowed.)
2. **No controller repo and no TraceHound review workflow on GitHub.** TraceHound runs **locally** against each case's
   base..head (`scripts/run-tracehound.ts`, §3). Its findings are scored from the local output; posting them on the PR is
   optional (`--post`). No Nebius secret exists on GitHub anywhere.
3. **Actions is OFF on all four forks** (done 2026-11-10, §3 step 1).
4. Still blocked: **the spend freeze** (any TraceHound run with `--execute` is paid; it needs the freeze lifted, a line in
   `docs/budget.md` and artu1's approval). CodeRabbit costs $0.

## 1. CodeRabbit
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
4. Per case PR: comment `@coderabbitai full review` (`open-prs.ts --trigger coderabbit`, ≤ 10 per hour, §4). On the
   first PR, also comment `@coderabbitai configuration` and keep the reply (it shows where each setting came from).

## 2. Greptile and Cursor Bugbot
Trigger comments, non-default-base behaviour, rate limits and free use: **see `grok.triggers.md`** (summary table copied
into §2.1 once artu1 has checked its URLs). `open-prs.ts --trigger` refuses greptile/bugbot until their strings are
confirmed there and added to its table.
- Greptile: `greptile.json` / `.greptile/`: none on any fork tip or dev base. "Settings are read from the source branch of
  the PR and override dashboard settings" (https://www.greptile.com/docs/code-review/greptile-json-reference);
  `includeBranches` empty means all branches except excluded ones. Dashboard: "Code Review settings" → "Greptile Review
  Configuration" sets the trigger (Never / On PR opened / On new pushes / On all events)
  (https://www.greptile.com/docs/code-review/controlling-nitpickiness). Install on the four forks only; trigger "Never"
  and comment by hand, so every tool starts in the same window.
- Free use on public repos or forks: per `grok.triggers.md`; check pricing before installing either app.

### 2.1 Trigger summary (grok, read 2026-11-10; artu1 re-found 16 key phrases on the cited pages the same day)
| tool | trigger comment | non-default base | limits / cost | free on a 0-star public fork? |
|---|---|---|---|---|
| CodeRabbit | `@coderabbitai full review`, alone on its line | auto-review: default branch only; the manual command runs anyway (auto-review page) | OSS 1–10 reviews per developer per hour, scoped per repository; each command counts (plans, review-commands) | yes: <10 stars needs the manual trigger, OSS tier, no application documented |
| Greptile | `@greptileai` (or `@greptile`); an excluded base blocks it | yes when `includeBranches` is empty (greptile-json-reference) | credits: base review 1 credit ($1); Starter 50 credits/month for 1 developer; no hourly cap documented (billing-seats, pricing) | not as such: OSS program needs ≥ 50 stars (open-source FAQ); Starter's 50 credits/month would cover 29 + a few dev cases |
| Cursor Bugbot | `bugbot run` or `cursor review`; **ignored when a bot account or GitHub App posts it** | "any PR"; no base filter documented (docs/bugbot) | usage-based, about $1.00–1.50 a run (May 2026 blog); no review quota documented | no: Premium ($30/month) or above, or Teams; not in Free/Plus (pricing) |
Consequences: triggers are posted by Sunny's own user token via `gh`, never an app token (Bugbot). Greptile and
Bugbot are not free here: **Sunny decides** whether to pay (Greptile likely fits Starter's 50 credits; Bugbot needs a
paid Cursor plan, about $30–45 for 29 held-out + a few dev runs, estimate from the blog's per-run cost). Bugbot reads its
config from the PR's base, Greptile and CodeRabbit from the head. No `greptile.json` on any fork tip or dev base
(`grok.live-setup.md`); `.cursor/config/bugbot.yaml` on the case bases is **not checked yet** (check before any Bugbot run).
Source URLs: https://docs.coderabbit.ai/management/plans, https://docs.coderabbit.ai/reference/review-commands,
https://www.greptile.com/docs/code-review/developer-essentials, https://www.greptile.com/docs/account/billing-seats,
https://www.greptile.com/open-source, https://cursor.com/docs/bugbot, https://cursor.com/pricing,
https://cursor.com/blog/may-2026-bugbot-changes. Full quotes: `tracehound-testset/run/out/grok.triggers.md`.

## 3. Fork preparation (costs $0)
1. **Done 2026-11-10 (artu1):** `gh api -X PUT repos/SunnyBagal/<F>/actions/permissions -F enabled=false` on medusa,
   twenty, payload, bullmq; each reads back `{"enabled":false,…}`. Before any case push, re-check:
   `for f in medusa twenty payload bullmq; do gh api repos/SunnyBagal/$f/actions/permissions; done`.
2. No secret, no review workflow on any fork. `disable-upstream-workflows.ts` (codex GO) is a fallback only if Actions
   ever has to be turned on; `live/workflows/tracehound-review.yml` (codex NO-GO) is not used.

## 3b. TraceHound, locally (`scripts/run-tracehound.ts`, bunny; codex review pending)
`node scripts/run-tracehound.ts --manifest <case manifest> --clone <git dir> [--ids …] [--execute] [--out-dir …]
[--max-usd-per-case x] [--max-usd-run y] [--post --repo SunnyBagal/<F> --pr-map …]`
- Runs the Action's pipeline (pool-verify-v1, `packages/action/src/pipeline.ts`) on the same commit pair the fork PR shows.
- Dry run by default (plan only, no model call). `--execute` is paid: spend goes through `src/llm/client.ts` and the ledger,
  with a per-case and a per-run cap.
- Output `runs/tracehound/<case>.json` (findings in the neutral format, usage, ledger delta). Held-out output goes to an
  `--out-dir` outside what artu1 and bunny read.
- `--post` (optional) comments the findings on the fork PR under the same upstream-safety guard as `open-prs.ts`.

## 4. Opening case PRs (`tracehound-testset/scripts/open-prs.ts`, codex GO 2026-11-10)
**Dev cases only until the freeze tag.** Actions is off (§3), so pushes run nothing. Always dry run first, then
`--execute`: `node scripts/open-prs.ts --manifest cases/dev/manifest.json --clone repos/F --fork SunnyBagal/F --ids case-0NN`.
Batches are capped at 10 with a delay; the resume file prevents duplicates. `--trigger coderabbit[,greptile,bugbot]`
posts the tools' trigger comments on opened PRs, ≤ 10 per hour (pending codex review).

## 5. Smoke test: one dev PR (after the freeze is lifted and codex GO on the runner)
1. Pick one small dev case in one fork (artu1 names it in `docs/budget.md` with the spend line).
2. Re-check Actions off (§3). Open its PR with §4 (dry run, then `--execute`); note PR `N`. `gh run list --repo
   SunnyBagal/F` stays empty.
3. TraceHound: `run-tracehound.ts --ids <case>` dry run, then `--execute`. Pass: `runs/tracehound/<case>.json` has status
   `ok`, findings, usage; the ledger delta is under the cap. Optional `--post --repo SunnyBagal/F`: one comment on PR `N`.
4. CodeRabbit: `open-prs.ts --trigger coderabbit --ids <case>` (or comment by hand) plus `@coderabbitai configuration`.
   Pass: a review appears; the config reply shows no repo YAML for a medusa/twenty/bullmq case.
5. Record: the case's $ in `docs/budget.md` (compare with the console ≥ 2 h later, rule 5), and the result in
   `.agents/LOG.md`. If any workflow ran on the fork, stop and re-disable Actions.

## 6. Held-out (only after the freeze tag)
One window: open all held-out PRs (`open-prs.ts` on the held-out manifest, run by an agent allowed to read held-out),
trigger every tool, run `run-tracehound.ts` with `--out-dir` outside artu1/bunny's view, score from local output.
