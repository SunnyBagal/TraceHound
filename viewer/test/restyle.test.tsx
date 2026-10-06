import { ReactFlowProvider } from "@xyflow/react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphCanvas } from "@/components/GraphCanvas";
import { HOWL_MS, LogoLink, WOLF_PATH } from "@/components/Logo";
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
        expect(mark?.querySelector('[data-logo="nvidia.svg"]'), c.id).toBeTruthy();
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
    expect(named.querySelector('[data-logo="nvidia.svg"]')).toBeTruthy();
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

describe("the howling logo", () => {
  function stubMotion(reduce: boolean) {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("prefers-reduced-motion: reduce"), media: query, addEventListener() {}, removeEventListener() {} }));
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    return frames;
  }
  const mark = () => screen.getByTestId("logo-mark");
  const d = () => mark().querySelector("path")!.getAttribute("d");

  it("still links to the default canvas view", () => {
    render(<LogoLink />);
    expect(screen.getByTestId("home-link").getAttribute("href")).toBe("/");
    expect(mark().querySelector("path")!.getAttribute("fill")).toBe("currentColor");
  });

  it("howls on hover, once at a time, then comes back to rest", () => {
    const frames = stubMotion(false);
    render(<LogoLink />);
    fireEvent.pointerEnter(screen.getByTestId("home-link"));
    fireEvent.focus(screen.getByTestId("home-link")); // a second trigger mid-howl starts nothing
    fireEvent.pointerDown(screen.getByTestId("home-link"));
    expect(frames).toHaveLength(1);
    expect(mark().dataset.howling).toBe("true");
    const run = (t: number) => act(() => frames.shift()!(t));
    run(1000);
    run(1000 + 300); // past the rise: the howl pose
    expect(d()).not.toBe(WOLF_PATH);
    run(1000 + HOWL_MS + 1);
    expect(d()).toBe(WOLF_PATH);
    expect(mark().dataset.howling).toBeUndefined();
    expect(frames).toHaveLength(0);
  });

  it("with prefers-reduced-motion it never animates: hover, press and focus leave it at rest", () => {
    const frames = stubMotion(true);
    render(<LogoLink />);
    const link = screen.getByTestId("home-link");
    fireEvent.pointerEnter(link);
    fireEvent.pointerDown(link);
    fireEvent.focus(link);
    expect(frames).toHaveLength(0);
    expect(mark().dataset.howling).toBeUndefined();
    expect(d()).toBe(WOLF_PATH);
  });
});
