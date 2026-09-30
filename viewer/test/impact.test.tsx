import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ImpactReport, Snapshot } from "@tracehound/analyzer/schema";
import { ReactFlowProvider } from "@xyflow/react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GraphCanvas } from "@/components/GraphCanvas";
import { ImpactPanel } from "@/components/ImpactPanel";
import { verifyImpacts } from "../scripts/snapshots.mjs";

// The committed seed impact and the base snapshot it names, loaded as the viewer does for ?impact=.
const ROOT = path.resolve(import.meta.dirname, "../..");
const impact = ImpactReport.parse(JSON.parse(readFileSync(path.join(ROOT, "impacts/seed-queue-consumer.json"), "utf8")));
const snapshot = Snapshot.parse(JSON.parse(readFileSync(path.join(ROOT, "snapshots", impact.snapshot.file), "utf8")));

describe("?impact=seed-queue-consumer on the canvas", () => {
  it("marks changed and affected components with border style and a text chip, not colour alone", async () => {
    render(
      <div style={{ width: 1200, height: 800 }}>
        <ReactFlowProvider>
          <GraphCanvas snapshot={snapshot} selection={null} onSelect={() => {}} impact={impact} />
        </ReactFlowProvider>
      </div>,
    );
    const nodes = await screen.findAllByTestId("component-node", {}, { timeout: 5000 });
    const node = (id: string) => nodes.find((n) => n.dataset.componentId === id)!;

    expect(node("engine:engine-worker").dataset.impact).toBe("changed");
    expect(node("engine:engine-worker").className).toContain("border-solid");
    expect(within(node("engine:engine-worker")).getByTestId("impact-chip").textContent).toBe("CHANGED");

    expect(node("backend:exchange-api").dataset.impact).toBe("affected");
    expect(node("backend:exchange-api").className).toContain("border-dashed");
    expect(within(node("backend:exchange-api")).getByTestId("impact-chip").textContent).toBe("AFFECTED · depth 2");

    expect(nodes.filter((n) => n.dataset.impact === "affected")).toHaveLength(impact.affected.length);
    expect(node("backend:auth-api").dataset.impact).toBe("none");
    expect(within(node("backend:auth-api")).queryByTestId("impact-chip")).toBeNull();

    // every dynamic edge carries a visible text flag in impact mode
    await waitFor(() => expect(screen.getAllByTestId("dynamic-flag")).toHaveLength(snapshot.edges.filter((e) => e.confidenceLabel === "dynamic").length));
  });

  it("side panel lists each affected component's chain with an evidence permalink per hop", () => {
    render(<ImpactPanel name="seed-queue-consumer" impact={impact} snapshot={snapshot} onSelect={() => {}} />);
    const chains = within(screen.getByTestId("impact-chains")).getAllByRole("listitem", { name: "" });
    expect(chains.length).toBeGreaterThanOrEqual(impact.affected.length);
    const exchange = impact.affected.find((a) => a.id === "backend:exchange-api")!;
    for (const hop of exchange.chain) {
      const link = screen.getAllByRole("link").find((a) => a.textContent === `${hop.evidence.file}:${hop.evidence.line}`);
      expect(link?.getAttribute("href")).toBe(`https://github.com/SunnyBagal/cex-v2-boilercode/blob/${impact.base}/${hop.evidence.file}#L${hop.evidence.line}`);
    }
    expect(screen.getByTestId("impact-tests").textContent).toBe("0 linked tests");
  });
});

describe("build-time impact verification", () => {
  function fixtureDirs() {
    const dir = mkdtempSync(path.join(tmpdir(), "tracehound-impacts-"));
    cpSync(path.join(ROOT, "impacts"), path.join(dir, "impacts"), { recursive: true });
    return { impacts: path.join(dir, "impacts"), snapshots: path.join(ROOT, "snapshots") };
  }

  it("accepts the committed seed impacts", () => {
    const { impacts, snapshots } = fixtureDirs();
    expect(verifyImpacts(impacts, snapshots)).toEqual(["seed-pending-registry", "seed-queue-consumer", "seed-rpc-bridge"]);
  });

  it("fails loudly when an impact file references a component that isn't in its base snapshot", () => {
    const { impacts, snapshots } = fixtureDirs();
    const bad = { ...impact, affected: [...impact.affected, { ...impact.affected[0]!, id: "ghost:component" }] };
    writeFileSync(path.join(impacts, "seed-bad.json"), JSON.stringify(bad));
    expect(() => verifyImpacts(impacts, snapshots, "../impacts")).toThrow(
      /\.\.\/impacts\/seed-bad\.json does not match its base snapshot [\s\S]*component "ghost:component", which is not in the base snapshot/,
    );
  });
});
