# TraceHound pull request review action

TraceHound runs `review-diff-v1` and `review-ctx-v1` in parallel, then pools every diff finding
and each context finding that agrees with none of them using the shared agreement rule.
It runs `verify-ctx-v1` on that pool and posts the verifier's kept findings, including `VERIFY_FAILED`,
as one `COMMENT` review; this three-stage pipeline is `pool-verify-v1`.

Reviewers and the verifier default to `nvidia/Nemotron-3.5-Super-VL`; fixes stay on 3 Super.
All model calls use Nebius Token Factory. Findings on added
or context lines appear as line comments on the right side of the diff. Findings outside the
diff appear in the review body as `path:line` followed by their text. Every review names the
pipeline and model, counts the findings (pool and kept counts for `pool-verify-v1`), and labels
the comments as model-generated and unverified.

## Setup in another repository

1. Add a repository Actions secret named `NEBIUS_API_KEY` with your Nebius Token Factory key.
2. Copy [example-workflow.yml](example-workflow.yml) to `.github/workflows/tracehound-review.yml`
   in that repository. Replace `@main` with a reviewed TraceHound commit SHA
   containing this action before enabling it.
3. The example has two jobs. `review` gets `contents: read` and `pull-requests: write`; `data`
   writes graph history and is the only job with `contents: write`. For review only, delete the
   `data` job and the `push` trigger. Keep the same-repository PR condition. Repository or
   organization policy must permit these workflow token permissions.
4. Keep the example's `actions/checkout` steps with the head SHA as `ref` and
   `persist-credentials: false`. The default pipeline needs the target repository at that head
   in `${{ github.workspace }}`; it checks that the head commit exists before any model call.
   Keep each job's 20-minute timeout.

The composite action sets up Node 24 and pnpm, installs the reviewer's existing dependencies
from the action's own repository, and runs its CLI with Node's native TypeScript support.
The context reviewer and verifier read files and run git grep in the target checkout. The example lives here rather than under
this repository's workflows, so adding this action does not enable model calls in TraceHound CI.

| Input | Default | Meaning |
| --- | --- | --- |
| `nebius-api-key` | Required | Pass `${{ secrets.NEBIUS_API_KEY }}`. A missing key fails the action. |
| `reviewer` | `pool-verify-v1` | Accepts `pool-verify-v1` or `review-diff-v1`. Other values fail before model calls. |
| `model` | `nvidia/Nemotron-3.5-Super-VL` | Nemotron model ID, passed to every reviewer and verifier stage through `--model`. Explicit `model: ''` preserves each stage's CLI default. Fixes always use 3 Super. |
| `max-comments` | `15` | Maximum findings included in reviewer order, counting inline and body findings together. Extra findings are omitted with a count. `0` skips the reviewer. |
| `fixes` | `on` | `on` or `off`. Adds fix proposals and dashboard metadata to `pool-verify-v1`. `off` omits proposals; partial reviews still include metadata, as do enabled contracts. |
| `dry-run` | `false` | `true` prints the proposed review payload as JSON and posts nothing. It still runs the reviewer and incurs its Nebius cost. |
| `data-branch` | `off` | Set to `on` to write heuristic graph history to `tracehound-data`. Requires `contents: write`. |

## Graph history and permissions

`data-branch: 'on'` opts into a persistent, serverless history on an orphan `tracehound-data`
branch in the installing repository. The workflow token needs `contents: write`; keep
`pull-requests: write` for reviews. Fork PRs are skipped. Use `pull_request`, never
`pull_request_target` with an untrusted checkout. This branch has the repository's visibility:
graph metadata, file paths, declarations, and change information are committed there.

The [example workflow](example-workflow.yml) handles pushes to `main` (replace that with your
default branch), plus PR opens, updates, reopenings, and closures. Its two jobs have separate
concurrency groups. Reviews are grouped per PR with `cancel-in-progress: true`, so a newer push
cancels a superseded review. Data writes are grouped per repository with
`cancel-in-progress: false`, so they run one at a time and a running write is never cancelled.
GitHub still keeps at most one *pending* job per group: when three or more events arrive while a
write runs, the older pending ones are cancelled and their history is never written. A later
push writes the newest snapshot, but a dropped PR close leaves that PR's entries `open`.
The `data` job uses full checkout history (`fetch-depth: 0`) for the changes CLI and
`max-comments: '0'`, so its review step makes no model call and posts nothing. Push and closed
events skip the reviewer. The data step runs after the review step even if review failed, uses
heuristic naming, and makes no model calls.

The data step shares its job's `timeout-minutes` with the review step. With `data-branch: 'on'`
on a job that also reviews, the data step gets only what the review leaves of the 20 minutes. If
the job times out after the review posts, the data write is lost and the job is marked failed,
because `continue-on-error` does not cover a job timeout. That single-job setup is the only one
that records `reviewFooter` (the footer file stays on the review job's runner), but its shared
concurrency group cannot cancel superseded reviews without also cancelling history writes. The
example's separate `data` job has its own timeout and records no `reviewFooter`.

Default-branch pushes write `snapshots/<sha>/<analyzerVersion>.json` and
`snapshots/index.json`, using the analyzer's viewer-compatible manifest. PR events write
`changesets/pr-<number>-<headSha7>.json` and a JSON array in `changesets/index.json`.
Each array entry contains `id`, `repo`, `pr`, `title`, `headSha`, `baseSha`, and `state`.
`baseSha` is the merge base of the PR's base and head, and the change set diffs from it. If the
checkout lacks it, the data step fetches the base commit (unshallowing a shallow checkout)
without credentials, so a private repository needs the example's `fetch-depth: 0`.
It also contains the parsed `reviewFooter` when this run successfully posted a review with
a matching `tracehound:v1` footer. Only the review body's last line is read as the footer, so
finding text that quotes a footer-like comment is never recorded; the review step hands it to the
data step as a plain JSON file. Closing a PR marks every recorded head of that PR `merged`
or `closed`; reopening updates the current head to `open`. Files are retained.
States never move backwards, so a re-run of an older event cannot undo a newer one: `merged`
beats `closed`, `closed` beats `open`, and only a `reopened` event returns a `closed` entry to
`open`. A push moves the manifest's `latest` only when its commit descends from the recorded
latest or is the default branch's current tip; otherwise its snapshot file is written and
`snapshots/index.json` is left alone.

Both analyzer commands use the installing repository's `tracehound.json` when present.
Repositories without TypeScript sources and failed analyzer runs write nothing and log one
line. Data failures never fail the review step's job, except for the job timeout above. A non-fast-forward push, or a remote
`cannot lock ref` / `failed to update ref` rejection from a concurrent writer, is retried once by
fetching and reapplying the index update; a second rejection is skipped. Authentication and
permission failures are never retried. The token is passed
only to the git that writes the temporary data-branch clone, through its environment, and is
never stored in a remote URL or config file; that git ignores global and system config. Git in
the checked-out workspace gets no token and keeps the runner's config, such as the
`safe.directory` entry `actions/checkout` writes in container jobs.
The branch remains in place if you later turn the input off. `dry-run` controls review posting
only; leave `data-branch` off when you also want to avoid committing history.

## Fix suggestions

With `pool-verify-v1`, fixes default to `on`. After context verification and the `max-comments`
cap, each included finding gets one extra Nemotron Super proposal through the existing Nebius
client and budget, with at most four calls in parallel. Invalid JSON gets one retry. Fix calls
always use `nvidia/nemotron-3-super-120b-a12b` at temperature 0, independently of the `model` input.
The model sees the finding, a numbered window of the file at the PR head (40 lines on each side),
and that file's diff hunks. For a finding without a line, the window centers on the first diff hunk.

Fixes are **model-generated and not tested**. They are a product feature and are **not part of
the benchmarked reviewer**; candidate generation, pooling order, and verification remain unchanged.
The prompt asks for only the reported defect to be fixed, preserving style and indentation,
without new dependencies, and for no proposal when unsure. Validation accepts at most 15 existing
lines and 15 replacement lines, requires every affected line to be on the right side of the diff,
and rejects unchanged text. The range must contain the finding's line; if that line is `null`,
the entire range must consist of added lines. A rejected proposal or fix-stage failure leaves
the finding intact at its original line.

Valid proposals use GitHub's native suggestion block and inclusive right-side line range, so
GitHub can show its **Commit suggestion** button. Read and test a proposal before applying it.
If inline posting receives HTTP 422, the body-only retry includes the fix as a plain diff block.
If the original text contains three or more consecutive backticks, the retry replaces that diff
with `fix withheld: unsafe to render` to avoid escaping the Markdown fence.
Set `fixes: 'off'` in the action's `with:` block to disable this stage and preserve the legacy
payload exactly when no chunks fail and contracts are off, including omitting the metadata footer.
Partial reviews still include their metadata footer. `review-diff-v1` keeps its legacy behavior.
The composite action passes this setting as `TRACEHOUND_FIXES`.

## Dashboard footer

When fixes are enabled for `pool-verify-v1`, or its review is partial, each posted review body ends with one hidden line:

```html
<!-- tracehound:v1 {"version":1,"pipeline":"pool-verify-v1","headSha":"<PR head SHA>","pool":3,"kept":2,"posted":1,"fixes":{"attempted":1,"valid":1,"rejected":0},"findings":[{"path":"src/example.ts","line":12,"startLine":11,"source":"both","hasSuggestion":true}]} -->
```

Dashboard readers can match that exact prefix/suffix and parse the enclosed JSON. `pool` and `kept`
count the full pipeline output; `posted` counts findings after the cap, including body findings.
`fixes.attempted` counts included findings considered by the fix stage (not HTTP calls; a retry
can add a call). `valid` counts accepted proposals and `rejected` counts the rest, including no-safe-fix
responses and source/model failures. No finding text or replacement text is included in the JSON.

When either reviewer has failed chunks, the record also includes `chunkFailed: { diff: n, ctx: n }`,
counting failed chunks separately for the diff and context reviewers. This field is omitted when
nothing fails, preserving the previous output bytes. Partial reviews include it even with fixes off;
in that case the fix counts are zero. The body adds one line:
`N of M reviewer chunks failed (invalid model reply); this review is partial.`
`M` counts all chunks across both reviewers. The verifier is unchanged: `VERIFY_FAILED` findings
are still kept.

`findings` follows posting order. `line` is the original finding's head line, possibly `null`;
optional `startLine` is the start of an accepted fix range. `source` is `diff` for a diff-only finding,
`ctx` for a context-only finding, or `both` for a diff finding that agrees with a context finding
under the shared agreement rule. `hasSuggestion` means a validated fix is included; on a body-only
retry the same fix is rendered as a plain diff. The footer uses the triggering `headSha` so readers
can identify stale reviews. No-findings runs continue to post no review.

The entire hidden line and its JSON stay below 8,000 characters. If the line would reach that size,
`findings` is omitted and `findingsTruncated: true` is set; aggregate counts remain. HTML delimiters
in strings are JSON-escaped to keep the hidden comment intact.

## Cross-file contracts

`contracts` defaults to `'on'`. Alongside the reviewer, `tracehound contracts` deterministically
compares the merge base with the PR head: typed exports and new TypeScript errors in dependent
files, plus stale route, queue, Redis, environment-variable, and event keys. It makes no model
call, installs no dependencies in the PR checkout, and executes no script from the PR's code.
The checker uses TraceHound's bundled TypeScript and reads detached base/head worktrees.

The stage has a **90-second execution budget**, including history lookup and any base fetch.
On timeout, children receive SIGTERM first, then a 5-second grace before SIGKILL if still running.
The stage waits for child termination before returning; if its killed fetch left `shallow.lock`,
it removes only that lock and logs the cleanup. A base fetch starts only with at least 30 seconds
remaining. The analyzer receives the remaining whole seconds minus a 10-second cleanup reserve;
it is skipped as a timeout if that leaves fewer than 5 seconds.
Missing history is fetched without credentials, unshallowing when necessary; private repos
should use `fetch-depth: 0`. It compares against the merge base, never an advanced base tip.
A timeout, error, or invalid report logs `contracts: failed (<reason>)` and leaves model
findings intact. The existing `max-comments: '0'` whole-review skip is retained for data jobs.

Contract findings are always body findings with the current analyzer: it reports only files
the PR did not edit. They appear after the model disclaimer under
**Files you didn't edit that depend on this change**, with up to 10 linked
`path:line` entries at the head SHA, a one-line reason each, and `and N more` for overflow.
These entries do not count against `max-comments` for model findings. The retained inline
delivery, inline cap, and ±3-line deduplication paths cannot trigger with today's analyzer output.
Contracts bypass
maintainer-feedback suppression and model fix generation. Neither the deterministic gate
nor an additional evidence verifier is wired into this stage.

Enabled runs add `contracts: { status: "ok" | "failed", inline, body, ms }` to the footer;
valid reports also include `typed: "complete" | "skipped-no-tsconfig" | "skipped-budget" | "skipped-error"`.
Skipped typed checks retain keyed findings with status `ok` and log
`contracts: typed check skipped (<reason>); key checks only.` Counts describe displayed
contract entries, separate from pipeline/model counts; `inline` is currently always zero.
The hidden footer remains the review's last line.
If `repo-dir` is empty or `git rev-parse --git-dir` fails, the stage logs
`contracts: skipped (no checkout)`, adds no section or footer field, and
leaves the posted output byte-identical to `contracts: 'off'`. This supports
`review-diff-v1` without a checkout; `pool-verify-v1` still requires one.
To disable the stage, set `contracts: 'off'` in the Action's `with:` block. Off skips the checker
and preserves the previous posted bytes, including leaving the existing footer unchanged
rather than adding an `off` field. The composite passes the input as `TRACEHOUND_CONTRACTS`.

## Maintainer feedback

Set `learn: 'on'` with `pool-verify-v1` to suppress findings similar to comments maintainers
rejected. It defaults to `'off'`, preserving posted output byte for byte. The contents-write
data job collects feedback; the read-only review job applies it and records each suppression
in the footer. Run data before review (`review.needs: data`) for feedback to apply on the next
push. [Learning setup, reset, conventions CLI, and scripted demo](../learn.md).
This changes what is posted; it is not measured by the benchmark.

## Behavior and limits

- Fork pull requests are skipped: repository secrets are unavailable to forks. Keep the example's
  `pull_request` trigger and same-repository guard. The entry point also rejects fork events.
- `review-diff-v1` retains the original diff-only behavior and does not require a target checkout.
  `pool-verify-v1` adds repository context through the existing context reviewer and verifier.
  Comments remain suggestions that may be wrong; verification is another model judgment.
- On the 40 dev pull requests, 3.5's measured pipeline cost was a median of about **$0.06 per PR**
  versus **$0.03** for 3 Super ($0.063 versus $0.031), from
  [decision 067's dev results](../bench/dev-3.5.md). The decision used two completed 3.5 runs;
  these are dev measurements, not measured Action runtimes. Prices are third-party estimates.
  Cost varies with the selected model and pull request;
  `max-comments` limits publishing and the added fix stage, not reviewer/verifier inference cost.
  The figures above exclude fix proposals. Fixes stay on 3 Super because that stage was not
  measured on 3.5. Use `model: nvidia/nemotron-3-super-120b-a12b` to select 3 Super for reviewers
  and the verifier, or explicit `model: ''` for the analyzer CLIs' individual defaults.
- In `pool-verify-v1`, a failed reviewer chunk contributes no findings; successful chunks' comments
  are pooled and verified as usual. This matches how decision 067 was measured. The pipeline
  returns no review only if both reviewers failed every chunk, a process error occurs, or output
  is invalid. No findings still means nothing is posted. A partial review includes the line and
  footer counts described above. `review-diff-v1` retains its all-or-nothing chunk behavior.
  These skips log a line and exit successfully. Missing credentials or GitHub API failures fail
  the action, as does a missing head commit for `pool-verify-v1`. Stage failures log the stage name
  and suppress error text to keep credentials out of logs.
- If GitHub rejects inline comments with HTTP 422, the action retries once with the included findings
  in the review body. Other HTTP failures are reported without automatically retrying a POST.
- Reviews are attached to the triggering head SHA. Events whose head has already changed are skipped.
  A rerun can create another review; the action does not edit or deduplicate prior reviews.
- Each data run fetches and checks out the whole `tracehound-data` tip tree, which grows by one
  snapshot per default-branch push and is never pruned, though only the two `index.json` files
  are read (backlog: a blobless or sparse checkout of those files).
- GitHub diff/API size limits still apply. There is no fallback for an unavailable GitHub diff. Dry-run JSON
  contains finding text in the Actions log, so treat log access like access to review comments.

The REST payload follows GitHub's [create review API](https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request).
Tests use fake GitHub responses and reviewer output, without network access or a real Nebius key.
