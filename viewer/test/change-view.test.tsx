import { readFileSync } from "node:fs";
import path from "node:path";
import { ChangeSet, Snapshot, SnapshotManifest } from "@tracehound/analyzer/schema";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChangeList } from "@/components/ChangeList";
import { ComponentChanges } from "@/components/ChangeParts";
import { Viewer } from "@/components/Viewer";
import { buildChangeModel, ChangeSetIndex } from "@/lib/changes";
import { repoList } from "@/lib/repos";

const ROOT = path.resolve(import.meta.dirname, "../..");
const manifest = SnapshotManifest.parse(JSON.parse(readFileSync(path.join(ROOT, "snapshots/index.json"), "utf8")));
const index = ChangeSetIndex.parse(JSON.parse(readFileSync(path.join(ROOT, "changesets/index.json"), "utf8")));
const repos = repoList(manifest);

function model(id: string) {
  const entry = index.find((e) => e.id === id)!;
  const set = ChangeSet.parse(JSON.parse(readFileSync(path.join(ROOT, "changesets", entry.file), "utf8")));
  const repo = repos.find((r) => r.id === entry.repo);
  const snapshot = repo ? Snapshot.parse(JSON.parse(readFileSync(path.join(ROOT, "snapshots", repo.latest.path), "utf8"))) : undefined;
  return buildChangeModel(entry, set, snapshot, { slug: repo?.repoUrl?.replace(/^https:\/\/github\.com\/|\.git$/g, "") });
}

function renderView(id: string, search = "") {
  const changes = model(id);
  window.history.replaceState(null, "", `/?changes=${id}${search}`);
  return render(
    <div style={{ width: 1400, height: 900 }}>
      <Viewer snapshot={changes.display} repos={repos} repoId={changes.entry.repo} changeSets={index} changes={changes} />
    </div>,
  );
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("?changes=recall-worker-deleted", () => {
  it("opens the warnings panel first, with the rule in words and evidence at the base SHA", () => {
    renderView("recall-worker-deleted");
    const panel = screen.getByTestId("change-warnings");
    expect(panel.dataset.open).toBe("true");
    const card = within(panel).getByTestId("change-warning");
    expect(card.dataset.kind).toBe("queue-orphaned-by-diff");
    expect(card.textContent).toMatch(/A queue lost its producer or consumer/);
    expect(card.textContent).toMatch(/Rule: A queue that had both a producer and a consumer at base has only one side at head\./);
    const links = within(card).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("https://github.com/SunnyBagal/Recall/blob/5d2165aa9654f17a148f6663bc478a3fd9f7fc6b/recall-backend/worker.ts#L111");
  });

  it("summary bar: counts, the no-AI statement, and the limitations behind Limits", () => {
    renderView("recall-worker-deleted");
    expect(screen.getByTestId("stat-components").textContent).toBe("5 components touched");
    expect(screen.getByTestId("stat-declarations").textContent).toMatch(/^3 declarations\(\+0 −3 ~0\)$/);
    expect(screen.getByTestId("stat-cross-process").textContent).toBe("1 cross-process edge changed");
    expect(screen.getByTestId("stat-warnings").textContent).toBe("1 warning");
    expect(screen.getByTestId("no-ai").textContent).toMatch(/Computed without AI/);
    fireEvent.click(screen.getByTestId("limits-toggle"));
    const limits = screen.getByTestId("limits");
    expect(limits.textContent).toMatch(/Renames are not detected/);
    expect(limits.textContent).toMatch(/demo diff/);
  });

  it("dims untouched components and badges the changed ones", async () => {
    renderView("recall-worker-deleted");
    const nodes = await screen.findAllByTestId("component-node", {}, { timeout: 5000 });
    const by = (id: string) => nodes.find((n) => n.dataset.componentId === id)!;
    expect(by("recall-frontend:brainly-frontend-app").dataset.change).toBe("untouched");
    expect(by("recall-frontend:brainly-frontend-app").className).toMatch(/opacity-35/);
    const worker = by("recall-backend:worker");
    expect(worker.dataset.change).toBe("touched");
    expect([...within(worker).getByTestId("change-badges").querySelectorAll("[data-badge]")].map((b) => b.textContent)).toEqual(["⚠ 1", "−3", "1 type"]);
  });

  it("clicking a warning highlights the components involved", async () => {
    renderView("recall-worker-deleted");
    await screen.findAllByTestId("component-node", {}, { timeout: 5000 });
    fireEvent.click(within(screen.getByTestId("change-warning")).getAllByRole("button")[0]!);
    await waitFor(() => {
      const lit = screen.getAllByTestId("component-node").filter((n) => n.dataset.panelHover === "true").map((n) => n.dataset.componentId).sort();
      expect(lit).toEqual(["bullmq:content-processing", "recall-backend:brainly-server", "recall-backend:worker"]);
    });
  });

  it("a component opens on its Changes tab: files, then declarations with status, reasons and lines", () => {
    renderView("recall-worker-deleted", "&component=recall-backend:worker");
    const panel = within(screen.getByTestId("inspector"));
    expect(panel.getByRole("tab", { selected: true }).textContent).toMatch(/^Changes/);
    const file = panel.getAllByTestId("change-file")[0]!;
    expect(file.dataset.file).toBe("recall-backend/worker.ts");
    const rows = within(file).getAllByTestId("declaration");
    expect(rows.map((r) => [r.dataset.declarationId, r.dataset.status])).toEqual([
      ["recall-backend/worker.ts#<module>", "removed"],
      ["recall-backend/worker.ts#ContentJobData", "removed"],
      ["recall-backend/worker.ts#processContent", "removed"],
    ]);
    expect(within(rows[2]!).getByTestId("line-counts").textContent).toBe("+0 −92");
    // the removed calls into neighbouring components, each with its evidence
    const edges = panel.getAllByTestId("edge-change");
    expect(edges.map((e) => e.dataset.status)).toEqual(["removed", "removed", "removed", "removed", "removed"]);
    expect(edges.some((e) => /generateEmbedding/.test(e.textContent!) && /Shared Recall/.test(e.textContent!))).toBe(true);
  });
});

describe("collapsed and grouped declarations", () => {
  it("unchanged declarations hide behind 'Show N unchanged'", () => {
    render(<ComponentChanges model={model("recall-worker-deleted")} componentId="recall-backend:shared" />);
    // two files, each with one unchanged callee of the removed worker
    expect(screen.queryAllByTestId("declaration")).toHaveLength(0);
    const toggles = screen.getAllByTestId("unchanged-toggle");
    expect(toggles.map((t) => t.textContent)).toEqual(["Show 1 unchanged (a changed edge or a warning points at them)", "Show 1 unchanged (a changed edge or a warning points at them)"]);
    fireEvent.click(toggles[0]!);
    expect(screen.getAllByTestId("declaration").map((d) => d.dataset.status)).toEqual(["unchanged"]);
  });

  it("formatting-only edits are labelled and grouped together", () => {
    render(<ComponentChanges model={model("recall-7943212")} componentId="recall-backend:brainly-server" />);
    const file = screen.getAllByTestId("change-file").find((f) => f.dataset.file === "recall-backend/index.ts")!;
    const changed = within(file).getAllByTestId("declaration");
    expect(changed.map((d) => d.dataset.status)).toEqual(["modified", "modified"]);
    expect(within(changed[1]!).getByTestId("reasons").textContent).toBe("body changed");
    const toggle = within(file).getByTestId("formatting-toggle");
    expect(toggle.textContent).toMatch(/^5 formatting only/);
    fireEvent.click(toggle);
    const group = within(within(file).getByTestId("formatting-group")).getAllByTestId("declaration");
    expect(group).toHaveLength(5);
    expect(group.every((d) => d.dataset.status === "formatting" && /formatting only/.test(d.textContent!))).toBe(true);
  });
});

describe("?changes=cex-seed-queue-consumer", () => {
  it("shows the payload-type warning with evidence at the head SHA", () => {
    renderView("cex-seed-queue-consumer");
    const card = screen.getByTestId("change-warning");
    expect(card.textContent).toMatch(/A queue's message type changed/);
    expect(card.textContent).toMatch(/different declarations/);
    expect(within(card).getAllByRole("link").map((a) => a.getAttribute("href"))).toContain(
      "https://github.com/SunnyBagal/cex-v2-boilercode/blob/c389d3df0cfa45579061ad5c79bd0d852901d664/engine/src/index.ts#L96",
    );
  });
});

describe("phone list", () => {
  it("puts warnings first, then touched components (warned first), untouched collapsed", () => {
    render(<ChangeList model={model("recall-worker-deleted")} onOpen={() => {}} />);
    const list = screen.getByTestId("change-list");
    const sections = within(list).getAllByRole("region");
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual(["What could break", "Components"]);
    expect(within(sections[0]!).getAllByTestId("change-warning")).toHaveLength(1);
    const rows = within(sections[1]!).getAllByTestId("change-row").map((r) => r.dataset.componentId);
    expect(rows[0]).toBe("recall-backend:worker");
    expect(rows).toHaveLength(5);
    expect(rows).not.toContain("recall-frontend:brainly-frontend-app");
    fireEvent.click(within(sections[1]!).getByText(/Show 2 unchanged components/));
    expect(within(sections[1]!).getAllByTestId("change-row")).toHaveLength(7);
  });

  it("a row expands into files and declarations", () => {
    render(<ChangeList model={model("recall-worker-deleted")} onOpen={() => {}} />);
    const worker = screen.getAllByTestId("change-row").find((r) => r.dataset.componentId === "recall-backend:worker")!;
    fireEvent.click(within(worker).getAllByRole("button")[0]!);
    expect(within(worker).getAllByTestId("declaration")).toHaveLength(3);
  });
});
