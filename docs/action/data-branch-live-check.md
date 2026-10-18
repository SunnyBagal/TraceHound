# Data branch live check

Checked on 2026-10-18 in `SunnyBagal/tracehound-demo` only. The workflow pinned the action to
`ef533299295dfe1837db4311ac390026ab28c1fc` with `data-branch: 'on'`, `contents: write`,
full checkout history, and `max-comments: '0'`. Review logs confirmed the reviewer skipped;
the data writer used no model calls.

| Event | Run | Result |
| --- | --- | --- |
| Enable workflow / push `6a1865d110fbf8c7689e9f59ea4dbfde4b88dae1` | [39148121983](https://github.com/SunnyBagal/tracehound-demo/actions/runs/39148121983) | Success; created orphan branch, snapshot and manifest |
| No-op push `d0c6d396d59e1f4a4f3f2eda372475145d5cc11a` | [39148168834](https://github.com/SunnyBagal/tracehound-demo/actions/runs/39148168834) | Success; appended second snapshot |
| PR #3 reopened | [39148204981](https://github.com/SunnyBagal/tracehound-demo/actions/runs/39148204981) | Success; change set and `open` entry |
| PR #3 closed | [39148399812](https://github.com/SunnyBagal/tracehound-demo/actions/runs/39148399812) | Success; entry changed to `closed`, files retained |
| PR #3 reopened again | [39148485880](https://github.com/SunnyBagal/tracehound-demo/actions/runs/39148485880) | Success; entry changed back to `open` |

The initial close used an older cached merge ref whose workflow did not subscribe to `closed`,
so it produced no run. Reopening refreshed the merge ref; the subsequent close/reopen pair
above verified both transitions with the tested action pin.

The `tracehound-data` branch exists. Its root commit
`b5ae4cf1c9ac587690976476b9121b7e0374f4e0` has zero parents. It contains five files:

- `snapshots/6a1865d110fbf8c7689e9f59ea4dbfde4b88dae1/0.10.0.json`
- `snapshots/d0c6d396d59e1f4a4f3f2eda372475145d5cc11a/0.10.0.json`
- `snapshots/index.json`
- `changesets/pr-3-99147bd.json`
- `changesets/index.json`

The snapshot manifest has two entries, both for `SunnyBagal/tracehound-demo`, analyzer `0.10.0`.
Its `latest` points to `d0c6d396d59e1f4a4f3f2eda372475145d5cc11a/0.10.0.json`.
The change set index finishes with this entry:

```json
{
  "id": "pr-3-99147bd",
  "repo": "SunnyBagal/tracehound-demo",
  "pr": 3,
  "title": "Adjust session token verification options",
  "headSha": "99147bd04fa355ca465bc1b7c512924edc8bfcff",
  "baseSha": "d0c6d396d59e1f4a4f3f2eda372475145d5cc11a",
  "state": "open"
}
```

No `reviewFooter` was expected because reviews were disabled for the live check. Footer
handoff, merged state, analyzer failure, and push retry were verified offline with fakes.
No PR was merged for this check.

Restoration commit `1357386091694a90acd070b20475fbd92e3a051c` restored the original main
workflow byte-for-byte: blob `1ca83722460389336faeca003f2ed25a92e74143`, action pin
`41a92a87deb4ae21bb09de461057adf7560f49d3`. PR #3 remains open and `tracehound-data` remains
in place. The PR head branch's workflow was never edited.

Local gates passed: `pnpm test` (797 passed, 7 skipped: action 137, analyzer 496, viewer 164)
and `pnpm typecheck` (all three workspace packages). No dependencies were added.

## Recheck after the review fixes

Checked on 2026-10-18 in `SunnyBagal/tracehound-demo` after the ultrareview fixes on PR #43.
Demo commit `b8f86d7f63de1e6bb4253d5b331404cedc6f3129` pinned the action to
`1fa94d3760bfacb1108c3efcce6509bcd3a5d6d2`. It used one job shaped like the new example's `data`
job: `contents: write` only, a per-repository concurrency group with `cancel-in-progress: false`,
`fetch-depth: 0`, `max-comments: '0'` and `data-branch: 'on'`. No Nebius call was made. Push and
closed events skip the review step, and on the reopen it logged `max-comments is 0; nothing to post`.

| Event | Run | Result |
| --- | --- | --- |
| Pin push `b8f86d7f63de1e6bb4253d5b331404cedc6f3129` | [39153983741](https://github.com/SunnyBagal/tracehound-demo/actions/runs/39153983741) | Success; snapshot written, `latest` moved to `b8f86d7` (a descendant of `d0c6d39`) |
| No-op push `26c3c541ba439fc427e0b9bac1c78c91fc5b0145` | [39154032404](https://github.com/SunnyBagal/tracehound-demo/actions/runs/39154032404) | Success; `latest` and `defaultRef` moved to `26c3c54`; 4 manifest entries |
| Re-run of the pin push (attempt 2) | [39153983741](https://github.com/SunnyBagal/tracehound-demo/actions/runs/39153983741) | Success; data commit `c678812` rewrote only the `b8f86d7` snapshot file; `latest` stayed `26c3c54` |
| PR #3 closed | [39154128356](https://github.com/SunnyBagal/tracehound-demo/actions/runs/39154128356) | Success; entry changed to `closed` |
| PR #3 reopened | [39154166055](https://github.com/SunnyBagal/tracehound-demo/actions/runs/39154166055) | Success; entry back to `open` with `baseSha` `55c0dc7` (the merge base), not the event's base tip `26c3c54` |

The re-run row is an extra check of the monotonic manifest rule (finding 2); it was not part of
the requested push/reopen pair.

The reopen rewrote `changesets/pr-3-99147bd.json` with base `55c0dc7416d81387e1b252b9af6b4254e707134f`
and 1 modified file (1 modified declaration, 332 unchanged). The first live check above recorded
`baseSha` `d0c6d39`, the base branch tip at that time. Its change set counted 2 modified files
because it charged the PR with a workflow change main made after the branch point. That was
finding 1, seen in real data.

`tracehound-data` is at `3f007818a5320423bc28601ab4f8f6baed79a0d6` with seven files: four
snapshots (`6a1865d`, `d0c6d39`, `b8f86d7`, `26c3c54`, all analyzer `0.10.0`),
`snapshots/index.json`, `changesets/pr-3-99147bd.json` and `changesets/index.json`. The change
set index has one entry, `pr-3-99147bd`, state `open`.

Restoration commit `78aa5b7bfc880a6eb427d240b902d7e46dd3b509` restored the main workflow
byte-for-byte: blob `1ca83722460389336faeca003f2ed25a92e74143`, action pin
`41a92a87deb4ae21bb09de461057adf7560f49d3`. The restored workflow has no push trigger, so that push
started no run. PR #3 remains open and `tracehound-data` remains in place. The PR head branch's
workflow was never edited, and no PR was merged.

Local gates at `1fa94d3` passed: `pnpm test` (813 passed, 7 skipped: action 153, analyzer 496,
viewer 164) and `pnpm typecheck` (all three workspace packages). No dependencies were added.
