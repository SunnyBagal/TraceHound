# ui-02: reviews dashboard

The viewer now opens public TraceHound review findings and suggested fixes, alongside the architecture graph. Reviews are fetched directly from GitHub REST in the browser, with no backend or credentials. The default repository is `SunnyBagal/tracehound-demo`.

- `/reviews?repo=owner/name` lists all open and the last 30 closed PRs. Finding and suggestion counts come from the latest valid `tracehound:v1` footer posted by `github-actions[bot]`.
- `/reviews/pr?repo=owner/name&n=3` shows that review’s comments, file/line links, footer source, original code and suggestion. Fix actions link to the GitHub Files tab at the comment. Every finding is labelled “model-generated, not tested”.
- `/benchmark` copies all four aggregate tables from `docs/bench/results.md` at `e4e3e3a8c4d46c270c6027dca564cfe3acb8bc52`, with a source link and limitations. An offline parity test checks every table cell.
- Requests and failures are cached in memory per page. Rate limits stop further requests and show a quiet state; partial list results stay visible. Unreviewed PRs show dashes rather than invented counts.

Validation on 18 October 2026:

- `env | grep -E '^GIT_'` printed nothing before each gate.
- `pnpm test`: 815 passed, 6 skipped (action 120; analyzer 509 passed / 6 skipped; viewer 186).
- `pnpm typecheck`: all three workspaces passed.
- `pnpm --filter @tracehound/viewer build`: static export and snapshot guards passed.
- Each implementation commit passed viewer tests, workspace typecheck and viewer build. One existing graph expansion test timed out on an earlier run; the unchanged test passed on subsequent complete runs.
- Tests use offline fetch fixtures; they do not access GitHub or any model service.
- Chrome loaded the static export and fetched real unauthenticated GitHub API data. The list showed demo PRs #2 and #3 with one finding and one suggestion each. PR #3’s card showed its actual comment, source `both`, line 14, replacement code, disclosure and GitHub fix link.

Screenshots:

- [Real public PR list](pr-list.png)
- [Demo PR #3 finding and fix diff](demo-pr-3-fix-diff.png)

Scope: only `viewer/` and `docs/ui/`; no dependencies added. Nebius calls: 0. Nebius spend: **$0**.

Skipped: the combined “all 50 PRs” view because the source report has no such table. Graph overlays remain ui-03. This viewer does not apply fixes itself; the user reviews and commits suggestions on GitHub. No merge was performed.
