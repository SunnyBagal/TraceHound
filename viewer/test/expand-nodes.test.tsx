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
it("a toggle changes only that card's height: other cards and dragged positions stay put", async () => {
  // dragged positions, far apart so nothing needs pushing (lib/positions.ts key per repo)
  const saved = Object.fromEntries(snapshot.components.map((c, i) => [c.id, { x: (i % 3) * 900 + 7, y: Math.floor(i / 3) * 900 + 3 }]));
  window.localStorage.setItem(`tracehound:positions:repo:${snapshot.repo.name}`, JSON.stringify(saved));
  render(<ReactFlowProvider><GraphCanvas snapshot={snapshot} selection={null} onSelect={vi.fn()} /></ReactFlowProvider>);
  const button = await screen.findByRole("button", { name: `Expand ${api.name}` });
  const transforms = () => Object.fromEntries(screen.getAllByTestId("component-node").map((n) => [n.dataset.componentId!, n.parentElement!.style.transform]));
  await waitFor(() => expect(transforms()[api.id]).toContain(`${saved[api.id]!.x}px`));
  const before = transforms();
  fireEvent.click(button);
  const card = button.closest<HTMLElement>('[data-testid="component-node"]')!;
  await waitFor(() => expect(card.style.height).toBe(`${expandedHeight(nodeContents(snapshot, api))}px`));
  await new Promise((r) => setTimeout(r, 50)); // an ELK re-run would land here
  expect(transforms()).toEqual(before);
  fireEvent.click(screen.getByRole("button", { name: `Collapse ${api.name}` }));
  await waitFor(() => expect(card.style.height).toBe(`${NODE_HEIGHT}px`));
  await new Promise((r) => setTimeout(r, 50));
  expect(transforms()).toEqual(before);
  window.localStorage.clear();
});
it("expanding pushes down only the cards it would overlap, by no more than it must", async () => {
  // a stack in one column: the API, a card right under it, and one far to the side
  const [a, b, c] = [api, ...snapshot.components.filter((x) => x.id !== api.id)];
  const saved: Record<string, { x: number; y: number }> = Object.fromEntries(snapshot.components.map((x, i) => [x.id, { x: 4000 + i * 900, y: 0 }]));
  saved[a.id] = { x: 0, y: 0 };
  saved[b!.id] = { x: 40, y: NODE_HEIGHT + 20 };
  saved[c!.id] = { x: NODE_WIDTH + 200, y: 10 };
  window.localStorage.setItem(`tracehound:positions:repo:${snapshot.repo.name}`, JSON.stringify(saved));
  render(<ReactFlowProvider><GraphCanvas snapshot={snapshot} selection={null} onSelect={vi.fn()} /></ReactFlowProvider>);
  const button = await screen.findByRole("button", { name: `Expand ${api.name}` });
  const at = (id: string) => screen.getAllByTestId("component-node").find((n) => n.dataset.componentId === id)!.parentElement!.style.transform;
  await waitFor(() => expect(at(b!.id)).toBe(`translate(40px,${NODE_HEIGHT + 20}px)`));
  const side = at(c!.id);
  fireEvent.click(button);
  const h = expandedHeight(nodeContents(snapshot, api));
  await waitFor(() => expect(at(b!.id)).toBe(`translate(40px,${h + 20}px)`));
  expect(at(a.id)).toBe("translate(0px,0px)");
  expect(at(c!.id)).toBe(side);
  window.localStorage.clear();
});
