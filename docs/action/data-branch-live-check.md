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
