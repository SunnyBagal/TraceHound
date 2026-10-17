# TraceHound reviews its own pull requests

The TraceHound review workflow checks same-repository, non-draft pull requests when
they are opened, updated, reopened, or marked ready for review. It checks out the PR
head without persisted credentials, runs the reviewer, and posts up to ten review
comments. See the [pull request list](https://github.com/SunnyBagal/TraceHound/pulls).

The action code comes from the full main-commit SHA pinned in
`.github/workflows/tracehound-review.yml`. After action changes merge into main,
update that pin by hand to the reviewed main commit's full 40-character SHA in a new
pull request. The action code therefore stays tied to reviewed main code while the
checkout supplies the PR head for analysis.
