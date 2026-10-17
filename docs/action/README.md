# TraceHound pull request review action

TraceHound runs `review-diff-v1` and `review-ctx-v1` in parallel, then pools every diff finding
and each context finding that agrees with none of them using the shared agreement rule.
It runs `verify-ctx-v1` on that pool and posts the verifier's kept findings, including `VERIFY_FAILED`,
as one `COMMENT` review; this three-stage pipeline is `pool-verify-v1`.

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
3. Keep `contents: read` and `pull-requests: write` permissions and the same-repository job
   condition. Repository or organization policy must permit the workflow token to write reviews.
4. Keep the example's `actions/checkout` step with `ref: ${{ github.event.pull_request.head.sha }}`
   and `persist-credentials: false`. The default pipeline needs the target repository at that head
   in `${{ github.workspace }}`; it checks that the head commit exists before any model call.
   Keep the job's 20-minute timeout.

The composite action sets up Node 24 and pnpm, installs the reviewer's existing dependencies
from the action's own repository, and runs its CLI with Node's native TypeScript support.
The context reviewer and verifier read files and run git grep in the target checkout. The example lives here rather than under
this repository's workflows, so adding this action does not enable model calls in TraceHound CI.

| Input | Default | Meaning |
| --- | --- | --- |
| `nebius-api-key` | Required | Pass `${{ secrets.NEBIUS_API_KEY }}`. A missing key fails the action. |
| `reviewer` | `pool-verify-v1` | Accepts `pool-verify-v1` or `review-diff-v1`. Other values fail before model calls. |
| `model` | Each stage's CLI default | Optional Nemotron model ID, passed to every selected stage. An empty value preserves their individual defaults. |
| `max-comments` | `15` | Maximum findings included in reviewer order, counting inline and body findings together. Extra findings are omitted with a count. `0` skips the reviewer. |
| `fixes` | `on` | `on` or `off`. Adds fix proposals and dashboard metadata to `pool-verify-v1`. `off` preserves the previous review payload, without proposals or the metadata footer. |
| `dry-run` | `false` | `true` prints the proposed review payload as JSON and posts nothing. It still runs the reviewer and incurs its Nebius cost. |

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
and rejects unchanged text. A rejected proposal or fix-stage failure leaves the finding intact.

Valid proposals use GitHub's native suggestion block and inclusive right-side line range, so
GitHub can show its **Commit suggestion** button. Read and test a proposal before applying it.
If inline posting receives HTTP 422, the body-only retry includes the fix as a plain diff block.
Set `fixes: 'off'` in the action's `with:` block to disable this stage and preserve the legacy
payload exactly, including omitting the metadata footer. `review-diff-v1` keeps its legacy behavior.
The composite action passes this setting as `TRACEHOUND_FIXES`.

## Dashboard footer

When fixes are enabled for `pool-verify-v1`, each posted review body ends with one hidden line:

```html
<!-- tracehound:v1 {"version":1,"pipeline":"pool-verify-v1","headSha":"<PR head SHA>","pool":3,"kept":2,"posted":1,"fixes":{"attempted":1,"valid":1,"rejected":0},"findings":[{"path":"src/example.ts","line":12,"startLine":11,"source":"both","hasSuggestion":true}]} -->
```

Dashboard readers can match that exact prefix/suffix and parse the enclosed JSON. `pool` and `kept`
count the full pipeline output; `posted` counts findings after the cap, including body findings.
`fixes.attempted` counts included findings considered by the fix stage (not HTTP calls; a retry
can add a call). `valid` counts accepted proposals and `rejected` counts the rest, including no-safe-fix
responses and source/model failures. No finding text or replacement text is included in the JSON.

`findings` follows posting order. `line` is the original finding's head line, possibly `null`;
optional `startLine` is the start of an accepted fix range. `source` is `diff` for a diff-only finding,
`ctx` for a context-only finding, or `both` for a diff finding that agrees with a context finding
under the shared agreement rule. `hasSuggestion` means a validated fix is included; on a body-only
retry the same fix is rendered as a plain diff. The footer uses the triggering `headSha` so readers
can identify stale reviews. No-findings runs continue to post no review.

The entire hidden line and its JSON stay below 8,000 characters. If the line would reach that size,
`findings` is omitted and `findingsTruncated: true` is set; aggregate counts remain. HTML delimiters
in strings are JSON-escaped to keep the hidden comment intact.

## Behavior and limits

- Fork pull requests are skipped: repository secrets are unavailable to forks. Keep the example's
  `pull_request` trigger and same-repository guard. The entry point also rejects fork events.
- `review-diff-v1` retains the original diff-only behavior and does not require a target checkout.
  `pool-verify-v1` adds repository context through the existing context reviewer and verifier.
  Comments remain suggestions that may be wrong; verification is another model judgment.
- On 40 dev pull requests using Nemotron Super, measured pipeline cost was about **$0.032 median,
  $0.23 maximum** per pull request. Summed sequential wall time was **100 s median, 581 s maximum**;
  this action overlaps the two reviewers, so those figures are not measured Action runtimes.
  Prices are third-party estimates. See [pool-verify-v1 benchmark results](../bench/pool-verify.md)
  for the numbers and limits. Cost varies with the selected model and pull request;
  `max-comments` limits publishing and the added fix stage, not reviewer/verifier inference cost.
  The figures above exclude fix proposals. The CLI defaults can differ from the
  benchmark's Super configuration; use `model: nvidia/nemotron-3-super-120b-a12b` to select Super
  for all three stages.
- Stage failure (including a reviewer's reported failed chunk), malformed output, or no findings produces
  a log line, posts nothing, and exits successfully. Missing credentials or GitHub API failures fail
  the action, as does a missing head commit for `pool-verify-v1`. Stage failures log the stage name
  and suppress error text to keep credentials out of logs.
- If GitHub rejects inline comments with HTTP 422, the action retries once with the included findings
  in the review body. Other HTTP failures are reported without automatically retrying a POST.
- Reviews are attached to the triggering head SHA. Events whose head has already changed are skipped.
  A rerun can create another review; the action does not edit or deduplicate prior reviews.
- GitHub diff/API size limits still apply. There is no fallback for an unavailable GitHub diff. Dry-run JSON
  contains finding text in the Actions log, so treat log access like access to review comments.

The REST payload follows GitHub's [create review API](https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request).
Tests use fake GitHub responses and reviewer output, without network access or a real Nebius key.
