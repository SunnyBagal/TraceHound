Prompt: agent-v6, mechanical edit fixes and re-freeze. Fresh session in the TraceHound main checkout, one branch build/agent-v6 off origin/main, one commit per phase, pushed after each. Decision 047.

Step 0
- Save this prompt verbatim to docs/prompts/agent-v6.md and commit it.
- Read CLAUDE.md, decisions 043–046, docs/freeze.md, docs/build-log.md, and the agent loop and tool code. Write every contradiction with this prompt to docs/build-log.md. If one blocks a phase, STOP AND REPORT.
- At the start of every phase re-read the Rules block. At the end of every phase append to docs/build-log.md: what was done, gate results, spend.

Why: in the 32 dev runs the agent opened the fault file every time, in both arms. Every submitted run was RESOLVED; all 19 unresolved runs ran out of budget or got stuck, with failed edits ("oldText not found") and calls to a tool that doesn't exist (str_replace_editor). This prompt fixes edit mechanics identically for both arms and changes nothing else about the agent.

Phase 1: measure, no code change
1. From the 32 existing run records, per run: failed edit calls by error type, unknown-tool calls by name, and the argument shapes the model used for str_replace_editor. Table in docs/build-log.md.

Phase 2 (decision 047): edit tool
2. Accept str_replace_editor as an alias of the existing tools, mapping only the argument shapes found in step 1. Do not add it to the tool schemas sent to the model. Any other unknown tool returns one line listing the valid tool names.
3. When an edit's old text is not found: retry ignoring trailing whitespace and line-ending differences, and apply only if exactly one location matches. Otherwise return an error with the closest region of the file's current text, with line numbers, at most 40 lines.
4. Unit tests for 2 and 3. The agent prompt file stays byte-identical (sha256 556861d4…); confirm the hash. The agent label becomes agent-v6.

Phase 3: time to fault file
5. Run records and the runner's output gain, computed on the host after the run: the step of the first successful read of any file changed by the task's seed patch, and tokens used up to that step. Compute the same for the 16 existing frozen-prompt runs (round 1 and runner test) and put the table in docs/build-log.md.

Phase 4: dev batches, runner at concurrency 1, nothing else running
6. Nano, agent-v6: 4 dev tasks x 2 arms x 2 repeats (16 runs). Table beside the 16 frozen-prompt v5 runs: state, end reason, steps, failed edits, unknown-tool calls, step of first fault-file read.
7. Super probe: use the Nemotron Super model id already named in the repo's docs or config. If none is named, list the Token Factory models, report the candidates and skip this step. Otherwise run 4 dev tasks x 2 arms x 1 repeat with the same agent and budgets. Stop the probe if the first run costs more than $0.30. Same table.
8. No tuning after these batches, whatever the result.

Phase 5: re-freeze
9. Update docs/freeze.md for agent-v6 and note that eval-freeze is superseded. Fix the agent version line in README.md. Tag the final commit eval-freeze-2; leave eval-freeze in place. Open one PR. Don't merge it.

Gates, after every phase: full analyzer and viewer suites including the Docker + network files, typecheck, viewer build, version guard; push; CI green. One fix attempt per red gate.

Stop early and report if: the same step fails twice; a gate is still red after one fix attempt; a spend cap is hit; a phase needs a path outside the may-touch list; anything is irreversible or ambiguous.

Rules
- May touch: agent loop and tool code and their tests, the runner and run-record code and their tests, docs/, CLAUDE.md, the agent version line in README.md.
- Not: the agent prompt file, verdict logic (repro check, regression gate, typecheck gate), eval/tasks/, analyzer detectors, the analyzer version, snapshots/, changesets/, the viewer source.
- No changes or pushes to Recall or any other repo.
- Never create, read or look for held-out evaluation tasks. Don't catalogue Recall's existing bugs in this repo.
- Spend: $3.00 of new Nebius spend for the whole prompt, read from the ledger before each model step.
- Before every gate this must print nothing: env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CONFIG)'. Never gate via rebase --exec or hooks.
- No destructive git commands. No claims beyond what ran; record losses as losses.

STOP AND REPORT at the end: contradictions from step 0; the step 1 table; what changed in the edit tool and the prompt-file hash; the time-to-fault-file table for the 16 v5 runs; the v6 Nano table beside v5; the Super probe table, model id and cost per run, or why it was skipped; docs/freeze.md contents; PR and CI URLs; ledger total; everything not done.
