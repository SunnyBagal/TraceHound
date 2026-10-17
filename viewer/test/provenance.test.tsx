import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { TopBar } from "@/components/TopBar";
import { NameSourceBadge } from "@/components/NameSourceBadge";
import { modelDisplayName } from "@/lib/naming";
import { commitHref, provenanceLabel } from "@/lib/provenance";
import { repoSnapshot } from "./repo-snapshot";

afterEach(cleanup);

it("identifies Nemotron 3 Super when disclosing model-written prose", () => {
  const model = "nvidia/nemotron-3-super-120b-a12b";
  expect(modelDisplayName(model)).toBe("Nemotron 3 Super");
  render(<NameSourceBadge naming={{ source: "llm", model, heuristicName: "Shared Utilities" }} />);
  expect(screen.getByText("Named by Nemotron 3 Super").getAttribute("title")).toBe("Name written by the model; prose not verified");
});

it("labels the analyzed commit using its branch and commit date, linking to the commit", () => {
  const s = repoSnapshot("recall");
  const repo = { ...s.repo, branch: "main", commitDate: "2026-10-14T18:30:00Z", commitSha: "5d2165aa9654f17a148f6663bc478a3fd9f7fc6b" };
  expect(provenanceLabel(repo)).toBe("main @ 5d2165a · 14 Oct 2026");
  render(<TopBar snapshot={{ ...s, repo }} />);
  expect(screen.getByText(provenanceLabel(repo)).closest("a")?.getAttribute("href")).toBe(commitHref(repo));
  expect(screen.queryByRole("button", { name: /Copy commit/ })).toBeNull();
});

it("does not invent a branch or date for older snapshots", () => {
  expect(provenanceLabel({ name: "test", commitSha: "a".repeat(40) })).toBe("commit @ aaaaaaa");
});

it("keeps the commit's calendar date across timezone offsets", () => {
  expect(provenanceLabel({ name: "Recall", commitSha: "2".repeat(40), branch: "main", commitDate: "2026-10-07T03:08:24+05:30" })).toBe("main @ 2222222 · 7 Oct 2026");
});
