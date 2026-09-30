# toy-cart (harness test fixture)

A tiny TypeScript repo used only to test the repair harness (decision 026). It has one bug:
`applyDiscount` subtracts the percentage as an absolute amount. `tests/cart.test.ts` is its
regression suite. The repro test and the fix patches live in `eval/tasks/`, not here.

Build the git repo the tasks point at (deterministic, so `baseSha` is fixed):
`node eval/fixtures/build-toy-repo.ts` → `eval/fixtures/.build/toy-cart`.
