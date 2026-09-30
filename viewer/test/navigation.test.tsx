import { readFileSync } from "node:fs";
import path from "node:path";
import { Snapshot, SnapshotManifest } from "@tracehound/analyzer/schema";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Viewer } from "@/components/Viewer";
import { back, entryFromSearch, jump, push, searchFor, stackFromState, withTab, type Stack } from "@/lib/navigation";

const root = path.resolve(import.meta.dirname, "../../snapshots");
const manifest = SnapshotManifest.parse(JSON.parse(readFileSync(path.join(root, "index.json"), "utf8")));
const snapshot = Snapshot.parse(JSON.parse(readFileSync(path.join(root, manifest.latest!.path), "utf8")));

const AUTH = "backend:auth-api";
const authEdge = snapshot.edges.find((e) => e.source === AUTH)!;

describe("navigation stack (pure)", () => {
  const a = { type: "node" as const, id: AUTH };
  const e = { type: "edge" as const, id: authEdge.id };
  const b = { type: "node" as const, id: authEdge.target };

  it("push appends, and pushing the open item is a no-op", () => {
    const s1 = push([a], e);
    expect(s1).toEqual([a, e]);
    expect(push(s1, e)).toBe(s1);
  });

  it("back drops the last entry; jump keeps the path up to a crumb", () => {
    const s: Stack = [a, e, b];
    expect(back(s)).toEqual([a, e]);
    expect(jump(s, 0)).toEqual([a]);
    expect(jump(s, 2)).toEqual(s);
  });

  it("withTab records the tab on the open entry only", () => {
    expect(withTab([a, e], "evidence")).toEqual([a, { ...e, tab: "evidence" }]);
  });

  it("deep links: ?component= / ?edge= must exist in the snapshot", () => {
    expect(entryFromSearch(`?component=${AUTH}`, snapshot)).toEqual(a);
    expect(entryFromSearch(`?edge=${encodeURIComponent(authEdge.id)}`, snapshot)).toEqual(e);
    expect(entryFromSearch("?component=ghost", snapshot)).toBeNull();
  });

  it("URLs keep other parameters (?impact=) and carry only the open item", () => {
    expect(searchFor(`?impact=seed-queue-consumer&component=${AUTH}`, e)).toBe(`?impact=seed-queue-consumer&edge=${encodeURIComponent(authEdge.id)}`);
    expect(searchFor(`?impact=seed-queue-consumer&component=${AUTH}`, undefined)).toBe("?impact=seed-queue-consumer");
  });

  it("history.state stacks drop entries the snapshot no longer has", () => {
    expect(stackFromState({ tracehound: { stack: [a, { type: "node", id: "ghost" }, e] } }, snapshot)).toEqual([a, e]);
    expect(stackFromState({ __NA: true }, snapshot)).toBeNull();
  });
});

describe("inspector history in the viewer", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
  });

  const crumbs = () => screen.queryAllByTestId("crumb").map((c) => c.textContent);
  const inspector = () => within(screen.getByTestId("inspector"));
  const param = (key: string) => new URLSearchParams(window.location.search).get(key);

  function renderAt(search: string) {
    window.history.replaceState(null, "", `/${search}`);
    return render(
      <div style={{ width: 1400, height: 900 }}>
        <Viewer snapshot={snapshot} />
      </div>,
    );
  }

  it("a fresh deep link opens with a one-item breadcrumb and no back arrow", () => {
    renderAt(`?component=${AUTH}`);
    expect(crumbs()).toEqual(["Authentication Service"]);
    expect(screen.queryByTestId("panel-back")).toBeNull();
    expect(inspector().getByRole("heading", { level: 2 }).textContent).toBe("Authentication Service");
    expect(inspector().getByTestId("model-written").textContent).toBe("Model-written (Nemotron Nano), prose not verified");
  });

  it("push → back → crumb jump walk the browser history, restoring URL, breadcrumb and tab", async () => {
    renderAt(`?component=${AUTH}`);
    const target = snapshot.components.find((c) => c.id === authEdge.target)!;

    fireEvent.click(inspector().getByRole("tab", { name: /Connections/ }));
    fireEvent.click(inspector().getAllByTestId("connection")[0]!);
    expect(param("edge")).toBe(authEdge.id);
    expect(param("component")).toBeNull();
    expect(crumbs()).toEqual(["Authentication Service", authEdge.kind]);
    expect(screen.getByTestId("panel-back")).toBeTruthy();

    // edge view: the endpoint opens that component
    fireEvent.click(inspector().getByTestId("endpoint-to"));
    expect(param("component")).toBe(target.id);
    expect(crumbs()).toEqual(["Authentication Service", authEdge.kind, target.name]);

    // browser back → the edge
    act(() => window.history.back());
    await waitFor(() => expect(crumbs()).toEqual(["Authentication Service", authEdge.kind]));
    expect(param("edge")).toBe(authEdge.id);

    // crumb jump to the root → back on the component, Connections tab restored
    fireEvent.click(screen.getAllByTestId("crumb")[0]!);
    await waitFor(() => expect(crumbs()).toEqual(["Authentication Service"]));
    expect(param("component")).toBe(AUTH);
    expect(inspector().getByRole("tab", { name: /Connections/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("the back arrow steps back one level", async () => {
    renderAt(`?component=${AUTH}`);
    fireEvent.click(inspector().getByRole("tab", { name: /Connections/ }));
    fireEvent.click(inspector().getAllByTestId("connection")[0]!);
    fireEvent.click(screen.getByTestId("panel-back"));
    await waitFor(() => expect(crumbs()).toEqual(["Authentication Service"]));
    expect(param("component")).toBe(AUTH);
  });

  it("Esc closes the panel and drops ?component=; browser back reopens it", async () => {
    renderAt(`?component=${AUTH}`);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(crumbs()).toEqual([]);
    expect(param("component")).toBeNull();
    act(() => window.history.back());
    await waitFor(() => expect(crumbs()).toEqual(["Authentication Service"]));
  });

  it("a deep-linked edge starts its breadcrumb at the edge", () => {
    renderAt(`?edge=${encodeURIComponent(authEdge.id)}`);
    const source = snapshot.components.find((c) => c.id === authEdge.source)!.name;
    const target = snapshot.components.find((c) => c.id === authEdge.target)!.name;
    expect(crumbs()).toEqual([`${source} → ${target}`]);
    expect(screen.queryByTestId("panel-back")).toBeNull();
  });
});
