# recall-smoke-baseline-failing · smoke task, not an evaluation task

Checks the per-test regression gate (decision 043) on Recall (`SunnyBagal/Recall` @ `57d920e`,
branch `testable-baseline`, profile `configs/recall.profile.json`). Its results are never
evaluation results.

`seed.patch` makes two changes to `recall-backend/services/linkDetector.ts`, applied by the harness
before install and the history squash (nothing is pushed to Recall):

- the bug the issue describes: `"trending"` is dropped from GitHub's non-repository paths (the
  same bug and `repro.test.ts` as `recall-smoke-trending`);
- a second, unrelated bug: Instagram `/reel/` URLs are no longer detected. This makes one existing
  test fail at the seeded base: `test/linkDetector.test.ts > detectLinkType > instagram posts and
  reels`. With that test already failing, `bun test` exits 1 at baseline whatever the patch does,
  so the exit-code comparison alone can't tell whether a patch broke anything else.

| File | Used as | Expected state |
|---|---|---|
| `seed.patch` | the two seeded bugs | — |
| `repro.test.ts` | the reproduction (fails at the seeded base) | — |
| `fix.patch` | `--agent oracle --patch`; fixes the issue, leaves the Instagram test failing | RESOLVED |
| `fix-breaks-test.patch` | fixes the issue, and also breaks two passing tests (`github repos…`, `input without a scheme…`) | UNRESOLVED, naming those tests |

```sh
pnpm tracehound repair --task eval/tasks/recall-smoke-baseline-failing/task.json --agent oracle \
  --patch eval/tasks/recall-smoke-baseline-failing/fix-breaks-test.patch --provider docker
```
