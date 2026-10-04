import { ReactFlowProvider } from "@xyflow/react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GraphCanvas } from "@/components/GraphCanvas";
import { permalink } from "@/lib/github";
import { EDGE_STYLES } from "@/lib/graph";
import { repoSnapshot } from "./repo-snapshot";

// The committed CEX demo snapshot, asked for by repo id (not the index's top-level `latest`).
const snapshot = repoSnapshot("cex-v2-boilercode");

function renderCanvas() {
  return render(
    <div style={{ width: 1200, height: 800 }}>
      <ReactFlowProvider>
        <GraphCanvas snapshot={snapshot} selection={null} onSelect={() => {}} />
      </ReactFlowProvider>
    </div>,
  );
}

describe("demo snapshot permalinks", () => {
  it("point at the fork, pinned to the full commit SHA", () => {
    expect(permalink(snapshot.repo, "engine/src/index.ts", 3, 7)).toBe(
      "https://github.com/SunnyBagal/cex-v2-boilercode/blob/da0e3d640a9c02f815fcca48f8328c94558cc058/engine/src/index.ts#L3-L7",
    );
  });
});

describe("GraphCanvas with the demo snapshot", () => {
  it("renders one node per component (9)", async () => {
    renderCanvas();
    const nodes = await screen.findAllByTestId("component-node", {}, { timeout: 5000 });
    expect(nodes).toHaveLength(9);
    expect(nodes.map((n) => n.dataset.componentId).sort()).toEqual(snapshot.components.map((c) => c.id).sort());
  });

  it("draws all three edge styles, each also labelled in text", async () => {
    renderCanvas();
    await waitFor(() => expect(screen.getAllByTestId("edge-path")).toHaveLength(snapshot.edges.length), { timeout: 5000 });
    const paths = screen.getAllByTestId("edge-path");
    const dashFor = (label: string) => new Set(paths.filter((p) => p.dataset.confidence === label).map((p) => p.getAttribute("stroke-dasharray")));

    expect(dashFor("proven")).toEqual(new Set(["none"])); // solid
    expect(dashFor("resolved-default")).toEqual(new Set([EDGE_STYLES["resolved-default"].dash])); // dashed
    expect(dashFor("dynamic")).toEqual(new Set([EDGE_STYLES.dynamic.dash])); // dotted

    const labels = screen.getAllByTestId("edge-label").map((l) => l.textContent ?? "");
    for (const label of ["proven", "resolved-default", "dynamic"]) {
      expect(labels.some((t) => t.includes(label))).toBe(true);
    }
  });

  it('labels every model-written name/summary "Model-written (Nemotron Nano), prose not verified", and nothing else', async () => {
    renderCanvas();
    const nodes = await screen.findAllByTestId("component-node", {}, { timeout: 5000 });
    const node = (id: string) => nodes.find((n) => n.dataset.componentId === id)!;
    const llm = snapshot.components.filter((c) => c.naming.source === "llm");
    expect(llm.length).toBeGreaterThan(0);
    for (const c of llm) {
      expect(within(node(c.id)).getByTestId("model-written").textContent).toBe("Model-written (Nemotron Nano), prose not verified");
    }
    for (const c of snapshot.components.filter((c) => c.naming.source !== "llm")) {
      expect(within(node(c.id)).queryByTestId("model-written")).toBeNull();
      expect(within(node(c.id)).getByTitle(/Name source/).textContent).toBe(c.naming.source);
    }
    expect(screen.getAllByTestId("model-written")).toHaveLength(llm.length); // edges/labels carry none
  });
});

describe("canvas controls and node icons (Railway style)", () => {
  it("zoom in, zoom out, fit view and reset layout sit bottom left, icon only, each named with a tooltip", async () => {
    const view = within(renderCanvas().container); // this file renders without cleanup
    await view.findAllByTestId("component-node", {}, { timeout: 5000 });
    const panel = view.getByTestId("canvas-controls");
    expect(panel.classList.contains("bottom")).toBe(true);
    expect(panel.classList.contains("left")).toBe(true);
    const buttons = within(panel).getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["Zoom in", "Zoom out", "Fit view", "Reset layout"]);
    for (const b of buttons) {
      expect(b.textContent).toBe(""); // no text labels
      expect(b.getAttribute("title")).toBeTruthy();
    }
    expect(view.queryByText("Fit view")).toBeNull(); // the old top-right text buttons are gone
    expect(view.queryByText("Reset layout")).toBeNull();
  });

  it("node icons sit on the card without a tile; the Redis broker shows the Redis R", async () => {
    const nodes = await within(renderCanvas().container).findAllByTestId("component-node", {}, { timeout: 5000 });
    for (const n of nodes) {
      const icon = within(n).getByTestId("component-icon");
      expect(icon.className, n.dataset.componentId).not.toMatch(/\b(border|bg-panel)\b/);
    }
    // the demo's Redis node is kind "queue" (Redis lists), so it is a broker
    const redis = within(nodes.find((n) => n.dataset.componentId === "redis:redis-url")!).getByTestId("component-icon");
    expect(redis.dataset.use).toBe("broker");
    expect(redis.querySelector("[data-logo]")?.getAttribute("data-logo")).toBe("redis-r.svg");
    // the database keeps its brand logo, a plain component its kind icon
    const db = within(nodes.find((n) => n.dataset.componentId === "db:backend")!).getByTestId("component-icon");
    expect(db.querySelector("[data-logo]")?.getAttribute("data-logo")).toBe("postgresql.svg");
  });
});
