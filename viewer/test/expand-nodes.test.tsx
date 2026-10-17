import { ReactFlowProvider } from "@xyflow/react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GraphCanvas } from "@/components/GraphCanvas";
import { expandedHeight, nodeContents } from "@/lib/contents";
import { NODE_HEIGHT, NODE_WIDTH } from "@/lib/graph";
import { elkLayout } from "@/lib/layout";
import { repoSnapshot } from "./repo-snapshot";

const snapshot = repoSnapshot("recall");
const api = snapshot.components.find((c) => c.kind === "api")!;
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });
it("expands in place, writes hash state, restores it, caps rows and opens the inspector for more", async () => {
  window.history.replaceState(null, "", "/graph?repo=recall");
  const select = vi.fn();
  const view = () => render(<ReactFlowProvider><GraphCanvas snapshot={snapshot} selection={null} onSelect={select} /></ReactFlowProvider>);
  const first = view();
  const button = await screen.findByRole("button", { name: `Expand ${api.name}` });
  const card = button.closest<HTMLElement>('[data-testid="component-node"]')!;
  expect(card.style.height).toBe(`${NODE_HEIGHT}px`);
  const position = card.parentElement!.style.transform;
  fireEvent.click(button);
  await waitFor(() => expect(card.style.height).toBe(`${expandedHeight(nodeContents(snapshot, api))}px`));
  expect(card.parentElement!.style.transform).toBe(position);
  expect(window.location.hash).toContain(encodeURIComponent(api.id));
  expect(select).not.toHaveBeenCalled();
  expect(within(card).getByTestId("node-contents").querySelectorAll('div.h-8')).toHaveLength(8);
  fireEvent.click(within(card).getByRole("button", { name: "+1 more" }));
  expect(select).toHaveBeenCalledWith({ type: "node", id: api.id });
  first.unmount();
  view();
  const collapse = await screen.findByRole("button", { name: `Collapse ${api.name}` });
  fireEvent.click(collapse);
  await screen.findByRole("button", { name: `Expand ${api.name}` });
  expect(window.location.hash).toBe("");
});
it("lays out mixed expanded and collapsed heights with no overlaps", async () => {
  const heights = Object.fromEntries(snapshot.components.map((c) => [c.id, c.kind === "api" || c.kind === "worker" ? expandedHeight(nodeContents(snapshot, c)) : NODE_HEIGHT]));
  const positions = await elkLayout(snapshot.components.map((c) => c.id), snapshot.edges, heights);
  for (const [a, p] of Object.entries(positions)) for (const [b, q] of Object.entries(positions)) {
    if (a >= b) continue;
    expect(p.x + NODE_WIDTH <= q.x || q.x + NODE_WIDTH <= p.x || p.y + heights[a]! <= q.y || q.y + heights[b]! <= p.y, `${a} / ${b}`).toBe(true);
  }
});
