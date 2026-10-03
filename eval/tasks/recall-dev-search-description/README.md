# recall-dev-search-description · dev task (decision 044), not an evaluation task

Seeded on Recall (`SunnyBagal/Recall` @ `57d920e`, branch `testable-baseline`, profile
`configs/recall.profile.json`). The harness applies `seed.patch` right after checkout, before
the history squash, so the agent sees one base commit that contains the bug and never sees the
seed. Nothing is pushed to Recall. The agent is given only `issue` from `task.json`; this
README, the repro and the patches are never in the sandbox while it works.

- **Seeded fault:** `recall-backend/db/schema.ts` (the generated `search_vector` column no longer includes `og_description`).
- **Symptom seen in:** the API (`recall-backend:brainly-server`): `GET /api/v1/search` misses a description-only match.
- **Fault in:** the shared library (`recall-backend:shared`) (components from `eval/snapshots/57d920e…/0.10.0.json`).
- **Reproduction:** The repro inserts two rows and calls `GET /api/v1/search?q=kubernetes` on the test app (its embedding fake returns null, so only the keyword arm runs). It fails at the seeded base and passes with `fix.patch`.
- At the seeded base Recall's own suite still passes (62 of 62), so the per-test gate (decision
  043) sees every existing test.

| File | Used as | Expected state |
|---|---|---|
| `seed.patch` | the seeded bug (one line) | — |
| `repro.test.ts` | the reproduction, copied in only while reproducing and verifying | — |
| `fix.patch` | `--agent oracle --patch` | RESOLVED |
| (none) | `--agent noop` | UNRESOLVED, repro still fails |

```sh
pnpm tracehound repair --task eval/tasks/recall-dev-search-description/task.json --agent oracle \
  --patch eval/tasks/recall-dev-search-description/fix.patch --provider docker
```
