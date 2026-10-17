# Seeded reviewer demo

Repository: [SunnyBagal/tracehound-demo](https://github.com/SunnyBagal/tracehound-demo).
Its main commit is `55c0dc7416d81387e1b252b9af6b4254e707134f`.
The fresh root commit preserves the Recall tree at `57d920e`, including its MIT
license. The following commit adds the demo introduction and review workflow.

Four PRs contain a deliberately seeded one-line defect from the public Recall dev
tasks. One PR is a control that only renames a local backend variable. All remain
open; none are intended to merge.

- [#1 — Simplify summary length handling](https://github.com/SunnyBagal/tracehound-demo/pull/1)
- [#2 — Streamline weighted search vector generation](https://github.com/SunnyBagal/tracehound-demo/pull/2)
- [#3 — Adjust session token verification options](https://github.com/SunnyBagal/tracehound-demo/pull/3)
- [#4 — Use default ordering for chat context](https://github.com/SunnyBagal/tracehound-demo/pull/4)
- [#5 — Clarify the local token payload name](https://github.com/SunnyBagal/tracehound-demo/pull/5)

Both repositories pin the action to main commit
`f437ecb76311a712f47a0938b6feba5b294d34d6`.

| PR | Branch | Run conclusion | Review comments | Comments on seeded file and line |
| --- | --- | --- | ---: | ---: |
| 1 | `demo/short-summary` | failure | 0 | 0 |
| 2 | `demo/search-description` | failure | 0 | 0 |
| 3 | `demo/session-expiry` | failure | 0 | 0 |
| 4 | `demo/chat-recent` | failure | 0 | 0 |
| 5 | `demo/control-rename` | failure | 0 | N/A |

Failed step for all five runs:
`Run SunnyBagal/TraceHound/.github/actions/tracehound-review@f437ecb76311a712f47a0938b6feba5b294d34d6`.

Run records: [#1](https://github.com/SunnyBagal/tracehound-demo/actions/runs/39021201460),
[#2](https://github.com/SunnyBagal/tracehound-demo/actions/runs/39021221484),
[#3](https://github.com/SunnyBagal/tracehound-demo/actions/runs/39021225556),
[#4](https://github.com/SunnyBagal/tracehound-demo/actions/runs/39021228580), and
[#5](https://github.com/SunnyBagal/tracehound-demo/actions/runs/39021233279).

The failed runs do not establish defect detection or a successful quiet control.
No review was posted on any of these PRs. Only metadata and comment counts are
reported here; workflow logs and comment text are omitted.
