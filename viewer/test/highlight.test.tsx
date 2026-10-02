import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Viewer } from "@/components/Viewer";
import { activeHighlight, edgesWithEvidenceIn, highlightReducer, NO_HIGHLIGHT, type Highlight } from "@/lib/highlight";
import { repoSnapshot } from "./repo-snapshot";

const snapshot = repoSnapshot("cex-v2-boilercode");

const a: Highlight = { key: "a", nodeIds: ["x"], edgeIds: [] };
const b: Highlight = { key: "b", nodeIds: [], edgeIds: ["e"] };

describe("hover highlight state (pure)", () => {
  it("enter sets it, leave clears it, and a late leave from another row is ignored", () => {
    const s1 = highlightReducer(NO_HIGHLIGHT, { type: "enter", target: a });
    expect(activeHighlight(s1)).toBe(a);
    const s2 = highlightReducer(s1, { type: "enter", target: b });
    expect(activeHighlight(highlightReducer(s2, { type: "leave", key: "a" }))).toBe(b);
    expect(activeHighlight(highlightReducer(s2, { type: "leave", key: "b" }))).toBeNull();
  });

  it("focus/blur behave like enter/leave", () => {
    const s1 = highlightReducer(NO_HIGHLIGHT, { type: "focus", target: a });
    expect(activeHighlight(s1)).toBe(a);
    expect(activeHighlight(highlightReducer(s1, { type: "blur", key: "b" }))).toBe(a);
    expect(activeHighlight(highlightReducer(s1, { type: "blur", key: "a" }))).toBeNull();
  });

  it("hover wins over focus; leaving falls back to the focused row; clear drops both", () => {
    const focused = highlightReducer(NO_HIGHLIGHT, { type: "focus", target: a });
    const hovered = highlightReducer(focused, { type: "enter", target: b });
    expect(activeHighlight(hovered)).toBe(b);
    expect(activeHighlight(highlightReducer(hovered, { type: "leave", key: "b" }))).toBe(a);
    expect(highlightReducer(hovered, { type: "clear" })).toEqual(NO_HIGHLIGHT);
  });

  it("a Files row maps to every edge with evidence in that file, or none", () => {
    expect(edgesWithEvidenceIn(snapshot, "backend/src/utils/engine-client.ts").sort()).toEqual(
      [
        "redis-rpc-bridge->backend:shared:imports",
        "redis-rpc-bridge->pending-response-registry:imports",
        "redis-rpc-bridge->redis:redis-url:produces",
        "redis:redis-url->redis-rpc-bridge:consumes",
      ].sort(),
    );
    expect(edgesWithEvidenceIn(snapshot, "backend/src/db.ts")).toEqual([]);
  });
});

describe("hover highlight between the inspector and the canvas", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
  });

  const inspector = () => within(screen.getByTestId("inspector"));
  const node = (id: string) => document.querySelector<HTMLElement>(`[data-testid="component-node"][data-component-id="${CSS.escape(id)}"]`)!;
  const edge = (id: string) => document.querySelector<HTMLElement>(`[data-testid="edge-path"][data-edge-id="${CSS.escape(id)}"]`)!;
  const lit = () => ({
    nodes: [...document.querySelectorAll<HTMLElement>('[data-testid="component-node"][data-panel-hover]')].map((n) => n.dataset.componentId),
    edges: [...document.querySelectorAll<HTMLElement>('[data-testid="edge-path"][data-panel-hover]')].map((e) => e.dataset.edgeId),
  });

  async function renderAt(search: string) {
    window.history.replaceState(null, "", `/${search}`);
    render(
      <div style={{ width: 1400, height: 900 }}>
        <Viewer snapshot={snapshot} />
      </div>,
    );
    await screen.findAllByTestId("component-node", {}, { timeout: 5000 });
    await waitFor(() => expect(screen.getAllByTestId("edge-path")).toHaveLength(snapshot.edges.length));
  }

  it("Connections: hover and focus light the row, that edge and the node at its other end, without touching the URL", async () => {
    await renderAt("?component=redis-rpc-bridge");
    fireEvent.click(inspector().getByRole("tab", { name: /Connections/ }));
    const url = window.location.href;
    const historyLength = window.history.length;
    const out = snapshot.edges.find((e) => e.source === "redis-rpc-bridge")!;
    const row = inspector().getAllByTestId("connection")[0]!;

    fireEvent.mouseEnter(row);
    expect(row.dataset.highlighted).toBe("true");
    expect(lit()).toEqual({ nodes: [out.target], edges: [out.id] });
    expect(node(out.target).className).toContain("outline-highlight");
    expect(node(out.target).className).not.toContain("border-accent"); // not the selection style
    expect(edge(out.id).dataset.panelHover).toBe("true");
    fireEvent.mouseLeave(row);
    expect(row.dataset.highlighted).toBe("false");
    expect(lit()).toEqual({ nodes: [], edges: [] });

    fireEvent.focus(row);
    expect(lit()).toEqual({ nodes: [out.target], edges: [out.id] });
    fireEvent.blur(row);
    expect(lit()).toEqual({ nodes: [], edges: [] });

    expect(window.location.href).toBe(url);
    expect(window.history.length).toBe(historyLength);
  });

  it("Files: a row lights every edge whose evidence is in that file, or only itself", async () => {
    await renderAt("?component=redis-rpc-bridge");
    fireEvent.click(inspector().getByRole("tab", { name: /Files/ }));
    const rows = inspector().getAllByTestId("file-row");
    const client = rows.find((r) => r.textContent?.includes("engine-client.ts"))!;
    fireEvent.mouseEnter(client);
    expect(client.dataset.highlighted).toBe("true");
    expect(lit().nodes).toEqual([]);
    expect(lit().edges.sort()).toEqual(edgesWithEvidenceIn(snapshot, "backend/src/utils/engine-client.ts").sort());
    fireEvent.mouseLeave(client);
    expect(lit()).toEqual({ nodes: [], edges: [] });
  });

  it("Endpoints: hovering FROM/TO lights the card and its node; switching views drops the highlight", async () => {
    const e = snapshot.edges.find((x) => x.id === "backend:exchange-api->redis-rpc-bridge:imports")!;
    await renderAt(`?edge=${encodeURIComponent(e.id)}`);
    const to = inspector().getByTestId("endpoint-to");
    fireEvent.mouseEnter(to);
    expect(to.dataset.highlighted).toBe("true");
    expect(lit()).toEqual({ nodes: [e.target], edges: [] });
    fireEvent.mouseLeave(to);
    fireEvent.focus(inspector().getByTestId("endpoint-from"));
    expect(lit()).toEqual({ nodes: [e.source], edges: [] });

    // opening the endpoint unmounts the card without a blur: the highlight must not linger
    fireEvent.click(inspector().getByTestId("endpoint-from"));
    await waitFor(() => expect(lit()).toEqual({ nodes: [], edges: [] }));
  });
});
