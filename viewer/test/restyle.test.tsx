import { ReactFlowProvider } from "@xyflow/react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GraphCanvas } from "@/components/GraphCanvas";
import { ease, HEAD_LIFT, HOLD_MS, HOWL_MS, HOWL_PATH, LIFT_MS, LogoLink, MOUTH_ORIGIN, MOUTH_POINTS, MOUTH_START, RETURN_MS, WOLF_PATH } from "@/components/Logo";
import { Viewer } from "@/components/Viewer";
import { NODE_HEIGHT, NODE_WIDTH } from "@/lib/graph";
import { inspectorOcclusion, inspectorWidth } from "@/lib/inspector";
import { elkLayout, layoutGraph } from "@/lib/layout";
import { repoSnapshot } from "./repo-snapshot";

const cex = repoSnapshot("cex-v2-boilercode");
const recall = repoSnapshot("recall");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("node size (Railway's 2:1 card)", () => {
  it("cards are half as tall as they are wide, and ELK lays out that size", () => {
    expect(NODE_WIDTH).toBe(272);
    expect(NODE_HEIGHT).toBe(NODE_WIDTH / 2);
    const graph = layoutGraph(
      cex.components.map((c) => c.id),
      cex.edges,
    );
    for (const child of graph.children ?? []) expect([child.width, child.height], child.id).toEqual([NODE_WIDTH, NODE_HEIGHT]);
  });

  it("laid-out cards at that size never overlap (both published repos)", async () => {
    for (const s of [cex, recall]) {
      const positions = await elkLayout(
        s.components.map((c) => c.id),
        s.edges,
      );
      const boxes = Object.entries(positions);
      for (const [a, p] of boxes)
        for (const [b, q] of boxes) {
          if (a >= b) continue;
          const apart = p.x + NODE_WIDTH <= q.x || q.x + NODE_WIDTH <= p.x || p.y + NODE_HEIGHT <= q.y || q.y + NODE_HEIGHT <= p.y;
          expect(apart, `${s.repo.name}: ${a} / ${b}`).toBe(true);
        }
    }
  });

  it("rendered cards use that size, and every edge starts and ends on a card border", async () => {
    const { container } = render(
      <div style={{ width: 1200, height: 800 }}>
        <ReactFlowProvider>
          <GraphCanvas snapshot={cex} selection={null} onSelect={() => {}} />
        </ReactFlowProvider>
      </div>,
    );
    const cards = await within(container).findAllByTestId("component-node", {}, { timeout: 5000 });
    for (const card of cards) expect([card.style.width, card.style.height]).toEqual([`${NODE_WIDTH}px`, `${NODE_HEIGHT}px`]);
    await waitFor(() => expect(within(container).getAllByTestId("edge-path")).toHaveLength(cex.edges.length), { timeout: 5000 });

    const box = (id: string) => {
      const el = container.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`)!;
      const [, x, y] = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform)!;
      return { x: Number(x), y: Number(y) };
    };
    const onBorder = (p: { x: number; y: number }, b: { x: number; y: number }) => {
      const near = (a: number, c: number) => Math.abs(a - c) < 0.01;
      const inX = p.x >= b.x - 0.01 && p.x <= b.x + NODE_WIDTH + 0.01;
      const inY = p.y >= b.y - 0.01 && p.y <= b.y + NODE_HEIGHT + 0.01;
      return ((near(p.x, b.x) || near(p.x, b.x + NODE_WIDTH)) && inY) || ((near(p.y, b.y) || near(p.y, b.y + NODE_HEIGHT)) && inX);
    };
    for (const path of within(container).getAllByTestId("edge-path")) {
      const edge = cex.edges.find((e) => e.id === path.dataset.edgeId)!;
      const nums = (path.getAttribute("d") ?? "").match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      const start = { x: nums[0]!, y: nums[1]! };
      const end = { x: nums[nums.length - 2]!, y: nums[nums.length - 1]! };
      expect(onBorder(start, box(edge.source)), `${edge.id} start`).toBe(true);
      expect(onBorder(end, box(edge.target)), `${edge.id} end`).toBe(true);
    }
  });
});

describe("model-written names carry the NVIDIA mark", () => {
  it("on every model-named node in both published repos, with the disclosure as its tooltip", async () => {
    for (const s of [cex, recall]) {
      const { container, unmount } = render(
        <div style={{ width: 1200, height: 800 }}>
          <ReactFlowProvider>
            <GraphCanvas snapshot={s} selection={null} onSelect={() => {}} />
          </ReactFlowProvider>
        </div>,
      );
      const cards = await within(container).findAllByTestId("component-node", {}, { timeout: 5000 });
      const modelNamed = s.components.filter((c) => c.naming.source === "llm");
      expect(modelNamed.length, s.repo.name).toBeGreaterThan(0);
      for (const c of s.components) {
        const mark = within(cards.find((n) => n.dataset.componentId === c.id)!).queryByTestId("model-name-mark");
        if (c.naming.source !== "llm") {
          expect(mark, c.id).toBeNull();
          continue;
        }
        expect(mark?.getAttribute("title"), c.id).toBe("Name written by the model; prose not verified");
        expect(mark?.querySelector('[data-logo="nvidia-color-eye.svg"]'), c.id).toBeTruthy();
      }
      expect(container.querySelector(".lucide-sparkles"), s.repo.name).toBeNull(); // the sparkle is gone
      unmount();
    }
  });

  it("in the inspector: the NVIDIA logo and 'Named by Nemotron Nano', no sparkle, and the mark on model-named connections", () => {
    const c = cex.components.find((x) => x.naming.source === "llm" && cex.edges.some((e) => e.source === x.id))!;
    window.history.replaceState(null, "", `/?component=${encodeURIComponent(c.id)}`);
    render(
      <div style={{ width: 1400, height: 900 }}>
        <Viewer snapshot={cex} />
      </div>,
    );
    const panel = within(screen.getByTestId("inspector"));
    const named = panel.getByTestId("model-written");
    expect(named.textContent).toBe("Named by Nemotron Nano");
    expect(named.getAttribute("title")).toBe("Name written by the model; prose not verified");
    expect(named.querySelector('[data-logo="nvidia-color-eye.svg"]')).toBeTruthy();
    expect(screen.getByTestId("inspector").querySelector(".lucide-sparkles")).toBeNull();

    fireEvent.click(panel.getByRole("tab", { name: /Connections/ }));
    const others = cex.edges.filter((e) => e.source === c.id || e.target === c.id).map((e) => (e.source === c.id ? e.target : e.source));
    expect(others.some((id) => cex.components.find((x) => x.id === id)?.naming.source === "llm")).toBe(true);
    const marked = panel.getAllByTestId("connection").filter((row) => within(row).queryByTestId("model-name-mark")).length;
    expect(marked).toBe(others.filter((id) => cex.components.find((x) => x.id === id)?.naming.source === "llm").length);
  });
});

describe("Env vars tab", () => {
  function open(id: string) {
    window.history.replaceState(null, "", `/?component=${encodeURIComponent(id)}`);
    render(
      <div style={{ width: 1400, height: 900 }}>
        <Viewer snapshot={cex} />
      </div>,
    );
    return within(screen.getByTestId("inspector"));
  }

  it("is its own tab with a count beside Overview, Files and Connections; Overview no longer lists env vars", () => {
    const c = cex.components.find((x) => x.id === "backend:shared")!;
    const panel = open(c.id);
    const tabs = panel.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      `Overview`,
      `Files${c.files.length}`,
      `Connections${cex.edges.filter((e) => e.source === c.id || e.target === c.id).length}`,
      `Env vars${c.envVars.length}`,
    ]);
    expect(panel.queryByText(/^Env vars/, { selector: "h3" })).toBeNull(); // not on Overview any more
  });

  it("lists every variable with each place this component's files read it", () => {
    const c = cex.components.find((x) => x.id === "backend:shared")!;
    const panel = open(c.id);
    fireEvent.click(panel.getByRole("tab", { name: /Env vars/ }));
    const rows = panel.getAllByTestId("env-var");
    expect(rows.map((r) => r.firstElementChild?.textContent)).toEqual(c.envVars);
    const files = new Set(c.files);
    for (const row of rows) {
      const name = row.firstElementChild!.textContent!;
      const expected = cex.files
        .filter((f) => files.has(f.path))
        .flatMap((f) => f.envReads.filter((r) => r.name === name))
        .map((r) => cex.evidence.find((e) => e.id === r.evidenceId)!)
        .map((e) => `${e.file}:${e.range.startLine}`);
      expect(expected.length, name).toBeGreaterThan(0);
      expect(within(row).getAllByRole("link").map((a) => a.textContent), name).toEqual(expected);
    }
  });

  it("says so when the component reads none, and the tab shows 0", () => {
    const c = cex.components.find((x) => x.envVars.length === 0)!;
    const panel = open(c.id);
    const tab = panel.getByRole("tab", { name: /Env vars/ });
    expect(tab.textContent).toBe("Env vars0");
    fireEvent.click(tab);
    expect(panel.getByText(/No environment variables are read/)).toBeTruthy();
  });
});

describe("inspector width", () => {
  it("is clamp(480px, 50vw, 760px) on desktop and covers its width plus the 10px gap; 0 on phones", () => {
    expect(inspectorWidth(1440)).toBe(720);
    expect(inspectorWidth(800)).toBe(480);
    expect(inspectorWidth(2000)).toBe(760);
    expect(inspectorWidth(767)).toBe(0);
    expect(inspectorOcclusion(1440)).toBe(730);
    expect(inspectorOcclusion(390)).toBe(0);
  });
});

describe("the howling logo (tracehound-logo-howl.html)", () => {
  const NUM = /-?\d+(?:\.\d+)?/g;
  const nums = (d: string | null) => (d ?? "").match(NUM)!.map(Number);
  const REST = nums(WOLF_PATH);
  const HOWL = nums(HOWL_PATH);
  const between = (progress: number) => REST.map((r, i) => r + (HOWL[i]! - r) * progress);
  const ORIGIN_MOUTH = MOUTH_POINTS.map(() => MOUTH_ORIGIN).flat();
  const OPEN_MOUTH = MOUTH_POINTS.flat();

  function stubMotion(reduce: boolean) {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("prefers-reduced-motion: reduce"), media: query, addEventListener() {}, removeEventListener() {} }));
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(performance, "now").mockReturnValue(1000); // the howl's start time
    return frames;
  }
  // the link goes to "/graph": keep jsdom from attempting the navigation on click
  const noNavigation = (e: Event) => e.preventDefault();
  beforeEach(() => document.addEventListener("click", noNavigation));
  afterEach(() => {
    document.removeEventListener("click", noNavigation);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const link = () => screen.getByTestId("home-link");
  const mark = () => screen.getByTestId("logo-mark");
  const face = () => nums(mark().querySelector("[data-wolf-face]")!.getAttribute("d"));
  const mouth = () => mark().querySelector("[data-wolf-mouth]")!;
  const lift = () => Number(/translate\(0 (-?[\d.e-]+)\)/.exec(mark().querySelector("[data-wolf-head]")!.getAttribute("transform")!)![1]);
  const expectClose = (actual: number[], expected: number[]) => {
    expect(actual).toHaveLength(expected.length);
    actual.forEach((v, i) => expect(v, `#${i}`).toBeCloseTo(expected[i]!, 2));
  };

  it("links to the default canvas view at /graph, in currentColor, at rest with the mouth shut", () => {
    render(<LogoLink />);
    expect(link().getAttribute("href")).toBe("/graph");
    for (const path of mark().querySelectorAll("path")) expect(path.getAttribute("fill")).toBe("currentColor");
    expect(face()).toEqual(REST);
    expect(mouth().getAttribute("opacity")).toBe("0");
    expectClose(nums(mouth().getAttribute("d")), ORIGIN_MOUTH); // every mouth point at (355, 559)
    expect(lift()).toBe(0);
  });

  it("lift: 680 ms of the file's easing up to the howl pose; the mouth opens from (355, 559) only past 0.22", () => {
    const frames = stubMotion(false);
    render(<LogoLink />);
    fireEvent.pointerEnter(link(), { pointerType: "mouse" });
    const at = (ms: number) => act(() => frames.shift()!(1000 + ms));

    at(100); // ease(100 / 680) ≈ 0.017: the muzzle moves, the mouth is still shut
    expectClose(face(), between(ease(100 / LIFT_MS)));
    expect(Number(mouth().getAttribute("opacity"))).toBe(0);
    expectClose(nums(mouth().getAttribute("d")), ORIGIN_MOUTH);

    at(340); // half-way through the lift: progress 0.5, head up 7 units, the mouth part open
    expect(ease(0.5)).toBe(0.5);
    expectClose(face(), between(0.5));
    expect(lift()).toBeCloseTo(-7, 6);
    const jaw = ease((0.5 - MOUTH_START) / (1 - MOUTH_START));
    expect(Number(mouth().getAttribute("opacity"))).toBeCloseTo(jaw, 6);
    expectClose(
      nums(mouth().getAttribute("d")),
      OPEN_MOUTH.map((v, i) => ORIGIN_MOUTH[i]! + (v - ORIGIN_MOUTH[i]!) * jaw),
    );

    at(679); // still lifting
    expect(lift()).toBeGreaterThan(-HEAD_LIFT);
    at(680); // the hold starts: the full howl pose, head up 14, mouth fully open
    expectClose(face(), HOWL);
    expect(lift()).toBe(-HEAD_LIFT);
    expect(mouth().getAttribute("opacity")).toBe("1");
    expectClose(nums(mouth().getAttribute("d")), OPEN_MOUTH);
  });

  it("hold: 650 ms in the howl pose, trembling at most 0.8 units", () => {
    const frames = stubMotion(false);
    render(<LogoLink />);
    fireEvent.click(link());
    const at = (ms: number) => act(() => frames.shift()!(1000 + ms));
    at(LIFT_MS + 325); // mid-hold: the tremble is at its widest envelope
    expectClose(face(), HOWL);
    const tremble = lift() + HEAD_LIFT;
    expect(tremble).toBeCloseTo(Math.sin(325 / 58) * 0.8, 6);
    expect(Math.abs(tremble)).toBeGreaterThan(0.1);
    at(LIFT_MS + HOLD_MS - 1); // still holding
    expectClose(face(), HOWL);
    expect(Math.abs(lift() + HEAD_LIFT)).toBeLessThanOrEqual(0.8);
    expect(LIFT_MS + HOLD_MS + RETURN_MS).toBe(HOWL_MS);
    expect([LIFT_MS, HOLD_MS, RETURN_MS]).toEqual([680, 650, 440]);
  });

  it("return: 440 ms back to the exact resting pose, then no more frames", () => {
    const frames = stubMotion(false);
    render(<LogoLink />);
    fireEvent.pointerEnter(link(), { pointerType: "pen" });
    expect(mark().dataset.howling).toBe("true");
    const at = (ms: number) => act(() => frames.shift()!(1000 + ms));
    at(LIFT_MS + HOLD_MS + 220); // half-way back
    expectClose(face(), between(0.5));
    expect(lift()).toBeCloseTo(-7, 6);
    at(LIFT_MS + HOLD_MS + 400); // nearly at rest, not yet
    expectClose(face(), between(1 - ease(400 / RETURN_MS)));
    expect(face()).not.toEqual(REST);
    at(HOWL_MS);
    expect(face()).toEqual(REST);
    expect(mouth().getAttribute("opacity")).toBe("0");
    expect(lift()).toBe(0);
    expect(mark().dataset.howling).toBeUndefined();
    expect(frames).toHaveLength(0);
  });

  it("a howl always finishes and never overlaps: triggers and pointer leave mid-howl change nothing", () => {
    const frames = stubMotion(false);
    render(<LogoLink />);
    fireEvent.pointerEnter(link(), { pointerType: "mouse" });
    fireEvent.click(link());
    fireEvent.pointerLeave(link(), { pointerType: "mouse" });
    expect(frames).toHaveLength(1); // one animation, one frame queued
    act(() => frames.shift()!(1000 + LIFT_MS + 10));
    fireEvent.pointerLeave(link(), { pointerType: "mouse" });
    expectClose(face(), HOWL); // still howling after the pointer left
    expect(frames).toHaveLength(1);
  });

  it("triggers: pointer enter but not by touch, click, and keyboard focus only", () => {
    const frames = stubMotion(false);
    render(<LogoLink />);
    fireEvent.pointerEnter(link(), { pointerType: "touch" });
    expect(frames).toHaveLength(0);
    const original = Element.prototype.matches;
    let keyboard = false;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) {
      return selector === ":focus-visible" ? keyboard : original.call(this, selector);
    });
    fireEvent.focus(link()); // focus from a mouse press: not :focus-visible
    expect(frames).toHaveLength(0);
    keyboard = true;
    fireEvent.focus(link()); // keyboard focus
    expect(frames).toHaveLength(1);
  });

  it("reduced motion: jumps to the howl pose, holds 650 ms, jumps back, with no animation frames", () => {
    const frames = stubMotion(true);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<LogoLink />);
    fireEvent.click(link());
    expectClose(face(), HOWL);
    expect(mouth().getAttribute("opacity")).toBe("1");
    expect(lift()).toBe(-HEAD_LIFT); // no tremble
    act(() => vi.advanceTimersByTime(HOLD_MS - 1));
    fireEvent.pointerEnter(link(), { pointerType: "mouse" }); // ignored: the hold is still running
    expectClose(face(), HOWL);
    act(() => vi.advanceTimersByTime(1));
    expect(face()).toEqual(REST);
    expect(mouth().getAttribute("opacity")).toBe("0");
    expect(lift()).toBe(0);
    expect(mark().dataset.howling).toBeUndefined();
    expect(frames).toHaveLength(0);
  });
});
