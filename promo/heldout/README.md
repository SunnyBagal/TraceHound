# Promo video: held-out result (HyperFrames bar chart)

A 7-second bar-chart video for the held-out result post, in the style of Sunny's October benchmark video
(`~/Projects/tracehound-video/bench`, unchanged). HTML + GSAP, rendered with HyperFrames.

- **Numbers:** `data.json` only, each from `docs/bench/ts-heldout.md`: bugs caught of 20, Greptile 12, CodeRabbit 10,
  TraceHound 4; 29 PRs (20 real bugs); the registered tests' p = 0.0078125 and 0.109375, shown as 0.008 and 0.11;
  repos medusa, payload, twenty, bullmq. Totals only; no per-PR data is read (Sunny's ruling).
- **Highlights:** Greptile green with a "Most bugs caught" band; TraceHound red with a dashed line at 4. Not "winner":
  Greptile vs CodeRabbit (12 vs 10) was not tested.
- **Footer:** held-out and pre-registered, checked by hand with the tool hidden, the four repos, both p-values (CodeRabbit
  "not significant"), and that CodeRabbit and Greptile ran on free plans.
- **Output:** `renders/tracehound-heldout.mp4` (1920×1080, 30 fps, 210 frames, H.264 yuv420p, faststart) and stills
  `renders/tracehound-heldout-first.png` (frame 0, the X thumbnail) and `-final.png` (6.5 s).
- **Assets:** logos in `assets/logos/SOURCES.md`; fonts are Inter and IBM Plex (SIL OFL 1.1) from `@fontsource`.
- `npx hyperframes check` passes (contrast 98/98 WCAG AA).

```sh
cd promo/heldout
npm run check
npm run render -- -o renders/tracehound-heldout.mp4
ffmpeg -i renders/tracehound-heldout.mp4 -c copy -movflags +faststart out.mp4 && mv out.mp4 renders/tracehound-heldout.mp4
```
