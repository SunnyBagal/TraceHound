import { scrubGitEnv } from "@tracehound/analyzer/git-env";
import { vi } from "vitest";

// A hook or `git rebase --exec` exports GIT_DIR & co.; tests must never inherit them (decision 032).
scrubGitEnv();

// jsdom lacks the layout APIs React Flow uses; minimal shims per the React Flow testing guide.
class ResizeObserverShim {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverShim as unknown as typeof ResizeObserver;

class DOMMatrixReadOnlyShim {
  m22: number;
  constructor(transform?: string) {
    const scale = transform?.match(/scale\(([1-9.])\)/)?.[1];
    this.m22 = scale !== undefined ? Number(scale) : 1;
  }
}
globalThis.DOMMatrixReadOnly ??= DOMMatrixReadOnlyShim as unknown as typeof DOMMatrixReadOnly;

Object.defineProperties(globalThis.HTMLElement.prototype, {
  offsetHeight: { get() { return Number.parseFloat(this.style.height) || 1; } },
  offsetWidth: { get() { return Number.parseFloat(this.style.width) || 1; } },
});
(globalThis.SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
globalThis.requestAnimationFrame ??= ((cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0)) as unknown as typeof requestAnimationFrame;

// next/font/google is compiled by Next at build time (it downloads the fonts then); tests get the
// loader's shape without fonts.
vi.mock("next/font/google", () => {
  const font = (variable: string) => () => ({ className: "", variable, style: { fontFamily: "" } });
  return { Bricolage_Grotesque: font("font-bricolage"), JetBrains_Mono: font("font-jetbrains") };
});
