import { readFileSync } from "node:fs";
import path from "node:path";
import { Snapshot, SnapshotManifest } from "@tracehound/analyzer/schema";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RepoSwitcher } from "@/components/RepoSwitcher";
import { Viewer } from "@/components/Viewer";
import { ChangeSetIndex } from "@/lib/changes";
import { entryFromSearch, searchFor } from "@/lib/navigation";
import { repoHref, repoList, resolveRepo } from "@/lib/repos";

const ROOT = path.resolve(import.meta.dirname, "../..");
const manifest = SnapshotManifest.parse(JSON.parse(readFileSync(path.join(ROOT, "snapshots/index.json"), "utf8")));
const changeSets = ChangeSetIndex.parse(JSON.parse(readFileSync(path.join(ROOT, "changesets/index.json"), "utf8")));
const repos = repoList(manifest);
const snap = (id: string) => Snapshot.parse(JSON.parse(readFileSync(path.join(ROOT, "snapshots", repos.find((r) => r.id === id)!.latest.path), "utf8")));

describe("repo resolution (?repo=, defaultRepo)", () => {
  it("the site opens on Recall", () => {
    expect(manifest.defaultRepo).toBe("recall");
    expect(resolveRepo("", manifest)?.name).toBe("SunnyBagal/Recall");
  });

  it("?repo=<id> picks that repo; an unknown id falls back to the default", () => {
    expect(resolveRepo("?repo=cex-v2-boilercode", manifest)?.latest.path).toBe("da0e3d640a9c02f815fcca48f8328c94558cc058/0.9.0.json");
    expect(resolveRepo("?repo=nope", manifest)?.id).toBe("recall");
  });

  it("an index without repos (pre-0.9.0) still yields its latest", () => {
    // built from the CEX entry, not the committed top-level `latest` (which follows defaultRepo)
    const old = { ...manifest, latest: manifest.repos!.find((r) => r.id === "cex-v2-boilercode")!.latest, repos: undefined, defaultRepo: undefined };
    expect(repoList(old).map((r) => r.id)).toEqual(["cex-v2-boilercode"]);
    expect(resolveRepo("?repo=recall", old)?.id).toBe("cex-v2-boilercode");
  });

  it("switching repo drops ids of the other repo and keeps the rest", () => {
    expect(repoHref("/", "?component=backend:auth-api&edge=x&impact=seed-queue-consumer&foo=1", "recall")).toBe("/?foo=1&repo=recall");
    expect(repoHref("/", "?repo=recall&changes=recall-7943212", "cex-v2-boilercode", "cex-seed-queue-consumer")).toBe("/?repo=cex-v2-boilercode&changes=cex-seed-queue-consumer");
  });
});

describe("deep links within the chosen repo", () => {
  it("?component= resolves against the repo on screen", () => {
    const recall = snap("recall");
    const cex = snap("cex-v2-boilercode");
    expect(entryFromSearch("?repo=recall&component=recall-backend:worker", recall)).toEqual({ type: "node", id: "recall-backend:worker" });
    expect(entryFromSearch("?repo=recall&component=backend:auth-api", recall)).toBeNull();
    expect(entryFromSearch("?repo=cex-v2-boilercode&component=backend:auth-api", cex)).toEqual({ type: "node", id: "backend:auth-api" });
  });

  it("opening or closing a component keeps ?repo= and ?changes=", () => {
    expect(searchFor("?repo=recall&changes=recall-worker-deleted", { type: "node", id: "recall-backend:worker" })).toBe("?repo=recall&changes=recall-worker-deleted&component=recall-backend%3Aworker");
    expect(searchFor("?repo=recall&changes=recall-worker-deleted&component=x", undefined)).toBe("?repo=recall&changes=recall-worker-deleted");
  });
});

describe("repo switcher", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
  });

  it("lists every repo with its change sets, marks the current one, and links with ?repo=", () => {
    window.history.replaceState(null, "", "/?repo=recall&component=recall-backend:worker");
    render(<RepoSwitcher repos={repos} repoId="recall" label="SunnyBagal/Recall" changeSets={changeSets} />);
    fireEvent.click(screen.getByTestId("repo-switcher"));
    const options = screen.getAllByTestId("repo-option");
    expect(options.map((o) => o.dataset.repoId)).toEqual(["cex-v2-boilercode", "recall"]);
    const recall = within(options[1]!);
    expect(recall.getByLabelText("current repo")).toBeTruthy();
    expect(within(options[0]!).getByRole("link", { name: /cex-v2-boilercode/ }).getAttribute("href")).toBe("/?repo=cex-v2-boilercode");
    expect(recall.getAllByTestId("changeset-link").map((a) => a.getAttribute("href"))).toEqual([
      "/?repo=recall&changes=recall-worker-deleted",
      "/?repo=recall&changes=recall-7943212",
      "/?repo=recall&changes=recall-5d2165a",
    ]);
    // a change set of a repo with no published snapshot is still reachable
    expect(screen.getByText(/No published snapshot/i)).toBeTruthy();
  });

  it("the header shows the repo switcher, not the product name", () => {
    window.history.replaceState(null, "", "/");
    render(
      <div style={{ width: 1400, height: 900 }}>
        <Viewer snapshot={snap("recall")} repos={repos} repoId="recall" changeSets={changeSets} />
      </div>,
    );
    const header = screen.getByRole("banner");
    expect(within(header).getByTestId("repo-switcher").textContent).toBe("SunnyBagal/Recall");
    expect(header.textContent).not.toMatch(/TraceHound/);
  });
});
