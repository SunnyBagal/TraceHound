# Promo chart animation (held-out result post)

A 9-second looping line-chart video for the X post about the held-out benchmark result (decision 081). It is separate from the app
and the bench code: its own pnpm root, not in the TraceHound workspace, not in CI.

- **Numbers:** `src/data.ts` only, each from `docs/bench/ts-heldout.md` (bugs caught of 20: Greptile 12, CodeRabbit 10,
  TraceHound 4; 29 PRs; the registered tests' p = 0.0078125 and 0.109375, shown rounded; medusa, payload, twenty,
  bullmq). No per-PR data is used (Sunny's ruling): each line runs straight from 0 to the total, and the footer says the
  lines show totals only, not PR order.
- **Highlights:** Greptile "Most caught" (green), TraceHound "Fewest caught · mine" (red). Not "winner": Greptile vs
  CodeRabbit (12 vs 10) was not tested.
- **Output:** `renders/tracehound-result.mp4` (1920×1080, 30 fps, H.264, yuv420p, faststart, 270 frames) and two stills,
  `renders/tracehound-result-first.png` (frame 0) and `renders/tracehound-result-final.png` (frame 225).
- **Logos:** `assets/*.svg`, copied unmodified from the viewer's vendored icons (`assets/CREDITS.md`).

```sh
cd promo/race
pnpm install
pnpm render   # MP4, stills, a 640 px phone copy and check frames in out/ (gitignored)
pnpm studio   # preview in the browser
```
