import { expect, it } from "vitest";
import { clampWidth, effectiveWidth, readStoredWidth, resizeBounds, writeStoredWidth, WIDTH_KEY } from "@/lib/inspector-width";

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
  expect(resizeBounds(768)).toEqual({ min: 400, max: 400 });
  expect(clampWidth(612.4, 1440)).toBe(612);
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
