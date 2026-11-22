# Promo race animation (held-out result post)

A 9-second looping video for the X post about the held-out benchmark result (decision 081). It is separate from the app
and the bench code: its own pnpm root, not in the TraceHound workspace, not in CI.

- **Numbers:** `src/data.ts` only, each from `docs/bench/ts-heldout.md` (bugs caught of 20: Greptile 12, CodeRabbit 10,
  TraceHound 4; 29 PRs; 20 bugs; medusa, payload, twenty, bullmq). No per-PR data is used: each racer moves in even
  one-bug ticks across the race and all finish their ticks at the same moment, so the video implies no order of pull
  requests (Sunny's choice, 22 Nov).
- **Output:** `renders/tracehound-race.mp4` (1920×1080, 30 fps, H.264, yuv420p, faststart, 270 frames) and two stills,
  `renders/tracehound-race-first.png` (frame 0) and `renders/tracehound-race-scoreboard.png` (frame 240).
- **Logos:** put official logos at `assets/{greptile,coderabbit,tracehound}.png` and re-render; a missing file falls back
  to the text label. Nothing here draws or recreates a company logo.

```sh
cd promo/race
pnpm install
pnpm render   # MP4, stills, a 640 px phone copy and check frames in out/ (gitignored)
pnpm studio   # preview in the browser
```
