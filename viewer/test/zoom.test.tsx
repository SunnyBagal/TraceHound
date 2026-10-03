import type { Snapshot } from "@tracehound/analyzer/schema";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GraphCanvas } from "@/components/GraphCanvas";
import { clampZoom, keepInView, MAX_ZOOM, MIN_ZOOM, minZoomFor, PHONE_MIN_ZOOM } from "@/lib/zoom";
import { repoSnapshot } from "./repo-snapshot";

const snapshot = repoSnapshot("cex-v2-boilercode");

// test/setup.ts's ResizeObserver never fires, so React Flow never measures nodes and fitView
// waits forever. Here it reports each observed element at its offset size, so the canvas's own
// fit view actually runs. Like a real observer it reports every element observed since its last
// callback in one batch: React Flow runs a queued fitView on the first measurement it gets, so
// one callback per node fitted the first node alone (zoom 1.22) when the canvas's fit was queued
// before its nodes were measured. And like a real observer, observe() always reports once, so a
// node React Flow re-observes is measured again.
class MeasuringResizeObserver {
  cb: ResizeObserverCallback;
  pending = new Set<HTMLElement>();
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(el: HTMLElement) {
    if (!this.pending.size) queueMicrotask(() => this.deliver());
    this.pending.add(el);
  }
  deliver() {
    const entries = [...this.pending].map((el) => ({ target: el, contentRect: { width: el.offsetWidth, height: el.offsetHeight } }) as unknown as ResizeObserverEntry);
    this.pending.clear();
    if (entries.length) this.cb(entries, this as unknown as ResizeObserver);
  }
  unobserve(el: HTMLElement) {
    this.pending.delete(el);
  }
  disconnect() {
    this.pending.clear();
  }
}
const shimmed = globalThis.ResizeObserver;
beforeAll(() => {
  globalThis.ResizeObserver = MeasuringResizeObserver as unknown as typeof ResizeObserver;
});
afterAll(() => {
  globalThis.ResizeObserver = shimmed;
});


let flow: ReturnType<typeof useReactFlow> | undefined;
function Grab() {
  flow = useReactFlow();
  return null;
}

function renderCanvas(s: Snapshot, selection: { type: "node"; id: string } | null = null) {
  return render(
    <div style={{ width: 1200, height: 800 }}>
      <ReactFlowProvider>
        <GraphCanvas snapshot={s} selection={selection} onSelect={() => {}} occludeRight={selection ? 480 : 0} />
        <Grab />
      </ReactFlowProvider>
    </div>,
  );
}

// RTL's waitFor stalls on React Flow's d3 zoom transition in jsdom; poll on real timers instead.
async function zoomSettlesAt(expected: number) {
  await screen.findAllByTestId("component-node", {}, { timeout: 5000 });
  const end = Date.now() + 3000;
  while (flow!.getZoom() !== expected && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  expect(flow!.getZoom()).toBe(expected);
}


describe("zoom limits", () => {
  afterEach(() => {
    cleanup();
    flow = undefined;
  });

  it("clampZoom keeps every zoom within 0.4–1.5", () => {
    expect([MIN_ZOOM, MAX_ZOOM]).toEqual([0.4, 1.5]);
    expect(clampZoom(0.05)).toBe(0.4);
    expect(clampZoom(0.8)).toBe(0.8);
    expect(clampZoom(4)).toBe(1.5);
  });

  it("the canvas is configured with those limits, and zoom requests beyond them are clamped", async () => {
    renderCanvas(snapshot);
    await zoomSettlesAt(MIN_ZOOM);
    expect(flow!.getNodes()).toHaveLength(snapshot.components.length);
    await act(() => flow!.zoomTo(10));
    expect(flow!.getZoom()).toBe(MAX_ZOOM);
    await act(() => flow!.zoomTo(0.01));
    expect(flow!.getZoom()).toBe(MIN_ZOOM);
  });

  it("fit view never zooms out past 0.4, even when the graph doesn't fit (jsdom's pane is 100×100)", async () => {
    renderCanvas(snapshot);
    await zoomSettlesAt(MIN_ZOOM); // the canvas's own fit after layout
    await act(() => flow!.zoomTo(1));
    fireEvent.click(screen.getByRole("button", { name: /Fit view/ })); // and the Fit view button
    await zoomSettlesAt(MIN_ZOOM);
  });

  it("fit view never zooms in past 1.5 on a one-component graph", async () => {
    const one: Snapshot = { ...snapshot, components: snapshot.components.slice(0, 1), edges: [], warnings: [] };
    // a 4000×3000 pane (React Flow measures .react-flow__renderer) around one 272×140 node: an
    // unclamped fit would zoom to ~12
    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth")!;
    const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!;
    const pane = (el: HTMLElement, size: number, fallback: PropertyDescriptor) => (el.classList.contains("react-flow__renderer") ? size : fallback.get!.call(el));
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get() { return pane(this, 4000, width); } });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get() { return pane(this, 3000, height); } });
    try {
      renderCanvas(one);
      await zoomSettlesAt(MAX_ZOOM); // the canvas's own fit after layout
    } finally {
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", width);
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", height);
    }
  });

  it("the keep-selection-visible pan moves at the current zoom, within the limits", () => {
    const node = { minX: 1000, minY: 100, maxX: 1272, maxY: 240 };
    const pane = { width: 1200, height: 800 };
    // covered by a 480px inspector → pans left at the same zoom
    const next = keepInView(node, { x: 0, y: 0, zoom: 0.8 }, pane, 480, 32)!;
    expect(next.zoom).toBe(0.8);
    expect(next.x).toBeLessThan(0);
    expect(node.maxX * next.zoom + next.x).toBeLessThanOrEqual(pane.width - 480 - 32);
    // already visible → no pan
    expect(keepInView(node, { x: 0, y: 0, zoom: 0.8 }, pane, 0, 32)).toBeNull();
    // a zoom outside the limits comes back clamped
    expect(keepInView(node, { x: 0, y: 0, zoom: 3 }, pane, 480, 32)!.zoom).toBe(MAX_ZOOM);
    expect(keepInView(node, { x: 0, y: 0, zoom: 0.1 }, pane, 0, 32)).toEqual({ x: 0, y: 0, zoom: MIN_ZOOM });
  });
});

describe("phone zoom (viewport narrower than 640px)", () => {
  const innerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth")!;
  const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth")!;
  const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!;
  afterEach(() => {
    cleanup();
    flow = undefined;
    Object.defineProperty(window, "innerWidth", innerWidth);
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", offsetWidth);
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", offsetHeight);
  });

  /** a 390×844 phone: the canvas pane is 390×796 under the 48px header */
  function phone() {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const pane = (el: HTMLElement, size: number, fallback: PropertyDescriptor) => (el.classList.contains("react-flow__renderer") ? size : fallback.get!.call(el));
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get() { return pane(this, 390, offsetWidth); } });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get() { return pane(this, 796, offsetHeight); } });
  }

  it("the minimum drops to 0.2 below 640px only", () => {
    expect(PHONE_MIN_ZOOM).toBe(0.2);
    expect([minZoomFor(390), minZoomFor(639), minZoomFor(640), minZoomFor(1440)]).toEqual([0.2, 0.2, 0.4, 0.4]);
    expect(clampZoom(0.05, PHONE_MIN_ZOOM)).toBe(0.2);
    expect(keepInView({ minX: 200, minY: 200, maxX: 210, maxY: 210 }, { x: 0, y: 0, zoom: 0.1 }, { width: 390, height: 796 }, 0, 32, PHONE_MIN_ZOOM)).toEqual({ x: 0, y: 0, zoom: 0.2 });
  });

  /**
   * Waits for the condition itself, not a fixed delay: the ELK layout has run (zoom left its
   * initial 1) and the 300ms fit animation has finished (the viewport hasn't moved for 300ms).
   * The ceiling is generous because CI runners are slow under parallel jsdom workers.
   */
  async function settledViewport(ceilingMs = 15000) {
    const end = Date.now() + ceilingMs;
    let last = "";
    let stableSince = Date.now();
    for (;;) {
      const v = flow!.getViewport();
      const key = `${v.x}:${v.y}:${v.zoom}`;
      if (key !== last) [last, stableSince] = [key, Date.now()];
      if (v.zoom < 1 && Date.now() - stableSince >= 300) return v;
      if (Date.now() > end) throw new Error(`fit view did not settle within ${ceilingMs}ms (viewport ${key})`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  it("fit view shows the whole demo graph on a 390px phone, and zoom stays within 0.2–1.5", { timeout: 40000 }, async () => {
    phone();
    renderCanvas(snapshot);
    await screen.findAllByTestId("component-node", {}, { timeout: 15000 });
    const { x, y, zoom } = await settledViewport();
    expect(zoom).toBeGreaterThanOrEqual(PHONE_MIN_ZOOM);
    expect(zoom).toBeLessThan(MIN_ZOOM); // fits below the desktop minimum
    for (const n of flow!.getNodes()) {
      const left = n.position.x * zoom + x;
      const top = n.position.y * zoom + y;
      expect(left, n.id).toBeGreaterThanOrEqual(0);
      expect(top, n.id).toBeGreaterThanOrEqual(0);
      expect(left + n.measured!.width! * zoom, n.id).toBeLessThanOrEqual(390);
      expect(top + n.measured!.height! * zoom, n.id).toBeLessThanOrEqual(796);
    }
    await act(() => flow!.zoomTo(0.01));
    expect(flow!.getZoom()).toBe(PHONE_MIN_ZOOM);
    await act(() => flow!.zoomTo(10));
    expect(flow!.getZoom()).toBe(MAX_ZOOM);
  });
});
