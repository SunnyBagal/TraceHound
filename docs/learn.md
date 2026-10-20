# Maintainer feedback (learn-v1)

**This changes what is posted; it is not measured by the benchmark.**

Learning is deterministic. There are no model calls, embeddings, or services beyond the
GitHub API the Action already uses. Candidate generation and `pool-verify-v1` are unchanged.
Conventions are read separately and are never added to a prompt by this stage.

## What counts

The data job scans the repository's last 30 PRs by update time, limited to the past 60 days.
Only review comments and review bodies authored by `github-actions[bot]` qualify. They must
end in a valid `tracehound:v1` footer, or be inline comments in a bot review with that footer.
Another bot's comments and human comments in a marked review are excluded.

Only users whose current collaborator permission is `write`, `maintain`, or `admin` count.
Permissions are checked with `GET /repos/{owner}/{repo}/collaborators/{user}/permission` and
cached for the collection run. Read-only users, triage users, strangers, deleted users, and
permission checks returning 403/404 cannot silence the reviewer. Other API failures abort
collection and retain the previous stored list.

A comment is rejected by a qualifying user's:

- 👎 reaction (`reaction`);
- resolved review thread, provided no commit after the comment's original commit changed the
  same file within ±5 lines (`resolved-unchanged`); or
- reply containing a whole phrase, case-insensitively: `false positive`, `not a bug`, `won't fix`,
  `wontfix`, `nit`, `ignore`, `not an issue`, or `by design` (`reply:<phrase>`).

A qualifying 👍 or reply containing `fixed` or `good catch` removes that comment's rejection.
Negated `not fixed` and `isn't fixed` phrases do not count as acceptance; an independent
unnegated `fixed` or `good catch` in the same reply still does.
The latest timestamped signal wins. Edited replies use their updated time. At equal timestamps,
acceptance wins; other ties use stable signal IDs. A positive and negative phrase in one reply
counts as acceptance. Signals on another comment do not affect this one. Review-body reactions
apply to its body findings; a discussion reply must include that review's exact permalink to
identify its target. Unrelated PR discussion never changes rejection state.

GitHub's [review-thread API](https://docs.github.com/en/graphql/reference/pulls#pullrequestreviewthread)
exposes `isResolved` and `resolvedBy`, but no resolution timestamp. A resolved-unchanged signal
is therefore an inferred baseline dated at the original comment, overridden by subsequent
explicit signals. The collector does not claim to reconstruct the ordering of resolution
against reactions or replies. It checks actual changed patch lines, translating the anchor past
earlier edits. Renames, missing patches, missing anchor commits, and truncated commit history
cannot establish unchanged lines, so they never produce this inferred rejection.

## Storage and matching

The contents-write data job rewrites the complete `feedback/rejected.json` list on
`tracehound-data` each time collection succeeds. Each entry has `repo`, `pr`, `commentId`,
`reason`, `url`, and a fingerprint `{ path, ext, tokens, ids }`. Tokens are a sorted lowercase word
set, with code spans, numbers, punctuation, and a fixed stop-word list removed. `ids` preserves
the contents of code spans: split on anything outside `[A-Za-z0-9_]`, lowercase the parts,
keep parts of at least two characters, deduplicate, and sort. Source text,
user identities, tokens/keys for authentication, and embeddings are not stored. Fingerprint
words and paths still reveal comment content: this branch has the repository's visibility.

Entries are ordered by repository, PR, comment ID, path, and reason. Identical API fixtures
produce identical JSON bytes; there is no collection timestamp. An empty successful collection
rewrites the list as `[]`. Failed collection retains existing feedback while graph history can
still update. Graph failures or repositories without TypeScript can still write feedback.
The existing single concurrent-push retry, secret isolation, and `cleanGitEnv` rules apply.

Findings match when their token-set Jaccard similarity is at least **0.5 on the same path**, or
**0.7 with the same nonempty extension**. There is no semantic inference, stemming, or
cross-extension match. If both fingerprints have identifiers but share none, they never match.
Matching across files also requires a shared identifier. If either side has no identifiers,
only the same-path rule can match. Older stored entries without `ids` are read as `ids: []`,
so they can only suppress findings on the same path. The thresholds are unchanged.
The first matching stored entry explains the suppression.

## Enable and reset

Keep the existing data job with `contents: write` and `data-branch: 'on'`. Its token must also
be able to read pull requests and collaborator permissions; keep `pull-requests: read` there.
The review job retains `contents: read` and `pull-requests: write`. Add to its action inputs:

```yaml
learn: 'on'
```

`learn` defaults to `'off'`. Off performs no feedback fetch and preserves the existing posted
payload byte for byte, including fixes and footer behavior. On applies only to `pool-verify-v1`.
It reads the file using a GET to the contents API at `ref=tracehound-data`; a missing branch or
file is an empty list. Other read errors prevent posting. The filter runs after verification,
before the comment cap and fix proposals. No fix is proposed for a suppressed finding.

Every drop appears in the hidden footer as:

```json
{"suppressed":[{"path":"src/profile.ts","line":20,"matchedComment":"https://github.com/example/widget/pull/3#discussion_r10","reason":"reaction"}]}
```

When at least one finding is suppressed, the review body adds
`N findings suppressed by maintainer feedback (details in footer).`
Even if every finding is suppressed, an explanatory review is posted with zero inline
comments. When findings are suppressed, the footer exists even when `fixes: 'off'`; pipeline
counts still describe the unmodified verifier output. With no suppressions, neither the
suppression body line nor a `suppressed: []` field is added, and fixes-off runs keep their
usual footer-free payload. With no verifier findings, no review is posted.

Collection must finish before review to use feedback on the very next push. The example's
separate jobs otherwise run concurrently. In the installing repository's workflow add
`needs: data` to the existing `review` job (the `data` job must have no dependency on review).
Pin both jobs to the same reviewed Action SHA. A single composite job runs its data step after
review, so its new feedback takes effect on the following run.

To clear stored suppression, delete `feedback/rejected.json` on `tracehound-data` using a
normal commit or the contents API; do not delete or rewrite the branch. Review treats the
missing file as empty. The next successful data run rebuilds it from current signals: remove
old 👎 reactions or add a later maintainer 👍/`good catch`/`fixed` reply to keep old signals from
being learned again. Setting `learn: 'off'` immediately stops applying feedback without
deleting history.

## Convention files (read only)

```sh
pnpm tracehound conventions --repo /path/to/head-checkout --changed 'src/profile.ts,src/api.ts' --out conventions.json
```

The changed list accepts comma or newline separators. The CLI returns `{ files: [{ path,
chars }], text }`; `chars` counts included source characters (UTF-16 units). It reads in this
order: `AGENTS.md`, `CLAUDE.md`, `.cursor/BUGBOT.md`, `.github/copilot-instructions.md`, sorted
`.github/instructions/*.instructions.md`, then `.tracehound/rules.md`. Scoped instructions
require YAML frontmatter with a scalar `applyTo` glob that matches at least one changed path.
Quoted comma-separated globs and brace alternatives such as `**/*.{ts,tsx}` are supported.
Files without matching scope are excluded. Missing files and symlinks leaving the checkout
are ignored. It includes at most 4,000 source characters per file and produces at most 8,000
characters of text including headings and explicit cut notices. Zero-character entries can
show files cut by the total limit. This CLI only reads convention files and writes the requested
JSON; a later job decides whether this text reaches any prompt.

## Scripted demo: SunnyBagal/tracehound-demo

Run as a maintainer. First pin the demo workflow to the reviewed S8 SHA, set `learn: 'on'` in
review, and add `needs: data` as above. Keep the independent data job enabled. The script
creates a synthetic bug PR, waits for TraceHound, reacts to one comment, and pushes an empty
commit so the candidate diff remains unchanged. Existing reviewer and fix calls still incur
their normal costs. This script is documentation; it is not run by tests or this change.

```bash
set -euo pipefail
demo_repo=SunnyBagal/tracehound-demo
demo_dir=$(mktemp -d)
gh repo clone "$demo_repo" "$demo_dir/repo"
cd "$demo_dir/repo"
git switch -c "demo/learn-v1-$(date +%s)"
mkdir -p src
cat > src/learn-demo.ts <<'TS'
export function getProfile(user?: { name: string }) {
  return user!.name;
}
TS
git add src/learn-demo.ts
git commit -m 'demo: unchecked optional user'
git push -u origin HEAD
pr_url=$(gh pr create --repo "$demo_repo" --base main --title 'Demo: maintainer feedback' --body 'Synthetic learning-stage demonstration.')
pr_number=${pr_url##*/}

wait_for_comment() {
  for attempt in $(seq 1 80); do
    comment_id=$(gh api "repos/$demo_repo/pulls/$pr_number/comments?per_page=100" --jq \
      '[.[] | select(.user.login == "github-actions[bot]" and .path == "src/learn-demo.ts")] | last | .id // empty')
    if [ -n "$comment_id" ]; then return; fi
    sleep 15
  done
  echo 'No inline finding appeared; inspect the reviewer run before continuing.' >&2
  exit 1
}
wait_for_comment
comment_url=$(gh api "repos/$demo_repo/pulls/comments/$comment_id" --jq .html_url)
gh api --method POST "repos/$demo_repo/pulls/comments/$comment_id/reactions" -f content=-1 --silent
git commit --allow-empty -m 'demo: repeat unchanged finding after maintainer rejection'
git push origin HEAD
head_sha=$(git rev-parse HEAD)

for attempt in $(seq 1 80); do
  review_body=$(gh api "repos/$demo_repo/pulls/$pr_number/reviews?per_page=100" --jq \
    "[.[] | select(.user.login == \"github-actions[bot]\" and .commit_id == \"$head_sha\")] | last | .body // empty")
  if printf '%s' "$review_body" | grep -Fq 'findings suppressed by maintainer feedback'; then break; fi
  sleep 15
done
REVIEW_BODY="$review_body" COMMENT_URL="$comment_url" node --input-type=module <<'JS'
const body = process.env.REVIEW_BODY;
const footer = /^<!-- tracehound:v1 (.*) -->$/.exec(body.trimEnd().split('\n').at(-1));
if (!footer) throw new Error('No review footer at the new head');
const record = JSON.parse(footer[1]);
if (!record.suppressed?.some(item => item.matchedComment === process.env.COMMENT_URL)) {
  throw new Error('Expected rejection did not match: inspect the generated candidate and feedback file');
}
console.log(`${record.suppressed.length} findings suppressed; source comment recorded in footer.`);
JS
gh pr view "$pr_number" --repo "$demo_repo" --web
```

The reviewer may produce different findings on another run; only fingerprint matching and
feedback collection are deterministic. The fixture-backed replay in the tests fixes reviewer
output and proves the comment is posted first, then withheld after the maintainer reaction.
