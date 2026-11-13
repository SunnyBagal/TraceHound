# Live setup: TraceHound (local), CodeRabbit and Greptile on the test-set forks

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
4. **Tools:** CodeRabbit (free, manual trigger) and **Greptile (free plan; 100 credits on the account, §2.2), the S1 smoke test, P1's 38 dev
   cases (076g item 2) and held-out.** **Cursor Bugbot is excluded** unless Sunny confirms that Sunny's Cursor plan covers it at
   $0 (limitation: the comparison has no Bugbot row).
5. Dev clones filled (Sunny approved; read-only fetch from the SunnyBagal forks only; §3 step 3).
6. Still blocked: **the spend freeze** (any TraceHound run with `--execute` is paid; it needs the freeze lifted, a line in
   `docs/budget.md` and artu1's approval). CodeRabbit and Greptile Starter cost $0.

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

## 2. Greptile (Starter) and Cursor Bugbot (excluded)
Trigger facts: `grok.triggers.md`, summary in §2.1. `open-prs.ts --trigger` knows all three strings; **don't pass
`bugbot`** unless Sunny lifts the exclusion.
**Greptile budget (1 credit per base review; replaced 2026-11-13, decision 076g item 2):** the account has **100 credits**
(§2.2: new-account credits, as far as Sunny knows), not the Starter plan's 50 a month assumed before. Use: S1's 2 reviews
(the smoke dev case and one clean dev case, decision 076c item 8) + **P1's 38 dev cases** (076g item 2; this replaces "no
other dev runs") = 40, leaving **60** for the 29 held-out reviews plus up to 29 re-triggers (076c item 3: only PRs with no
completed review 24 h after their trigger). **P1's first Greptile trigger waits for Sunny's reading of the credits' expiry
date; they must last past the hand-check.** Check the balance in the dashboard before the held-out window; a review that
doesn't complete costs nothing ("Only completed reviews spend credits"). Use base reviews only (Plus = 3, Apex = 10
credits).
Click steps (Greptile): sign in at https://app.greptile.com with GitHub as SunnyBagal → install the Greptile GitHub App
with "Only select repositories": medusa, twenty, payload, bullmq → Code Review settings → Greptile Review
Configuration → **Automatic reviews: Never**; leave excluded branches empty; then trigger with `@greptileai` per PR.
- Greptile: `greptile.json` / `.greptile/`: none on any fork tip or dev base. "Settings are read from the source branch of
  the PR and override dashboard settings" (https://www.greptile.com/docs/code-review/greptile-json-reference);
  `includeBranches` empty means all branches except excluded ones. Dashboard: "Code Review settings" → "Greptile Review
  Configuration" sets the trigger (Never / On PR opened / On new pushes / On all events)
  (https://www.greptile.com/docs/code-review/controlling-nitpickiness). Install on the four forks only; trigger "Never"
  and comment by hand, so every tool starts in the same window.
- **Bugbot (excluded):** needs a paid Cursor plan (not in Free/Plus; about $1.00–1.50 a run); no app install. If Sunny
  confirms his plan covers it at $0: post `bugbot run` from his user token, and first check `.cursor/config/bugbot.yaml`
  on the case bases (Bugbot reads config from the base).

### 2.1 Trigger summary (grok, read 2026-11-10; artu1 re-found 16 key phrases on the cited pages the same day)
| tool | trigger comment | non-default base | limits / cost | free on a 0-star public fork? |
|---|---|---|---|---|
| CodeRabbit | `@coderabbitai full review`, alone on its line | auto-review: default branch only; the manual command runs anyway (auto-review page) | OSS 1–10 reviews per developer per hour, scoped per repository; each command counts (plans, review-commands) | yes: <10 stars needs the manual trigger, OSS tier, no application documented |
| Greptile | `@greptileai` (or `@greptile`); an excluded base blocks it | yes when `includeBranches` is empty (greptile-json-reference) | credits: base review 1 credit ($1); Starter 50 credits/month for 1 developer; no hourly cap documented (billing-seats, pricing) | not as such: OSS program needs ≥ 50 stars (open-source FAQ); Starter's 50 credits/month would cover 29 + a few dev cases |
| Cursor Bugbot | `bugbot run` or `cursor review`; **ignored when a bot account or GitHub App posts it** | "any PR"; no base filter documented (docs/bugbot) | usage-based, about $1.00–1.50 a run (May 2026 blog); no review quota documented | no: Premium ($30/month) or above, or Teams; not in Free/Plus (pricing) |
Decision (Sunny, 2026-11-10): CodeRabbit + Greptile Starter; Bugbot excluded (limitation). Triggers are posted by
Sunny's own user token via `gh`. Greptile and CodeRabbit read config from the PR head; no `greptile.json` on any fork
tip or dev base (`grok.live-setup.md`).
Source URLs: https://docs.coderabbit.ai/management/plans, https://docs.coderabbit.ai/reference/review-commands,
https://www.greptile.com/docs/code-review/developer-essentials, https://www.greptile.com/docs/account/billing-seats,
https://www.greptile.com/open-source, https://cursor.com/docs/bugbot, https://cursor.com/pricing,
https://cursor.com/blog/may-2026-bugbot-changes. Full quotes: `tracehound-testset/run/out/grok.triggers.md`.

### 2.2 Readings for S1's preconditions (Sunny, 2026-11-13; corrected 2026-11-14)
**Correction (Sunny, 2026-11-14):** the apps were **not** moved to the forks on 13 Nov; Sunny's earlier answers recorded here
were wrong. Until a time on 14 Nov (IST; time not given), **both CodeRabbit and Greptile covered the TraceHound repo only**.
That is why S1's PRs on the fork got no bot activity. At that time (not given) **both were set to the four forks only**
(medusa, twenty, payload, bullmq). Greptile indexing of the forks: **not given** (done or in progress). S1's bot readings are
being re-taken by re-trigger; P1 stays on hold until bunny reports both bots reviewing.
- **Greptile:** Automatic reviews: Never (Sunny checked it directly, 13 Nov).
- **Greptile credits: 100 left** (13 Nov). Expiry or reset date: **not given**. 100 ≥ 37, so S1.md §0 precondition 4 passes
  either way. This is more than the Starter plan's 50 credits/month assumed before (§2 now uses 100); the source of the
  extra 50: new-account credits, as far as Sunny knows.
- **Mac (precondition 7):** on mains power; artu1 read `pmset` at 20:16 IST on 13 Nov: AC power, battery 100%, a
  `caffeinate` assertion held since 16:00:03 (pid 5457, no time limit; 076g item 9).

## 3. Fork preparation (costs $0)
1. **Done 2026-11-10 (artu1):** `gh api -X PUT repos/SunnyBagal/<F>/actions/permissions -F enabled=false` on medusa,
   twenty, payload, bullmq; each reads back `{"enabled":false,…}`. Before any case push, re-check:
   `for f in medusa twenty payload bullmq; do gh api repos/SunnyBagal/$f/actions/permissions; done`.
2. No secret, no review workflow on any fork. `disable-upstream-workflows.ts` (codex GO) is a fallback only if Actions
   ever has to be turned on; `live/workflows/tracehound-review.yml` (codex NO-GO) is not used.

## 3b. TraceHound, locally (`scripts/run-tracehound.ts`, bunny; codex GO 2026-11-10, merged `d482d38`)
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
posts the tools' trigger comments on opened PRs, ≤ 10 per hour per tool and per (tool, fork) (codex GO 2026-11-10). Never pass `bugbot` (excluded); greptile only for the smoke test and held-out. **Re-triggers** (076c items 3, 9): only a PR with no completed review 24 h after its own trigger, in the first free hourly slot (076b); by bunny's re-trigger mode of `open-prs.ts` (records `retriggered:<tool>`, refuses a third) once it merges, by the `gh` lines in `docs/runbooks/H1-window.md` until then (076c item 15). The hourly triggers run from a detached scheduler (076c item 11).

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
One window, run by the window scheduler (`scripts/testset/window-scheduler.ts`, decisions 076c item 11, 076d, 076e;
procedure `docs/runbooks/H1-window.md`): held-out branches are pushed and their PRs opened **one at a time, in base-date
order, each only at its own first-trigger slot** (076d item 1c, 076e item 2; never all at once), each triggered in its
slot, run `run-tracehound.ts` with `--out-dir` outside artu1/bunny's view, score from local output.
