# recall-dev-chat-recent · dev task (decision 044), not an evaluation task

Seeded on Recall (`SunnyBagal/Recall` @ `57d920e`, branch `testable-baseline`, profile
`configs/recall.profile.json`). The harness applies `seed.patch` right after checkout, before
the history squash, so the agent sees one base commit that contains the bug and never sees the
seed. Nothing is pushed to Recall. The agent is given only `issue` from `task.json`; this
README, the repro and the patches are never in the sandbox while it works.

- **Seeded fault:** `recall-backend/index.ts` (the chat route's no-embedding fallback orders by `createdAt` ascending instead of descending).
- **Symptom seen in:** the API (`recall-backend:brainly-server`): Ask AI cites the oldest saves.
- **Fault in:** the API (`recall-backend:brainly-server`), the same component (components from `eval/snapshots/57d920e…/0.10.0.json`).
- **Reproduction:** The repro inserts seven dated rows and expects the chat route's citations to be the five newest, newest first. It fails at the seeded base and passes with `fix.patch`.
- At the seeded base Recall's own suite still passes (62 of 62), so the per-test gate (decision
  043) sees every existing test.

| File | Used as | Expected state |
|---|---|---|
| `seed.patch` | the seeded bug (one line) | — |
| `repro.test.ts` | the reproduction, copied in only while reproducing and verifying | — |
| `fix.patch` | `--agent oracle --patch` | RESOLVED |
| (none) | `--agent noop` | UNRESOLVED, repro still fails |

```sh
pnpm tracehound repair --task eval/tasks/recall-dev-chat-recent/task.json --agent oracle \
  --patch eval/tasks/recall-dev-chat-recent/fix.patch --provider docker
```
