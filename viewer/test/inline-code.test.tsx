import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Viewer } from "@/components/Viewer";
import { fileEvidence } from "@/lib/source";
import { repoSnapshot } from "./repo-snapshot";
const snapshot = repoSnapshot("recall");
const api = snapshot.components.find((c) => c.kind === "api")!;
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, "", "/"); });
function panel() {
  window.history.replaceState(null, "", `/graph?repo=recall&component=${encodeURIComponent(api.id)}`);
  render(<Viewer snapshot={snapshot} />);
  return within(screen.getByTestId("inspector"));
}
it("expands a route into its snapshot snippet and preserves its GitHub link", () => {
  const fetcher = vi.spyOn(globalThis, "fetch");
  const view = panel();
  const row = view.getAllByTestId("route-row")[0]!;
  const route = api.routes[0]!;
  const evidence = snapshot.evidence.find((e) => e.id === route.evidenceId)!;
  fireEvent.click(within(row).getByRole("button", { name: `Expand ${route.method} ${route.path}` }));
  expect(within(row).getByTestId("code-snippet").textContent).toContain(evidence.snippet.lines[0]);
  expect(within(row).getByRole("link").getAttribute("href")).toContain(`/blob/${snapshot.repo.commitSha}/${route.file}`);
  expect(fetcher.mock.calls.every(([url]) => !String(url).includes("raw.githubusercontent.com"))).toBe(true);
  fireEvent.click(within(row).getByRole("button", { name: /Collapse/ }));
  expect(within(row).queryByTestId("code-snippet")).toBeNull();
});
it("expands a file into its evidence snippet without removing the GitHub link", () => {
  const view = panel();
  fireEvent.click(view.getByRole("tab", { name: /Files/ }));
  const row = view.getAllByTestId("file-row")[0]!;
  const file = api.membership[0]!.file;
  fireEvent.click(within(row).getByRole("button", { name: `Expand ${file}` }));
  expect(within(row).getByTestId("code-snippet").textContent).toContain(fileEvidence(snapshot, file)!.snippet.lines[0]);
  expect(within(row).getByRole("link").getAttribute("href")).toContain(`/blob/${snapshot.repo.commitSha}/${file}`);
});
