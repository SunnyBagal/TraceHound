import { expect, it } from "vitest";
import { clampWidth, effectiveWidth, LANE_RESERVE, readStoredWidth, resizeBounds, writeStoredWidth, WIDTH_KEY } from "@/lib/inspector-width";

const throwing = () => ({ getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } }) as unknown as Storage;

it("defaults to clamp(480px, 50vw, 760px), takes a stored width inside its bounds, and is 0 on phones", () => {
  expect(effectiveWidth(1440, null)).toBe(720);
  expect(effectiveWidth(1440, 900)).toBe(900);
  expect(effectiveWidth(1440, 100)).toBe(400);
  // never leaves less than 380px for the canvas
  expect(effectiveWidth(1280, 5000)).toBe(900);
  expect(effectiveWidth(1920, 5000)).toBe(1100);
  expect(effectiveWidth(700, 900)).toBe(0);
  expect(resizeBounds(1440)).toEqual({ min: 400, max: 1060 });
  expect(clampWidth(612.4, 1440)).toBe(612);
});

it("ui-01b (codex-ui P2 a): the default width is always inside the bounds, so the separator's value never exceeds its max", () => {
  for (const vw of [768, 800, 859, 860, 1024, 1280, 1440, 1920, 2560]) {
    const { min, max } = resizeBounds(vw);
    const w = effectiveWidth(vw, null);
    expect(w).toBeGreaterThanOrEqual(min);
    expect(w).toBeLessThanOrEqual(max);
  }
  // 768-859px: the default 480px is the max (it used to be 400/420, below the default)
  expect(resizeBounds(768)).toEqual({ min: 400, max: 480 });
  expect(resizeBounds(800)).toEqual({ min: 400, max: 480 });
  expect(effectiveWidth(800, null)).toBe(480);
  // from 860px the canvas-keep bound is the larger one again, as before
  expect(resizeBounds(1440)).toEqual({ min: 400, max: 1060 });
  expect(effectiveWidth(800, 900)).toBe(480);
});

it("ui-01b (codex-ui P2 b): with the PR list expanded the inspector narrows for as long as it lasts; the stored width comes back", () => {
  expect(LANE_RESERVE).toBe(248);
  // 1280px, edge pushed to the widest (900px), then the PR list expanded: 1280 - 380 - 248 = 652
  expect(resizeBounds(1280, LANE_RESERVE)).toEqual({ min: 400, max: 652 });
  expect(effectiveWidth(1280, 900, LANE_RESERVE)).toBe(652);
  expect(effectiveWidth(1280, 900)).toBe(900);
  // the default is not lifted above the reserve's bound, and the floor stays RESIZE_MIN
  expect(effectiveWidth(1280, null, LANE_RESERVE)).toBe(640);
  expect(resizeBounds(1024, LANE_RESERVE)).toEqual({ min: 400, max: 400 });
  expect(clampWidth(5000, 1920, LANE_RESERVE)).toBe(1100);
});

it("reads and writes the width, and swallows storage that throws", () => {
  const map = new Map<string, string>();
  const store = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) } as unknown as Storage;
  expect(readStoredWidth(() => store)).toBeNull();
  writeStoredWidth(812.6, () => store);
  expect(map.get(WIDTH_KEY)).toBe("813");
  expect(readStoredWidth(() => store)).toBe(813);
  map.set(WIDTH_KEY, "garbage");
  expect(readStoredWidth(() => store)).toBeNull();
  expect(readStoredWidth(throwing)).toBeNull();
  expect(() => writeStoredWidth(700, throwing)).not.toThrow();
  expect(readStoredWidth(() => { throw new Error("no window storage"); })).toBeNull();
});
