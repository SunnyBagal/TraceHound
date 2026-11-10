# .agents/LOG.md: what happened, one entry per day (for Sunny; agents only grep it)
Dates are local (IST, as in `git log`). Newest last. Current state lives in `.agents/STATE.md`, not here.

## 2026-11-07 (Sat)
- **Changed:** multi-agent research review of the reviewer (`docs/research/2026-11-07/`, REPORT.md; committed 8 Nov as
  `53b6045`). Plan for the next step: generation-recovery A/B, then a TS label pilot.
- **Who:** artu1 with codex, devin, grok.
- **Left:** pre-register and run the recovery A/B; build the test-set pilot.

## 2026-11-08 (Sun)
- **Changed:** decision 073 (recovery A/B) pre-registered, first run voided (Node's 300 s fetch cutoff), restarted; B1
  lenient parser passed, B2 fresh retry failed ($0.73195). 073a: failure audit, product transport fix, defaults lenient
  parser + append retry; B1 relabelled "harmless, benefit unproven"; standing rule: reliability tests bypass the cache.
  Merged to main (`fd36552`). Track B pilot: 13 cases (10 bug, 3 clean) from twenty/medusa, labelled by bunny and devin,
  strict agreement 10/13 (`tracehound-testset/pilot/`). Decision 074 (hard chunks): E won its gate ($3.36463).
  `docs/budget.md` written for $23.39. Decision 075 (verify A vs E): INCONCLUSIVE, one judge HTTP 529 ($0.49090).
  CLAUDE.md gained the "Herdr team" lanes; `docs/nebius-feedback.md` drafted.
- **Who:** artu1 (pre-registrations, runs, merges), bunny (runners, pilot), codex (GO/NO-GO reviews), devin (gates,
  labels), grok (Token Factory docs, licence and leak checks).
- **Left:** close 074/075; explain the ledger-vs-console gap.

## 2026-11-09 (Mon)
- **Changed:** 074/075 closed: E dropped, defaults unchanged, empty replies a known limitation; merged `66e3d8a`. CI
  review made manual (dispatch + `tracehound-review` label) in TraceHound, tracehound-demo, linea-seeded, recall-seeded;
  the Action writes tokens and $ to the job summary (`5fb4973`). Leak audit: 89 CI runs reached the model since 27 Oct
  (est. $5.18–6.68), none since 1 Nov and none in the last 48 h; no Nebius key committed in 53 public repos. Sunny saw
  $19.31 (expected ≈ $22.90), revoked the old key, and froze spending. Likely cause: billing lag (the $23.39 reading
  came right after 074 and did not include it; expected $19.53). Label schema v2 (one primary per case): agreement 13/13.
  Budget re-split for $19.31; `docs/herdr.md`, `.agents/STATE.md`, this log.
- **Who:** artu1 (budget, merges, handoff), bunny (CI change), codex (leak report, reviews), devin (label schema), grok
  (key scan, spend-limit research).
- **Left:** Sunny confirms the hourly console usage (lifts the freeze); Sunny checks the labels in
  `pilot/labels/disagreements.md`; bump the Action pins and create the label in the four repos.

## 2026-11-09 (Mon, evening): Track B scale-up
- **Changed:** `tracehound-testset` pushed to a new **private** repo (SunnyBagal/tracehound-testset). Split before any new
  labelling: universe of 32,233 introducing squash PRs (medusa, payload, twenty), pilot-seen commits pinned to dev, seed
  `0xec6bf5fc` from the hash of the committed list, stratified by repo. Payload added (twenty + medusa could not reach 80).
  Dev 40 (31 bug, 9 clean); held-out 28 (19 bug, 9 clean), 12 bug cases short after every fix pool was used up. Label
  agreement: dev 40/40 strict and bug/clean; held-out 28/28 and 28/28 (numbers only). Leak audit closed on both sides.
  Ledger audit: the other `spend.jsonl` files do not close the $12.7–14.2 gap (`docs/budget.md`). Firewall written into
  both STATE files; artu1 read devin's pane once and saw two held-out candidates, which devin dropped.
- **Who:** artu1 (repo, split, spec, dev compare), bunny (dev mining, labels, fixes), devin (held-out mining, labels;
  hit its daily quota), codex (ledger audit, dev + held-out second labels, review audit, overlap check, held-out fixes),
  grok (leak audit both sides).
- **Left:** Sunny decides how to fill the 12 held-out bug cases and the two schema choices; the spend freeze stays.

## 2026-11-10 (Tue): BullMQ fill, PR opener
- **Changed:** Sunny ruled the held-out shortfall: BullMQ only (fixes since 2026-07-01, ≤ 400 lines, same rules, TS only),
  held-out only, no pre-July fixes, no rule relaxing, ship with what it has. BullMQ added 1 bug case (5 fixes excluded as
  seen by artu1, most others failed the introducer gates): held-out final **29 (20 bug, 9 clean)**, agreement 29/29.
  BullMQ is MIT. `scripts/open-prs.ts` in the testset (dry run default, SunnyBagal-fork-only check, batches ≤ 10, resume
  file): codex NO-GO round 1 (a remote named after the push URL redirected to upstream), fixed, GO round 2; never run for
  real. codex's read-only commands (git log/show/blame/…, gh pr view/list, rg) allowed in `~/.codex/rules/default.rules`.
- **Who:** artu1 (briefs, firewall, compare script, state), codex (BullMQ mining + labels, two reviews), grok (licence,
  second labels, leak audit, agreement), bunny (PR opener + fix); devin out of quota.
- **Left:** Sunny decides when to run the PR opener and the two schema choices; spend freeze stays.

## 2026-11-10 (Tue, later): live setup prep
- **Changed:** codex got `~/Projects/tracehound-testset` as a writable root. grok mapped the forks (bot configs, 104
  trigger-bearing workflows, CodeRabbit/Greptile docs; artu1 re-checked the key quotes). bunny wrote a dispatch-only
  review workflow and an upstream-workflow disabler; codex: disabler GO, workflow NO-GO (setup-node's `yarn --version`
  runs in the PR tree, so a `.yarnrc` `yarn-path` could run PR content; setup-node not sha-pinned). bunny found Actions
  is ON at the API level on the forks and case branches add workflow paths. New plan in `docs/live-setup.md`: Actions
  off on all forks, reviews from a controller repo (to build), CodeRabbit by manual `@coderabbitai full review`. devin
  re-checked 10 dev cases: 9/10 clean, case-027 misattributed. $0.
- **Who:** artu1 (briefs, doc check, live-setup.md), grok (fork facts, docs), bunny (workflow, disabler), codex (review),
  devin (dev re-check).
- **Left:** Sunny: §0 blockers (public forks vs held-out, turn Actions off, spend freeze); controller repo + action change;
  case-027.

## 2026-11-10 (Tue, evening): local runner plan, Actions off, case-027
- **Changed:** Sunny ruled: held-out PRs open only after the final freeze tag (then all tools in one window; dev only
  until then); no controller repo or GitHub review workflow, TraceHound runs locally per case and is scored from local
  output; case-027 replaced if possible. artu1 turned Actions **off** on SunnyBagal/{medusa,twenty,payload,bullmq}
  (each reads back `enabled:false`) and rewrote `docs/live-setup.md`. bunny built `scripts/run-tracehound.ts` (branch
  `run-tracehound` @ `3ce5aa3`, not merged; Action pipeline via `prepareReview`; dry run default; per-case/per-run caps;
  all gates green) and `open-prs.ts --trigger` (coderabbit/greptile/bugbot, ≤ 10/h, user token only). grok found the
  trigger facts (Greptile `@greptileai`, credits; Bugbot `bugbot run`, paid Cursor plan, ignores bot posters; CodeRabbit
  manual on <10 stars); artu1 re-found 16 key phrases on the cited pages. codex's attribution check: held-out 20 bug →
  19 attributed / 1 unmappable (numbers only); dev pass 1 25 attributed, 1 moved, 5 missing blobs. artu1 filled the
  dev blobs by read-only lazy fetch from the forks (probe 31/31). devin hit its weekly quota; grok replaced case-027
  (medusa #16100 ← #12713) and read case-016 as **drop**. $0.
- **Firewall note:** artu1 ran codex's script once in `--probe dev` mode before seeing that it adds
  `heldout/repos/*/.git/objects` as an alternate object store: counts printed only, no held-out content seen; asked
  codex to make it opt-in. artu1 read devin's screen once (dev task) and saw two introducing-PR numbers devin had
  excluded from held-out earlier (dropped, not held-out cases).
- **Who:** artu1 (Actions, briefs, URL check, hydration, docs), bunny (runner, triggers), codex (attribution; then
  blocked on a permission prompt), grok (trigger facts, case-027, case-016), devin (out of quota).
- **Left:** codex: dev rerun + second label of the new case-027, then GO/NO-GO on the runner and triggers. Sunny:
  case-016, Greptile/Bugbot spend, codex's prompt, the spend freeze.

## 2026-11-10 (Tue, night): dev replacements, clone fill, runner fixes
- **Changed:** Sunny ruled: case-016 dropped (not a bug); dev cases failing attribution replaced (next in screening
  order passing every check, else dev −1); case-002 stays; Greptile free Starter (held-out + 1 smoke test), Bugbot
  excluded (limitation); dev clone fill approved. codex's attribution rerun: dev 26 attributed / 1 moved / 4 not
  attributed (case-003, 025, 028 and grok's first case-027 replacement). grok replaced 5 slots (1 medusa, 4 twenty;
  payload and medusa pools exhausted, fallback b), leak audit 0; codex labelled them blind: 5/5 strict and bug/clean;
  codex flags case-025 unclear. artu1's attribution rerun: dev 30 attributed, 1 moved, 0 not attributed. Dev stays 40
  (31 bug / 9 clean; medusa 16, payload 9, twenty 15). artu1 filled the dev clones: worktree checkout fell back to
  one-blob-at-a-time fetches (commit-graph error), so a batched `fetch --stdin` of the missing ids replaced it:
  94,091 blobs, all 80 case commits complete (`tracehound-testset/scripts/fill-dev-blobs.py`). artu1 gated
  `check-attribution.py`'s held-out reading behind `--heldout-ok`. bunny fixed codex's NO-GO (3 P1, 2 P2) in
  `38c9167`, then round 2's two P2s in `eb41993`; `pnpm test` ×3 green, testset 45/45. live-setup.md: CodeRabbit +
  Greptile Starter, Bugbot excluded. $0.
- **Who:** artu1 (fill, script gate, compare, docs), bunny (runner fixes ×2), codex (attribution rerun, review ×2, blind
  labels), grok (5 replacements, leak audit), devin (out of quota).
- **Left:** codex's round-2 verdict (waiting on Sunny's approval of a test run), then merge; case-025 caveat; freeze.
