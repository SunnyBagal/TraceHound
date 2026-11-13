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
- **Then:** codex round 2 GO at `eb41993`; artu1 merged `run-tracehound` (`d482d38`), gates on main green (302 / 1027 +6 skipped / 215, typecheck). **Left:** case-025 caveat; spend freeze.

## 2026-11-11 (Wed): case-025 again, brain backfill, plan audit
- **Changed:** Sunny ruled case-025 (#22392) out: its bug only showed after a later PR. grok replaced it with the next
  twenty candidate passing every check plus a new "visible at the introducing PR" check (3 dropped first; attribution
  100%; leak 0); codex labelled blind: bug/clean agree, strict 0/1 (same defect, two files; open multi-file-primary
  choice). Dev 40 (31/9), attribution 30/1/0. tracehound-brain backfilled by bunny (D062–D075, P010, 7 topic notes;
  index/digest/timeline/NOW/lessons); codex NO-GO (D070 showed precision floors as F floors; 8 P2s), fixed by bunny
  and artu1 (inbox/README rule per Sunny: agents may edit curated notes, codex GO before push; D061 outcome from D062;
  codex-20 inbox report kept with a provenance note; seeded totals labelled unverified), codex GO, pushed `29e8515`.
  grok: 411 vault links, 0 new broken (3 old). Two standing rules in CLAUDE.md/AGENTS.md/STATE: brain at session end;
  plans are hypotheses. Plan audit (`docs/plan/2026-11-10-plan-audit.md`): the planner had dispatched the three audit
  lanes and handed the merge to artu1; 185 claims, 141 verified / 17 contradicted / 21 unsupported / 6 guesses; the
  planner accepted bunny's 6 contradictions; 13 tasks blocked; reserve is inside the $17.25. $0.
- **Who:** artu1 (briefs, rulings applied, label compare, attribution rerun, audit merge, brain push), bunny (brain
  backfill + fixes, stats/budget audit), codex (blind label, brain reviews ×3, internal audit), grok (case-025, vault
  link check, external audit), planner (plan, audit briefs, author's response).
- **Then:** plan-audit brain note pushed `6c4fbb0` after codex NO-GO ×2 (power assumptions, L4 missing) and GO.
- **Left:** Sunny's rulings on the audit corrections and on case-025's primary file; spend freeze.

## 2026-11-11 (Wed, later): S0 rulings, A1, $0 lanes
- **Changed:** Sunny ruled on the audit (S0): corrections, caps, tie rule, gates with error ranges, multi-file rule
  (primary by git path order after a stop on the conflict with devin's rule), metric, window, firewall, hand-check.
  artu1 wrote decision 076 and the budget split (A1, `588f723`) and merged PR #71 (`d04db68`). bunny's caps check: the
  caps as ruled still stop R1/R2/H1 early under a realistic cost spread; options recorded for Sunny. grok: G1 tool facts
  (5/5 quotes re-found), fork default branches moved to the last upstream commit before 2026-07-01 (dry run, then
  apply; read back), two D1 reviews. codex: D1 protocol (two revisions; open choices in §13 for Sunny), multi-file
  overlays (dev 3/31, held-out 1/20), C1 started (B1 NO-GO on 2 P2s; bunny fixed). bunny: B1 lineage, B3 audits
  (contracts off; L3 step 1 31% → 86%), B2 scoring kit. Brain: 076, costs, competitors, strengths-and-gaps, NOW
  (uncommitted, awaiting codex review). $0.
- **Left:** Sunny's rulings on the caps options and D1 §13; codex C1 and brain review; console check.

## 2026-11-11 (Wed, evening): 076a, caps re-check, plan v2
- **Changed:** Sunny ruled on the caps check and the protocol's §13 (decision 076a, `800af8d`): rolling batch caps, R1
  $4.68, R2/H1 via 077 from R1's measured costs, judge-only env caps, §13 items 1–8; item 9 waits for Planner B; D1 not
  merged until Sunny rules on that note. bunny: policy file on B2 (`d415440`), caps re-check with the rolling rule (R1 all
  cases P 0.96; R2/H1 placeholders 0.66/0.71; H1 + reserve 1.00), 077 recipe script. codex C1: B1 GO at `8707752`
  (`bec2ead` added after), B2 NO-GO at `c3fb14e` (fixed at `554cd28`); held-out reach 20/20 (counts). Planner A wrote plan
  v2 (main `2413788`); artu1 confirmed its runner findings 1–3. codex blocked on a permission prompt before its re-review.
  Planner-only folders: `docs/plan/`, `docs/specs/`, `docs/runbooks/`. $0.
- **Left:** codex C1 re-review → merges; brain review → push; D1 rev 3 → push branch for Planner B → grok re-check;
  plan v2 audit; console check.

## 2026-11-11 (Wed, late): bunny as temp orchestrator (artu1 at its session limit until 19:10)
- **Changed:** codex C1 re-review GO on B1 `bec2ead` and B2 `251d6e5` (incl. the 076a policy file; codex's two 076a probes
  fixed first: `..` after a symlink in the dev guard, and hand-check evidence completeness). bunny merged both (merge
  commits `4b70033`, `c379055`; gates on main: action 335, analyzer 1027 +6 skipped, viewer 215, typecheck) and pushed.
  Brain review 4 GO → six brain files committed byte-equal to codex's recorded hashes and pushed (`a4fc2e7`). D1 rev 3
  (`c64e77d`) pushed on `codex/ts-protocol` for Planner B; grok sent its D1 re-check. bunny did the B2 spec follow-up
  (`b2-followup` `3668819`: policy file renamed to `policy.076a.json` for S1, one-rerun refusal, §7 values pinned;
  review pending). codex blocked on a permission prompt. $0.
- **Who:** bunny (orchestration, merges, B2 follow-up), codex (C1 re-review, brain review 4, D1 rev 3), grok (D1 re-check).
- **Left:** Sunny answers codex's prompt; codex plan-v2 audit then b2-followup review; grok D1 re-check; Planner B's note.

## 2026-11-11 (Wed, night): 076b
- **Changed:** while artu1 was away bunny (temp orchestrator) merged B1 (`4b70033`) and B2 (`c379055`) on codex GO, pushed the
  brain (`a4fc2e7`) and D1 rev 3 (`c64e77d`, grok 0 differences); Planner A wrote specs (B1-review, B2, E1, P1, R1, R2, S1),
  runbooks (F1, H1, H2, W1) and the after-held-out backlog. codex's plan-v2 audit: 55 verified / 2 contradicted; P2-1
  (R1/R2 judging envelope) → Sunny's 076b: judging inside the job cap, re-trigger slots, CodeRabbit rate check before the
  window, canary ≤ $0.40 from the reserve, adopted-arm cost reporting, budget.md firewall order fixed. Item g closed.
  Lanes: bunny (policy file + R1 spec env lines, note to Planner A), codex (b2-followup review, D1 rev 4), grok (076b check
  of protocol + H1 runbook). $0.
- **Then (2026-11-11 late / 11-12):** codex: b2-followup GO at `45b48df`; artu1 merged it, but a `git pull --rebase` after
  the local merge flattened it into linear commits on main (`73ddf5c..be3e8fc`, content identical; not rewritten, no
  force-push). D1 rev 4 (076b 2 + 4) and rev 5 (076b 3) pushed (`d62343c`). Brain 076b note: codex NO-GO (canary clause
  too short), fixed, GO, pushed `89a76d3`. grok's 076b check: H1 runbook differs → relayed to Planner A. Planner B wrote
  the D1 review note, a premortem (22 risks, 20 gaps) and a team-process proposal (10 changes). $0.

## 2026-11-12 (Thu): 076c
- **b2-followup note (Sunny):** stays on main as the three linear commits `73ddf5c`, `ffd3eed`, `be3e8fc` (artu1's merge
  commit was flattened by a `pull --rebase`); no force-push. Their files match codex's GO at `45b48df` and the gates passed,
  so the GO stands.
- **Changed:** Sunny's items 1–16 recorded as decision 076c (Planner B's protocol proposals adopted; U1–U3, G1, G3, G10
  ruled; premortem rows 3, 4, 6, 7, 11, 12, 14a assigned; firewall on the forks from T0; all ten team-process changes
  accepted; Planner A's three choices approved; 076b's Touches list). artu1 applied its Touches: AGENTS.md (ownership
  table, Process, firewall), CLAUDE.md (pointer), STATE (rewritten), `_common.md` (rewritten), budget.md (caps
  procedures), live-setup.md (Greptile credits, re-triggers). Briefs in the new template to codex, bunny, grok; note to
  Planner A with 076c's item numbers. $0.
- **Then (2026-11-12/13):** Planner A applied 076c to every file of its own (`6099685` … `fdc2911`). codex: rows 4/7/11
  confirmed; protocol rev 6 (grok clean but for one clause, rev 7 briefed); no U4–U11 disagreement; tag-worktree mechanism
  ready for review; rehearsal running detached. bunny: `b4-076c` (collector completion, guess column, invalid-binding)
  and the re-trigger mode (testset, uncommitted), both to codex review. grok: guess test 0/62; ancestry 7/40 dev and 5/29
  held-out bases contain another case's fix (needs Sunny's ruling before F1). Items 15–17 re-sent by Sunny: already done.

## 2026-11-13 (Fri): 076d
- **Changed:** Sunny's rulings recorded as decision 076d (`8cef322`): ancestry (no case excluded; dev case branches deleted
  from the forks after P1's collection; held-out branches pushed one at a time in base-date order at their own first-trigger
  slot; exposed / unexposed reported separately; grok re-counts exposure at first review, > 0 → Sunny again before F1),
  "in progress" / "skipped" / "paused" messages are `notCompletion`, the window scheduler moves to bunny, the collector
  gets an explicit untriggered-case flag (codex's P2-1 / P2-2 on `b4-076c` and the re-trigger patch; bunny's fixes approved).
  Balance correction under 076c: the 2026-11-09 reading was $19.13 (not $19.31): usable $18.13, unallocated $1.00,
  billing-lag unexplained $0.40; `.env` hard stop 63.15547. Notes to Planner A and B (testset `6eeb9b8`, `a68df6f`); brain
  076d lines added to the pending review, brief amended (`4ca2682`) and sent to codex. `run/comms/planner.a.gaps.md` was
  already committed (`bd5ca83`, unchanged since). Nothing merged: no GO exists ($0).
- **Who:** artu1; lanes pasted by Sunny directly to bunny (P2 fixes), codex, grok.
- **Left:** GOs on the fixed `b4-076c`, the re-trigger patch and `ffb615b` (no reviewer assigned); grok's 076d count; brain GO.
- **Then (2026-11-13, after 04:40 IST):** 076d addendum (e) recorded (`baa31b7`: failed first trigger retried before later
  pushes, `failed-first-trigger` after two; exposure per review from the scheduler's branch log). Merged on codex GO, pull
  first, `--no-ff`: `82b65e4` (scorer pairs + floor 15 + exposed/unexposed split, contains `b4-076c` `85ade2f`; merge
  `2e971c5`), `b696231` (collector `--never-opened`; `a38d3c8`), `b5-window-scheduler` @ `2c51913` (`4b99fb4`); gates on the
  merged tree: action 366, analyzer 1027 + 6 skipped, viewer 215, typecheck clean. Testset re-trigger patch committed
  `060c644` (sha256 `32085be3…`, GO). codex's and grok's held-out reconciliation (counts): 076d's "same exposure" sentence
  was wrong (6 dev-only / 2 held-out-only / 3 both), exposure at first review 0 of 20; correction and Sunny's freeze lift
  (no console check; S1 ratio guard 1.08) recorded (`54b302b`, `47a8d03`). Planner A note revised (`329091b`); brain lines
  updated, brief amendment 2 (`9997e02`) sent to codex for after the r3 rehearsal (09:56 IST). $0.
- **`.env` (2026-11-13, Sunny item 4):** missing newline added on line 10, values unchanged; `TRACEHOUND_BUDGET_TOTAL_USD` is now
  defined twice (line 11 `52`, line 14 `63.15547`). It is read through `capsFromEnv` (`packages/analyzer/src/llm/budget.ts`); the runner `scripts/run-tracehound.ts` passes each stage min(that cap, …);
  every loader is Node's (`process.loadEnvFile` in `bin.ts`, `--env-file` in scripts and the tag-worktree verifier), which
  takes the last value: measured 63.15547 on node v26.13.1. Line 11 is dead but misleading (Sunny's call to delete it).
- **Then (2026-11-13, ~05:00–06:00 IST):** grok briefed (`run/briefs/grok.076d-reviews.md`): **NO-GO `ffb615b`** (tag worktree:
  one stale "keep the spend freeze" sentence; verifier gives 63.15547 with the duplicate cap and refuses an inherited 52)
  and **NO-GO `1a60db5`** (protocol rev 8: exposure from planned order instead of addendum (e)'s branch log; freeze sentence
  and canary row). Nothing merged. grok's inbox note screened by pattern (0 case ids / paths / PRs / dates / forks) and added
  to the brain brief as amendment 3. S1 held until `pa-076d` merges. $0.
- **`.env` (2026-11-13, 076e item 8):** the dead second `TRACEHOUND_BUDGET_TOTAL_USD=52` line deleted; one definition left,
  `63.15547` (loaded value checked); no other value changed.
- **Then (2026-11-13, 13:00–14:30 IST):** decision 076e recorded (`0cf3487`; Planner A's eight open items ruled, window
  option B 22–25 Nov). Planner A's 076d report, claim and done committed (testset `142ee9b`). Briefs: `codex.076e`
  (`36aed1f`; tag-worktree and protocol fixes after the brain review, then the delete-mode review); grok told to review
  `pa-076d`. grok: **NO-GO `0a7a599`** (076e not yet applied; two H1 §3 sentences vs `readPlan`/`spacing`). Nothing merged. $0.
- **Firewall incidents (2026-11-13; 076e addendum d):** (1) artu1, about 13:30 IST, one `git status --short` in
  tracehound-testset: names of untracked files under `heldout/` shown, 8 names; none opened. (2) bunny, at the start of its
  076e task (report written 13:41 IST), one `git status --short` there: names of untracked files under `heldout/` shown,
  count not in its report; none opened. Rule since: testset git only with explicit paths outside `heldout/` (AGENTS.md,
  `_common.md` `7ac7985`).
