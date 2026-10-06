Prompt: decision 050 follow-up: evaluation prompt, driver scripts, results page corrections. Folder ~/Projects/TraceHound, fresh session, started by relay. Docs only: no model calls, no analyzer or harness changes. This takes no new decision number.

Read first: CLAUDE.md, docs/decisions.md (050 is the last), docs/eval/heldout-results.md, docs/eval/heldout/recompute.mjs, and section 11 of ~/Projects/tracehound-ops/briefs/TraceHound_Handoff_Oct6.md. Where the handoff and the repo disagree, the repo wins.

Steps
0. Check: the checkout is on main, clean, level with origin/main, and PR #14's merge is in the log. If not, STOP.
1. Create branch docs/050b-followup. Save this prompt verbatim as docs/prompts/050b-followup.md.
2. Evaluation prompt. Copy the evaluation prompt from the appendix of ~/Projects/tracehound-ops/briefs/TraceHound_Handoff_Oct5.md verbatim into docs/prompts/heldout-eval-run.md. If the file or the prompt is not there, record this step as not done.
3. Driver scripts. They are in ~/Projects/tracehound-heldout/drivers-2026-10-06/, copied there by Sunny on 2026-10-06 with timestamps kept, from the evaluation session's scratchpad under /private/tmp. Confirm, without printing any match, that none contains an API key. Record each file's name, size and modification time. Pack them unchanged into ~/Projects/tracehound-heldout/archive/heldout-eval-drivers-2026-10-06.tar.gz and record its sha256. List any of drive.sh, passes.sh, rerun.sh, aggregate.mjs, check.mjs that is missing.
4. Correct docs/eval/heldout-results.md, from the records, not from memory:
   a. Break the 181 run records down by kind (counted, void originals, Super pass-4 runs, canaries, anything else). The parts must sum to 181 and must agree with "177 reached baseline, 4 did not". If they do not agree, fix whichever statement is wrong and say so in your report.
   b. The page says six request timeouts made runs void, and lists five void runs plus pass 4. State which runs the six timeouts belong to.
   c. State that $6.27 is the ledger total for the whole evaluation, and give the total for the 160 counted runs separately.
   d. Update the two disclosures on the drivers and the prompt to say what now exists, where the drivers were found, and their modification times. Add the third tarball to the Archive table.
5. Other files:
   - README.md: fix the same cost wording if it appears, and replace "before anything is reported" with wording that does not imply a reporting flow exists.
   - CLAUDE.md: fix the same cost wording, and replace "Later: a graph-guided repair agent" near the top with a line consistent with decision 050.
   - docs/decisions.md: add a short dated note under decision 050 listing these corrections. Do not rewrite 050's text.
   - docs/build-log.md: add an entry.
6. Add the third tarball to the existing draft release heldout-eval-2026-10-06 and its sha256 to the notes. Keep it a draft. Do not publish it.
7. Run the GIT_ environment check from section 11 of the handoff; it must print nothing. Commit, push, open a PR. Wait until CI for the pushed HEAD has completed. If it is red, make one fix attempt, then stop.

Rules
- May touch in ~/Projects/TraceHound: docs/, CLAUDE.md, README.md. May create only the drivers tarball in ~/Projects/tracehound-heldout/archive/. Everything else in tracehound-heldout (the drivers folder included), TraceHound-eval and briefs is read-only.
- Never: move the eval-freeze-2 tag; edit docs/freeze.md, docs/eval/protocol.md, the existing tarballs or any archived result; merge the PR; publish the release.
- Do not open ~/Projects/Recall. Do not read or catalogue Recall's real bugs.
- Spend: $0 of Nebius credit.
- No destructive git commands. No claims beyond what the records show; losses recorded as losses.
- Your final message must be the full STOP AND REPORT. Send nothing after it.

STOP AND REPORT: the PR number and CI state on its HEAD; whether step 2 was done; the drivers' names, sizes, modification times and the tarball's sha256; the breakdown from 4a and the answer to 4b; any statement on the page you found wrong; the draft release's asset list; anything skipped.
