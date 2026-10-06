Prompt: decision 050, held-out results import. Folder ~/Projects/TraceHound, fresh session, started by relay. Docs only: no model calls, no analyzer or harness changes.

Read first: CLAUDE.md, docs/decisions.md (049 is the last), docs/eval/protocol.md with Amendment 1, and sections 2, 4, 7 and 11 of ~/Projects/tracehound-ops/briefs/TraceHound_Handoff_Oct6.md. Where the handoff and the repo disagree, the repo wins.

Steps
0. Check: the checkout is on main, clean, level with origin/main, and PR #13's merge is in the log. If not, STOP.
1. Create branch docs/050-heldout-results. Save this prompt verbatim as docs/prompts/050-results-import.md.
2. Verify the sha256 of the two tarballs in ~/Projects/tracehound-heldout/archive/ against section 2 of the handoff. A mismatch is a STOP.
3. Driver scripts. Find drive.sh, passes.sh, rerun.sh, aggregate.mjs and check.mjs under ~/Projects/TraceHound-eval or ~/Projects/tracehound-heldout. Confirm none contains an API key, without printing any match. Pack them unchanged into ~/Projects/tracehound-heldout/archive/heldout-eval-drivers-2026-10-06.tar.gz and record its sha256. List any you cannot find and carry on.
4. Copy results into docs/eval/heldout/. Copy only files that hold ids, counts and metrics. Leave out anything containing task statement text, patch text, test names or agent-written test text, and list what you left out.
5. Recompute every table in section 4 of the handoff from the results and run records. Write docs/eval/heldout-results.md with:
   - the recomputed tables. Where a recomputed number differs from the handoff, use yours and list the difference in your report;
   - the frozen values, the validity checks and every disclosure in section 4 of the handoff, plus one new line: the driver scripts were archived after the evaluation, as a third tarball;
   - the reading in "How to read it", with no significance claims and no pooling with dev results;
   - tasks named by number and group only.
6. Evaluation prompt. Look in ~/Projects/TraceHound-eval/docs/prompts/, then in the appendix of ~/Projects/tracehound-ops/briefs/TraceHound_Handoff_Oct5.md. Save it verbatim into docs/prompts/. If neither exists, record this step as not done.
7. Records: add decision 050 to docs/decisions.md and an entry to docs/build-log.md. Add 049 and 050 to CLAUDE.md. Rewrite the README's claims to match "Positioning must be rewritten" in section 7 of the handoff: remove any claim that the graph improves repair, and state the held-out result plainly.
8. Create a draft GitHub release holding the three tarballs, with their sha256 in the notes. Draft only. Do not publish it.
9. Run the GIT_ environment check from section 11 of the handoff; it must print nothing. Commit, push the branch, open a PR. Wait until CI for the pushed HEAD has completed before you report. If it is red, make one fix attempt, then stop.

Not in this job: publishing the held-out task files or their README (waits on a check by Sunny); the harness scratch-file fix; anything for the finder.

Rules
- May touch in ~/Projects/TraceHound: docs/, CLAUDE.md, README.md. May create the one new tarball in ~/Projects/tracehound-heldout/archive/. Everything else in tracehound-heldout, TraceHound-eval and briefs is read-only.
- Never: move the eval-freeze-2 tag; edit docs/freeze.md, docs/eval/protocol.md, the two existing tarballs or any archived result; merge the PR; publish the release.
- Do not open ~/Projects/Recall. Do not read or catalogue Recall's real bugs.
- Spend: $0 of Nebius credit.
- No destructive git commands. No claims beyond what the records show; losses recorded as losses.
- In your report, use the word "ambiguous" only when you mean relay should stop.

STOP AND REPORT: the PR number and CI state; the three sha256 values and whether the first two matched; every recomputed number that differs from the handoff; files left out in step 4; driver scripts not found; whether step 6 was done; the README claims removed and added; the draft release's URL; anything skipped.
