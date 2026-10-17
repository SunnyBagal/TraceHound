import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Viewer } from "@/components/Viewer";
import { repoSnapshot } from "./repo-snapshot";

const model = "nvidia/nemotron-3-super-120b-a12b";
const config = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../configs/recall.tracehound.json"), "utf8"));
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

describe.each(["recall", "tracehound-demo"])("published Super summaries: %s", (repo) => {
  const snapshot = repoSnapshot(repo);
  it("retains the suppression and fixed-name overrides, with heuristic subtitles available", () => {
    for (const component of snapshot.components) {
      const rule = config.components[component.id];
      if (rule?.summary === false) {
        expect(component.summary, component.id).toBeUndefined();
        expect(component.naming.summaryDropped, component.id).toBe(true);
      }
      if (rule?.name) {
        expect(component.name, component.id).toBe(rule.name);
        expect(component.naming.source, component.id).toBe("override");
      }
      expect(component.subtitle, component.id).toBeTruthy();
    }
  });
  it("stores the generated summary with model provenance and discloses it in Overview", () => {
    const component = snapshot.components.find((c) => c.id === "recall-backend:shared")!;
    expect(component.summary).toBeTruthy();
    expect(component.summary!.split(/\s+/).length).toBeLessThanOrEqual(25);
    expect(component.summary).not.toContain("\n");
    expect(component.naming).toMatchObject({ source: "llm", model });
    expect(snapshot.llmCalls.some((call) => call.componentId === component.id && call.model === model && call.ok && call.accepted)).toBe(true);
    window.history.replaceState(null, "", `/graph?repo=${repo}&component=${encodeURIComponent(component.id)}`);
    render(<Viewer snapshot={snapshot} />);
    const summary = within(within(screen.getByTestId("inspector")).getByTestId("summary"));
    expect(summary.getByText(component.summary!)).toBeTruthy();
    expect(summary.getByTestId("summary-model-written").textContent).toBe("Summary by Nemotron 3 Super · unverified");
  });
});
