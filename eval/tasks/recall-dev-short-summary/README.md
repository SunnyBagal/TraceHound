# recall-dev-short-summary · dev task (decision 044), not an evaluation task

Seeded on Recall (`SunnyBagal/Recall` @ `57d920e`, branch `testable-baseline`, profile
`configs/recall.profile.json`). The harness applies `seed.patch` right after checkout, before
the history squash, so the agent sees one base commit that contains the bug and never sees the
seed. Nothing is pushed to Recall. The agent is given only `issue` from `task.json`; this
README, the repro and the patches are never in the sandbox while it works.

- **Seeded fault:** `recall-backend/worker.ts` (`processContent`: the not-enough-text threshold raised from 20 to 200 characters).
- **Symptom seen in:** the API (`recall-backend:brainly-server`): the saved item is listed as done, with no summary or tags.
- **Fault in:** the worker (`recall-backend:worker`), across the `content-processing` queue (components from `eval/snapshots/57d920e…/0.10.0.json`).
- **Reproduction:** The repro saves a short page through `POST /api/v1/content`, processes the queued job with `processContent` (fake summarizer), and reads `GET /api/v1/content`. It fails at the seeded base and passes with `fix.patch`.
- At the seeded base Recall's own suite still passes (62 of 62), so the per-test gate (decision
  043) sees every existing test.

| File | Used as | Expected state |
|---|---|---|
| `seed.patch` | the seeded bug (one line) | — |
| `repro.test.ts` | the reproduction, copied in only while reproducing and verifying | — |
| `fix.patch` | `--agent oracle --patch` | RESOLVED |
| (none) | `--agent noop` | UNRESOLVED, repro still fails |

```sh
pnpm tracehound repair --task eval/tasks/recall-dev-short-summary/task.json --agent oracle \
  --patch eval/tasks/recall-dev-short-summary/fix.patch --provider docker
```
