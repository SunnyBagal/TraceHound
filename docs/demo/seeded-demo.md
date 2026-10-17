# Seeded reviewer demo

Repository: [SunnyBagal/tracehound-demo](https://github.com/SunnyBagal/tracehound-demo).
Its main commit is `efc58448e828167d909bedca5b3f7a697449c7fd`.
The fresh root commit preserves the Recall tree at `57d920e`, including its MIT
license. Later commits add the demo introduction and review workflow, then re-pin
the action to the pnpm setup fix.

Four PRs contain a deliberately seeded one-line defect from the public Recall dev
tasks. One PR is a control that only renames a local backend variable. All remain
open; none are intended to merge.

- [#1 — Simplify summary length handling](https://github.com/SunnyBagal/tracehound-demo/pull/1)
- [#2 — Streamline weighted search vector generation](https://github.com/SunnyBagal/tracehound-demo/pull/2)
- [#3 — Adjust session token verification options](https://github.com/SunnyBagal/tracehound-demo/pull/3)
- [#4 — Use default ordering for chat context](https://github.com/SunnyBagal/tracehound-demo/pull/4)
- [#5 — Clarify the local token payload name](https://github.com/SunnyBagal/tracehound-demo/pull/5)

Both repositories pin the action to the commit proposed in
[TraceHound #34](https://github.com/SunnyBagal/TraceHound/pull/34):
`50e1d4a6a0797933dd8c66d1010cc8484aeaa51f`. The fix explicitly pins pnpm to
`11.20.0`. The demo PRs were closed and reopened after updating main's workflow so
that each run used a fresh merge commit with this pin.

| PR | Branch | Run conclusion | Review comments | Comment on seeded file and line |
| --- | --- | --- | ---: | --- |
| 1 | `demo/short-summary` | success | 0 | No |
| 2 | `demo/search-description` | success | 1 | Yes |
| 3 | `demo/session-expiry` | success | 1 | Yes |
| 4 | `demo/chat-recent` | success | 0 | No |
| 5 | `demo/control-rename` | success | 0 | N/A |

Run records: [#1](https://github.com/SunnyBagal/tracehound-demo/actions/runs/39027373766),
[#2](https://github.com/SunnyBagal/tracehound-demo/actions/runs/39027377780),
[#3](https://github.com/SunnyBagal/tracehound-demo/actions/runs/39027381059),
[#4](https://github.com/SunnyBagal/tracehound-demo/actions/runs/39027384674), and
[#5](https://github.com/SunnyBagal/tracehound-demo/actions/runs/39027387537).

The [dogfood re-pin run on TraceHound #32](https://github.com/SunnyBagal/TraceHound/actions/runs/39028627087)
also succeeded and posted one review comment. The control PR received zero
comments. The runs posted no comments on the seeded lines in PRs #1 and #4.

These are public dev demo cases, not benchmark results. Earlier runs using
`f437ecb76311a712f47a0938b6feba5b294d34d6` all failed before review and posted
zero comments. Only metadata and comment counts are reported here; workflow logs
and comment text are omitted.
