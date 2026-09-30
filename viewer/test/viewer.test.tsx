import { readFileSync } from "node:fs";
import path from "node:path";
import { Snapshot, SnapshotManifest } from "@tracehound/analyzer/schema";
import { ReactFlowProvider } from "@xyflow/react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GraphCanvas } from "@/components/GraphCanvas";
import { permalink } from "@/lib/github";
import { EDGE_STYLES } from "@/lib/graph";

// The committed demo snapshot, loaded exactly as the viewer does: manifest → latest.
const root = path.resolve(import.meta.dirname, "../../snapshots");
const manifest = SnapshotManifest.parse(JSON.parse(readFileSync(path.join(root, "index.json"), "utf8")));
const snapshot = Snapshot.parse(JSON.parse(readFileSync(path.join(root, manifest.latest!.path), "utf8")));

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

  it("labels names by source: Nemotron, heuristic or override", async () => {
    renderCanvas();
    const nodes = await screen.findAllByTestId("component-node", {}, { timeout: 5000 });
    const badge = (id: string) => within(nodes.find((n) => n.dataset.componentId === id)!).getByTitle(/Named by|Name source/).textContent;
    expect(badge("redis-rpc-bridge")).toBe("override");
    expect(badge("backend:auth-api")).toBe(snapshot.components.find((c) => c.id === "backend:auth-api")!.naming.source === "llm" ? "Nemotron" : "heuristic");
  });
});
