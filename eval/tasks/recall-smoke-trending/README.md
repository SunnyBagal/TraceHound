# recall-smoke-trending · smoke task, not an evaluation task

Checks that the repair harness runs on Recall (`SunnyBagal/Recall` @ `57d920e`, branch
`testable-baseline`, profile `configs/recall.profile.json`). Its results are never evaluation
results (decision 041).

The bug is **seeded by the harness**, not present in Recall: `seed.patch` is applied with
`git apply` right after checkout, before install and before the history is squashed into the
base commit, so the sandbox's base is `57d920e` plus that one-line change. Nothing is pushed to
Recall.

| File | Used as | Expected state |
|---|---|---|
| `seed.patch` | the seeded one-line bug | — |
| `repro.test.ts` | the reproduction (fails at the seeded base) | — |
| `fix.patch` | `--agent oracle --patch` | RESOLVED |
| (none) | `--agent noop` | UNRESOLVED, repro still fails |
| `fix-breaks-test.patch` | fixes the repro, breaks an existing test | UNRESOLVED |
| `fix-adds-tsc-error.patch` | fixes the repro, adds a tsc error | UNRESOLVED |

```sh
pnpm tracehound repair --task eval/tasks/recall-smoke-trending/task.json --agent oracle \
  --patch eval/tasks/recall-smoke-trending/fix.patch --provider docker
```
