# TraceHound pull request review action

TraceHound reads a pull request's title, description, and unified diff, runs the existing
Nemotron reviewer on Nebius Token Factory, and posts one `COMMENT` review. Findings on added
or context lines appear as line comments on the right side of the diff. Findings outside the
diff appear in the review body as `path:line` followed by their text. Every review names the
model, counts the findings, and labels the comments as model-generated and unverified.

## Setup in another repository

1. Add a repository Actions secret named `NEBIUS_API_KEY` with your Nebius Token Factory key.
2. Copy [example-workflow.yml](example-workflow.yml) to `.github/workflows/tracehound-review.yml`
   in that repository. Replace `@codex/github-action` with a reviewed TraceHound commit SHA
   containing this action before enabling it.
3. Keep `contents: read` and `pull-requests: write` permissions and the same-repository job
   condition. Repository or organization policy must permit the workflow token to write reviews.

The composite action sets up Node 24 and pnpm, installs the reviewer's existing dependencies
from the action's own repository, and runs its CLI with Node's native TypeScript support.
No checkout of the pull request's code is needed. The example lives here rather than under
this repository's workflows, so adding this action does not enable model calls in TraceHound CI.

| Input | Default | Meaning |
| --- | --- | --- |
| `nebius-api-key` | Required | Pass `${{ secrets.NEBIUS_API_KEY }}`. A missing key fails the action. |
| `model` | Reviewer's default | Optional Nemotron model ID; an empty value leaves the CLI default in control. |
| `max-comments` | `15` | Maximum findings included in reviewer order, counting inline and body findings together. Extra findings are omitted with a count. `0` skips the reviewer. |
| `dry-run` | `false` | `true` prints the proposed review payload as JSON and posts nothing. It still runs the reviewer and incurs its Nebius cost. |

## Behavior and limits

- Fork pull requests are skipped: repository secrets are unavailable to forks. Keep the example's
  `pull_request` trigger and same-repository guard. The entry point also rejects fork events.
- Context is limited to the diff, title, and description. The reviewer does not read other source
  files, repository history, or a TraceHound graph. Comments are unverified suggestions and may be wrong.
- Cost per pull request is the reviewer's Nebius usage, depending on model and diff size. This
  action adds no model calls of its own. `max-comments` limits publishing, not inference cost.
- Reviewer failure (including a reported failed chunk), malformed output, or no findings produces
  a log line, posts nothing, and exits successfully. Missing credentials or GitHub API failures fail
  the action. Reviewer error text is suppressed to keep credentials out of logs.
- If GitHub rejects inline comments with HTTP 422, the action retries once with the included findings
  in the review body. Other HTTP failures are reported without automatically retrying a POST.
- Reviews are attached to the triggering head SHA. Events whose head has already changed are skipped.
  A rerun can create another review; the action does not edit or deduplicate prior reviews.
- GitHub diff/API size limits still apply. There is no fallback to repository checkout. Dry-run JSON
  contains finding text in the Actions log, so treat log access like access to review comments.

The REST payload follows GitHub's [create review API](https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request).
Tests use fake GitHub responses and reviewer output, without network access or a real Nebius key.
