import { readFileSync } from "node:fs";
import path from "node:path";
import { Snapshot, SnapshotManifest } from "@tracehound/analyzer/schema";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GraphCanvas } from "@/components/GraphCanvas";
import { clampZoom, keepInView, MAX_ZOOM, MIN_ZOOM, minZoomFor, PHONE_MIN_ZOOM } from "@/lib/zoom";

const root = path.resolve(import.meta.dirname, "../../snapshots");
const manifest = SnapshotManifest.parse(JSON.parse(readFileSync(path.join(root, "index.json"), "utf8")));
const snapshot = Snapshot.parse(JSON.parse(readFileSync(path.join(root, manifest.latest!.path), "utf8")));

// test/setup.ts's ResizeObserver never fires, so React Flow never measures nodes and fitView
// waits forever. Here it reports each observed element at its offset size, so the canvas's own
// fit view actually runs.
const measured = new WeakSet<Element>();
class MeasuringResizeObserver {
  cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(el: HTMLElement) {
    if (measured.has(el)) return; // sizes never change here, and a real observer reports only changes
    measured.add(el);
    queueMicrotask(() => this.cb([{ target: el, contentRect: { width: el.offsetWidth, height: el.offsetHeight } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver));
  }
  unobserve() {}
  disconnect() {}
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

  it("fit view shows the whole demo graph on a 390px phone, and zoom stays within 0.2–1.5", async () => {
    phone();
    renderCanvas(snapshot);
    await screen.findAllByTestId("component-node", {}, { timeout: 5000 });
    const end = Date.now() + 3000;
    while (!(flow!.getZoom() < 1) && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 400)); // let the 300ms fit animation land
    const { x, y, zoom } = flow!.getViewport();
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
