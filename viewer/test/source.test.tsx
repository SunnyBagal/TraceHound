import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SourcePreview } from "@/components/SourcePreview";
import { fileEvidence, sourceWindow } from "@/lib/source";
import { highlightCode } from "@/lib/highlight";
import { repoSnapshot } from "./repo-snapshot";
const snapshot = repoSnapshot("recall");
const evidence = fileEvidence(snapshot, snapshot.components.find((c) => c.kind === "api")!.files[0]!)!;
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("shows evidence immediately and fetches the pinned source only on Show more", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, text: async () => Array.from({ length: 300 }, (_, i) => `const line${i + 1} = ${i + 1};`).join("\n") } as Response);
  render(<SourcePreview snapshot={snapshot} file={evidence.file} evidence={evidence} />);
  expect(screen.getByTestId("code-snippet").textContent).toContain(evidence.snippet.lines[0]);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Show more" }));
  await waitFor(() => expect(screen.getByText(/Lines .* at /)).toBeTruthy());
  expect(fetcher.mock.calls[0]![0]).toContain(`raw.githubusercontent.com/SunnyBagal/Recall/${snapshot.repo.commitSha}/`);
});
it("keeps the evidence snippet when a source request fails", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  render(<SourcePreview snapshot={{ ...snapshot, repo: { ...snapshot.repo, commitSha: "b".repeat(40) } }} file={evidence.file} evidence={evidence} />);
  fireEvent.click(screen.getByRole("button", { name: "Show more" }));
  expect(await screen.findByText(/snapshot snippet is still shown/)).toBeTruthy();
  expect(screen.getByTestId("code-snippet").textContent).toContain(evidence.snippet.lines[0]);
});
it("uses declaration bounds when known and otherwise thirty context lines", () => {
  const source = Array.from({ length: 200 }, (_, i) => String(i + 1)).join("\n");
  expect(sourceWindow(source, evidence, { startLine: 50, endLine: 55 })).toEqual({ startLine: 50, lines: ["50", "51", "52", "53", "54", "55"] });
  expect(sourceWindow(source, { ...evidence, range: { startLine: 80, endLine: 81 } }).lines).toHaveLength(62);
  expect(highlightCode('const x = "<script>"; // text').map((t) => t.text).join("")).toBe('const x = "<script>"; // text');
});
